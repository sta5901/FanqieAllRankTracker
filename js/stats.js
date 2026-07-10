/**
 * js/stats.js
 * 番茄小说四榜数据图表页
 * 依赖: ECharts 5 (CDN), Tabler Icons (CDN)
 */

// ─── 全局状态 ────────────────────────────────────────────────────────────────
const ALL_LISTS = ['male_new', 'male_read', 'female_new', 'female_read'];
const LIST_CONFIG = window.FANQIE_LISTS_STATS || {};
const LIST_NAMES = {
    male_new: '男频新书榜',
    male_read: '男频阅读榜',
    female_new: '女频新书榜',
    female_read: '女频阅读榜',
};
const LIST_COLORS = {
    male_new: '#3B82F6',
    male_read: '#10B981',
    female_new: '#EC4899',
    female_read: '#F59E0B',
};
const CHART_COLORS = ['#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4'];

let currentListKey = localStorage.getItem('stats_list_key') || 'male_new';
let allCharts = {};
let allStatsData = {};

// ─── ECharts 公共配置 ────────────────────────────────────────────────────────
function getChartTheme(listKey) {
    const primary = LIST_COLORS[listKey] || '#EC4899';
    return {
        color: CHART_COLORS,
        textStyle: {
            fontFamily: '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif',
            color: '#94A3B8',
        },
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(20,22,38,0.95)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            textStyle: { color: '#E2E8F0', fontSize: 12 },
            axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(200,200,255,0.05)' } },
        },
        legend: {
            textStyle: { color: '#94A3B8', fontSize: 11 },
            top: 0,
        },
        grid: { left: '3%', right: '4%', bottom: '8%', top: '18%', containLabel: true },
    };
}

function tooltipFormatter(params, unit = '') {
    let result = `<strong>${params[0].axisValue}</strong><br/>`;
    params.forEach(p => {
        const color = p.color.colorStops ? p.color.colorStops[0].color : p.color;
        result += `<span style="display:inline-block;margin-right:4px;border-radius:50%;width:10px;height:10px;background-color:${color};"></span>${p.seriesName}: ${unit}${typeof p.value === 'number' ? p.value.toLocaleString() : p.value}<br/>`;
    });
    return result;
}

// ─── 初始化 ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    bindTabs();
    await loadAllStats();
    await switchList(currentListKey);
});

// ─── Tab 绑定 ────────────────────────────────────────────────────────────────
function bindTabs() {
    const tabs = document.querySelectorAll('#stats-rank-tabs .list-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            const key = tab.dataset.key;
            if (key === currentListKey) return;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentListKey = key;
            localStorage.setItem('stats_list_key', key);
            await switchList(key);
        });
    });

    // 恢复 Tab 状态
    const activeTab = document.querySelector(`#stats-rank-tabs .list-tab[data-key="${currentListKey}"]`);
    if (activeTab) {
        tabs.forEach(t => t.classList.remove('active'));
        activeTab.classList.add('active');
    }
}

// ─── 切换榜单 ────────────────────────────────────────────────────────────────
async function switchList(listKey) {
    const subtitle = document.getElementById('stats-subtitle');
    subtitle.textContent = `${LIST_NAMES[listKey] || listKey} · 数据加载中...`;

    const statsData = allStatsData[listKey];
    if (!statsData) {
        subtitle.textContent = `${LIST_NAMES[listKey] || listKey} · 暂无数据`;
        return;
    }

    updateOverview(statsData, listKey);

    const theme = getChartTheme(listKey);

    // 图表一：分类在读柱状图
    renderCategoryBar(theme, statsData);

    // 图表二：Top 20 书籍
    renderTopBooks(theme, statsData);

    // 图表三：趋势线图（异步加载历史数据）
    await renderTrendLine(theme, listKey);

    // 图表四：分类最高/最低/均值
    renderCategoryStats(theme, statsData);

    // 图表五：四榜雷达（已在 loadAllStats 时构建）
    renderRadar(theme);

    subtitle.textContent = `${LIST_NAMES[listKey] || listKey} · 更新于 ${statsData.date || ''}`;
}

// ─── 概览数字 ────────────────────────────────────────────────────────────────
function updateOverview(data, listKey) {
    document.getElementById('total-books').textContent = (data.total_books || 0).toLocaleString();
    document.getElementById('total-cats').textContent = data.total_categories || 0;

    // 计算总在读（从 category_reads 累加）
    const totalReads = (data.category_reads || []).reduce((s, c) => s + (c.total_reads || 0), 0);
    document.getElementById('total-reads').textContent = formatReads(totalReads);

    // 更新概览文字
    const summaryEl = document.getElementById('stats-summary-text');
    const sourceEl = document.getElementById('stats-source');
    if (summaryEl) {
        const avgReads = data.total_books
            ? Math.round(totalReads / data.total_books)
            : 0;
        summaryEl.innerHTML = `本期共收录 <strong>${data.total_books || 0}</strong> 部作品，覆盖 <strong>${data.total_categories || 0}</strong> 个分类，平均在读约 <strong>${formatReads(avgReads)}</strong>。`;
    }
    if (sourceEl) {
        sourceEl.textContent = LIST_NAMES[listKey] || listKey;
    }
}

// ─── 图表一：分类在读柱状图（竖向，显示所有分类） ──────────────────────────
function renderCategoryBar(theme, data) {
    const el = document.getElementById('chart-category-bar');
    if (!el) return;

    if (!data.category_reads || data.category_reads.length === 0) {
        el.innerHTML = '<div class="empty-state-text"><i class="ti ti-chart-bar-off"></i> 暂无分类数据</div>';
        return;
    }

    if (!allCharts['category-bar']) {
        allCharts['category-bar'] = echarts.init(el);
    }

    const chart = allCharts['category-bar'];
    // 显示所有分类
    const cats = data.category_reads.map(c => c.category || c.name);
    const values = data.category_reads.map(c => Math.round((c.total_reads || 0) / 10000)); // 转为万

    chart.setOption({
        ...theme,
        tooltip: {
            ...theme.tooltip,
            formatter: params => tooltipFormatter(params, '万'),
        },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        xAxis: {
            type: 'category',
            data: cats,
            axisLabel: {
                color: '#94A3B8',
                fontSize: 11,
                rotate: 35,
                interval: 0,
            },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
            type: 'value',
            axisLabel: { color: '#64748B', formatter: v => v + '万' },
            splitLine: { lineStyle: { color: 'rgba(100,116,139,0.1)' } },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        series: [{
            type: 'bar',
            data: values,
            itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: LIST_COLORS[currentListKey] || '#3B82F6' },
                    { offset: 1, color: (LIST_COLORS[currentListKey] || '#3B82F6') + '66' },
                ]),
                borderRadius: [4, 4, 0, 0],
            },
            barMaxWidth: 40,
            label: {
                show: true,
                position: 'top',
                color: '#94A3B8',
                fontSize: 10,
                formatter: params => params.value > 0 ? params.value + '万' : '',
            },
        }],
    });
}

// ─── 图表二：Top 20 书籍（竖向柱状图，显示全部20本） ─────────────────────
function renderTopBooks(theme, data) {
    const el = document.getElementById('chart-top-books');
    if (!el) return;

    if (!data.top_books || data.top_books.length === 0) {
        el.innerHTML = '<div class="empty-state-text"><i class="ti ti-book-off"></i> 暂无书籍数据</div>';
        return;
    }

    if (!allCharts['top-books']) {
        allCharts['top-books'] = echarts.init(el);
    }

    const chart = allCharts['top-books'];
    const books = data.top_books.slice(0, 20);
    const names = books.map((b, i) =>
        (b.title || '').length > 8 ? b.title.slice(0, 8) + '…' : b.title || `#${i + 1}`
    );
    const values = books.map(b => Math.round((b.reads || b.reads_value || 0) / 10000));

    chart.setOption({
        ...theme,
        tooltip: {
            ...theme.tooltip,
            trigger: 'item',
            formatter: params => {
                const b = books[params.dataIndex];
                return `<strong>${b.title || ''}</strong><br/>作者：${b.author || '未知'}<br/>在读：${b.reads_str || '未知'}<br/>分类：${b.category || ''}`;
            },
        },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        xAxis: {
            type: 'category',
            data: names,
            axisLabel: {
                color: '#94A3B8',
                fontSize: 10,
                rotate: 45,
                interval: 0,
            },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
            type: 'value',
            axisLabel: { color: '#64748B', formatter: v => v + '万' },
            splitLine: { lineStyle: { color: 'rgba(100,116,139,0.1)' } },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        series: [{
            type: 'bar',
            data: values,
            itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: '#F59E0B' },
                    { offset: 1, color: '#FBBF2466' },
                ]),
                borderRadius: [4, 4, 0, 0],
            },
            barMaxWidth: 24,
            label: {
                show: true,
                position: 'top',
                color: '#94A3B8',
                fontSize: 9,
                formatter: params => params.value > 0 ? params.value + '万' : '',
            },
        }],
    });
}

// ─── 图表三：趋势线图 ───────────────────────────────────────────────────────
async function renderTrendLine(theme, listKey) {
    const el = document.getElementById('chart-trend-line');
    if (!el) return;

    if (!allCharts['trend-line']) {
        allCharts['trend-line'] = echarts.init(el);
    }

    // 从 dates.json 获取可用日期
    let availableDates = [];
    try {
        const idx = await fetch(`data/dates.json?v=${Date.now()}`).then(r => r.json());
        const listDates = idx.lists && idx.lists[listKey] && idx.lists[listKey].dates;
        availableDates = listDates ? listDates.slice().sort().slice(-14) : [];
    } catch {
        availableDates = [];
    }

    if (availableDates.length < 2) {
        el.innerHTML = '<div class="empty-state-text"><i class="ti ti-trending-up"></i> 暂无历史趋势数据</div>';
        return;
    }

    // 并行加载所有日期的快照
    const snapshots = await Promise.all(
        availableDates.map(date => {
            const ymd = date.replace(/-/g, '');
            return fetch(`data/fanqie_${listKey}_ranks_${ymd}.json?v=${Date.now()}`)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null);
        })
    );

    // 收集所有分类
    const allCats = new Set();
    snapshots.forEach(snap => {
        if (!snap || !snap.categories) return;
        snap.categories.forEach(cat => allCats.add(cat.name));
    });
    const topCats = Array.from(allCats).slice(0, 8); // 最多 8 条线

    // 构建每个分类的时间序列
    const series = topCats.map((cat, idx) => ({
        name: cat,
        type: 'line',
        smooth: 0.4,
        data: availableDates.map((date, di) => {
            const snap = snapshots[di];
            if (!snap || !snap.categories) return null;
            const catData = snap.categories.find(c => c.name === cat);
            if (!catData || !catData.books) return null;
            return Math.round(
                catData.books.reduce((s, b) => s + parseFloat(b.reads || 0), 0) / 10000
            );
        }),
        itemStyle: { color: CHART_COLORS[idx % CHART_COLORS.length] },
        lineStyle: { width: 2 },
        showSymbol: availableDates.length <= 7,
        areaStyle: null,
    }));

    const chart = allCharts['trend-line'];
    chart.setOption({
        ...theme,
        legend: {
            ...theme.legend,
            data: topCats,
            type: 'scroll',
            pageTextStyle: { color: '#94A3B8' },
        },
        tooltip: {
            ...theme.tooltip,
            formatter: params => tooltipFormatter(params, '万'),
        },
        xAxis: {
            type: 'category',
            data: availableDates,
            boundaryGap: false,
            axisLabel: { color: '#64748B' },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
            type: 'value',
            axisLabel: { color: '#64748B', formatter: v => v + '万' },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        series,
    });
}

// ─── 图表四：分类最高/最低/均值在读（柱状+折线混合图） ─────────────────────
function renderCategoryStats(theme, data) {
    const el = document.getElementById('chart-category-stats');
    if (!el) return;

    if (!data.category_reads || data.category_reads.length === 0) {
        el.innerHTML = '<div class="empty-state-text"><i class="ti ti-chart-dots"></i> 暂无分类数据</div>';
        return;
    }

    // 检查数据是否包含 max/min/avg 字段（新数据才有）
    const hasStats = data.category_reads[0] && 'max_reads' in data.category_reads[0];
    if (!hasStats) {
        el.innerHTML = '<div class="empty-state-text"><i class="ti ti-alert-circle"></i> 需要重新生成统计数据<br/><small>请运行 python scripts/build_latest.py</small></div>';
        return;
    }

    if (!allCharts['category-stats']) {
        allCharts['category-stats'] = echarts.init(el);
    }

    const chart = allCharts['category-stats'];
    const cats = data.category_reads.map(c => c.category || c.name);
    const maxValues = data.category_reads.map(c => Math.round((c.max_reads || 0) / 10000));
    const minValues = data.category_reads.map(c => Math.round((c.min_reads || 0) / 10000));
    const avgValues = data.category_reads.map(c => Math.round((c.avg_reads || 0) / 10000));

    chart.setOption({
        ...theme,
        legend: {
            ...theme.legend,
            data: ['最高在读', '最低在读', '均值在读'],
        },
        tooltip: {
            ...theme.tooltip,
            formatter: params => {
                let result = `<strong>${params[0].axisValue}</strong><br/>`;
                params.forEach(p => {
                    const color = p.color.colorStops ? p.color.colorStops[0].color : p.color;
                    result += `<span style="display:inline-block;margin-right:4px;border-radius:50%;width:10px;height:10px;background-color:${color};"></span>${p.seriesName}: ${p.value}万<br/>`;
                });
                return result;
            },
        },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
        xAxis: {
            type: 'category',
            data: cats,
            axisLabel: {
                color: '#94A3B8',
                fontSize: 10,
                rotate: 35,
                interval: 0,
            },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
            type: 'value',
            axisLabel: { color: '#64748B', formatter: v => v + '万' },
            splitLine: { lineStyle: { color: 'rgba(100,116,139,0.1)' } },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        series: [
            {
                name: '最高在读',
                type: 'bar',
                data: maxValues,
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#EF4444' },
                        { offset: 1, color: '#EF444466' },
                    ]),
                    borderRadius: [4, 4, 0, 0],
                },
                barMaxWidth: 20,
            },
            {
                name: '最低在读',
                type: 'bar',
                data: minValues,
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#3B82F6' },
                        { offset: 1, color: '#3B82F666' },
                    ]),
                    borderRadius: [4, 4, 0, 0],
                },
                barMaxWidth: 20,
            },
            {
                name: '均值在读',
                type: 'line',
                data: avgValues,
                smooth: true,
                lineStyle: { width: 2, color: '#10B981' },
                itemStyle: { color: '#10B981' },
                symbol: 'circle',
                symbolSize: 5,
            },
        ],
    });
}

// ─── 图表五：四榜雷达对比 ───────────────────────────────────────────────────
function renderRadar(theme) {
    const el = document.getElementById('chart-radar-compare');
    if (!el) return;

    // 收集四榜数据
    const lists = ALL_LISTS.filter(lk => allStatsData[lk]);
    if (lists.length < 2) {
        el.innerHTML = '<div class="empty-state-text"><i class="ti ti-radar"></i> 数据不足，请确保至少两榜已有数据</div>';
        return;
    }

    if (!allCharts['radar']) {
        allCharts['radar'] = echarts.init(el);
    }

    // 取所有榜单的分类并集（显示所有分类）
    const allCats = new Set();
    lists.forEach(lk => {
        (allStatsData[lk].category_reads || []).forEach(c => allCats.add(c.category || c.name));
    });
    const radarCats = Array.from(allCats);

    // 找各榜最大值用于归一化
    const maxVal = Math.max(...lists.map(lk =>
        Math.max(...(allStatsData[lk].category_reads || []).map(c => c.total_reads || 0))
    ));

    const indicator = radarCats.map(cat => ({
        name: cat,
        max: Math.round(maxVal / 10000 * 1.2),
    }));

    // 四榜颜色已改为高区分度：蓝/绿/粉/橙
    const series = lists.map(lk => {
        const reads = radarCats.map(cat => {
            const c = (allStatsData[lk].category_reads || []).find(x => (x.category || x.name) === cat);
            return c ? Math.round((c.total_reads || 0) / 10000) : 0;
        });
        const color = LIST_COLORS[lk] || '#3B82F6';
        return {
            value: reads,
            name: LIST_NAMES[lk] || lk,
            type: 'radar',
            lineStyle: { width: 2, color },
            itemStyle: { color },
            areaStyle: { color: color + '22' },
            symbol: 'circle',
            symbolSize: 5,
        };
    });

    const chart = allCharts['radar'];
    chart.setOption({
        ...theme,
        legend: {
            ...theme.legend,
            data: lists.map(lk => LIST_NAMES[lk] || lk),
            top: 0,
        },
        tooltip: {
            ...theme.tooltip,
            trigger: 'item',
            formatter: params => {
                const reads = params.value;
                let html = `<strong>${params.name}</strong><br/>`;
                radarCats.forEach((cat, i) => {
                    html += `${cat}: ${reads[i]}万<br/>`;
                });
                return html;
            },
        },
        radar: {
            indicator,
            center: ['50%', '55%'],
            radius: '82%',
            axisName: { color: '#64748B', fontSize: 11 },
            splitArea: { areaStyle: { color: ['rgba(255,255,255,0.03)', 'rgba(0,0,0,0.02)'] } },
            splitLine: { lineStyle: { color: 'rgba(100,116,139,0.15)' } },
            axisLine: { lineStyle: { color: 'rgba(100,116,139,0.15)' } },
            splitNumber: 5,
        },
        series: [{ type: 'radar', data: series }],
    });
}

// ─── 预加载四榜所有 stats 数据 ───────────────────────────────────────────────
async function loadAllStats() {
    const results = await Promise.allSettled(
        ALL_LISTS.map(key =>
            fetch(`data/stats_${key}.json?v=${Date.now()}`)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
        )
    );
    results.forEach((res, i) => {
        if (res.status === 'fulfilled' && res.value) {
            allStatsData[ALL_LISTS[i]] = res.value;
        }
    });
}

// ─── 工具函数 ───────────────────────────────────────────────────────────────
function formatReads(num) {
    if (!num) return '0';
    if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    return num.toLocaleString();
}

// ─── 响应式 ─────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    Object.values(allCharts).forEach(chart => {
        if (chart && chart.resize) chart.resize();
    });
});
