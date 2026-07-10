/**
 * js/stats.js
 * 番茄小说四榜数据图表页
 * 依赖: ECharts 5 (CDN), Tabler Icons (CDN)
 */

// ─── 全局状态 ────────────────────────────────────────────────────────────────
const ALL_LISTS = ['female_new', 'female_read', 'male_new', 'male_read'];
const LIST_CONFIG = window.FANQIE_LISTS_STATS || {};
const LIST_NAMES = {
    female_new: '女频新书榜',
    female_read: '女频阅读榜',
    male_new: '男频新书榜',
    male_read: '男频阅读榜',
};
const LIST_COLORS = {
    female_new: '#EC4899',
    female_read: '#DB2777',
    male_new: '#3B82F6',
    male_read: '#2563EB',
};
const CHART_COLORS = ['#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4'];

let currentListKey = localStorage.getItem('stats_list_key') || 'female_new';
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
    const tabs = document.querySelectorAll('#stats-rank-tabs .rank-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            const key = tab.dataset.list;
            if (key === currentListKey) return;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentListKey = key;
            localStorage.setItem('stats_list_key', key);
            await switchList(key);
        });
    });

    // 恢复 Tab 状态
    const activeTab = document.querySelector(`#stats-rank-tabs .rank-tab[data-list="${currentListKey}"]`);
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

    // 图表四：热力图
    renderHeatmap(theme, listKey);

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

    // 平均在读
    const avgReads = data.total_books
        ? Math.round(totalReads / data.total_books)
        : 0;
    document.getElementById('avg-reads').textContent = formatReads(avgReads);
}

// ─── 图表一：分类在读柱状图 ─────────────────────────────────────────────────
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
    const cats = data.category_reads
        .slice(0, 15)
        .map(c => c.category || c.name)
        .reverse();
    const values = data.category_reads
        .slice(0, 15)
        .map(c => Math.round((c.total_reads || 0) / 10000)); // 转为万

    chart.setOption({
        ...theme,
        tooltip: {
            ...theme.tooltip,
            formatter: params => tooltipFormatter(params, '万'),
        },
        xAxis: {
            type: 'value',
            axisLabel: { color: '#64748B', formatter: v => v + '万' },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
            type: 'category',
            data: cats,
            axisLabel: { color: '#94A3B8', fontSize: 11 },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        series: [{
            type: 'bar',
            data: values,
            itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: LIST_COLORS[currentListKey] || '#EC4899' },
                    { offset: 1, color: (LIST_COLORS[currentListKey] || '#EC4899') + '88' },
                ]),
                borderRadius: [0, 4, 4, 0],
            },
            barMaxWidth: 28,
        }],
    });
}

// ─── 图表二：Top 20 书籍 ────────────────────────────────────────────────────
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
        (b.title || '').length > 10 ? b.title.slice(0, 10) + '…' : b.title || `#${i + 1}`
    ).reverse();
    const values = books.map(b => Math.round((b.reads || b.reads_value || 0) / 10000)).reverse();

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
        xAxis: {
            type: 'value',
            axisLabel: { color: '#64748B', formatter: v => v + '万' },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
            type: 'category',
            data: names,
            axisLabel: { color: '#94A3B8', fontSize: 10 },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        series: [{
            type: 'bar',
            data: values,
            itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: '#F59E0B' },
                    { offset: 1, color: '#FBBF24' },
                ]),
                borderRadius: [0, 4, 4, 0],
            },
            barMaxWidth: 22,
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

// ─── 图表四：分类热力图 ─────────────────────────────────────────────────────
function renderHeatmap(theme, listKey) {
    const el = document.getElementById('chart-heatmap');
    if (!el) return;

    const stats = allStatsData[listKey];
    if (!stats || !stats.category_reads || stats.category_reads.length === 0) {
        el.innerHTML = '<div class="empty-state-text"><i class="ti ti-flame"></i> 暂无热力数据</div>';
        return;
    }

    if (!allCharts['heatmap']) {
        allCharts['heatmap'] = echarts.init(el);
    }

    const chart = allCharts['heatmap'];
    const cats = stats.category_reads.slice(0, 12).map(c => c.category || c.name);
    const ranges = ['Top5', 'Top10', 'Top20', 'Top30'];

    // 估算各区间的 reads（Top5 = 最高值*1.5 均摊，递减）
    const maxReads = stats.category_reads[0]?.total_reads || 1;
    const heatData = [];
    cats.forEach((cat, ci) => {
        ranges.forEach((range, ri) => {
            const multiplier = [0.5, 0.3, 0.15, 0.05][ri];
            const catReads = (stats.category_reads[ci]?.total_reads || 0);
            heatData.push([ri, ci, Math.round(catReads * multiplier / 10000)]);
        });
    });

    chart.setOption({
        ...theme,
        tooltip: {
            ...theme.tooltip,
            formatter: params => {
                return `<strong>${cats[params.value[1]]} · ${ranges[params.value[0]]}</strong><br/>在读：${params.value[2]}万`;
            },
        },
        grid: { left: '3%', right: '10%', bottom: '15%', top: '5%', containLabel: true },
        xAxis: {
            type: 'category',
            data: ranges,
            axisLabel: { color: '#94A3B8' },
            axisLine: { lineStyle: { color: '#334155' } },
            splitArea: { show: true, areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(0,0,0,0)'] } },
        },
        yAxis: {
            type: 'category',
            data: cats,
            axisLabel: { color: '#94A3B8', fontSize: 10 },
            axisLine: { lineStyle: { color: '#334155' } },
            splitArea: { show: true, areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(0,0,0,0)'] } },
        },
        visualMap: {
            min: 0,
            max: Math.round(maxReads / 10000),
            text: { '高': '#EC4899', '低': '#1E293B' },
            textStyle: { color: '#94A3B8' },
            inRange: { color: ['#1E293B', '#4C1D95', '#BE185D', '#EC4899'] },
            calculable: false,
            orient: 'vertical',
            right: 0,
            top: 'center',
        },
        series: [{
            type: 'heatmap',
            data: heatData,
            label: {
                show: true,
                formatter: params => params.value[2] > 0 ? params.value[2] + '万' : '',
                color: '#E2E8F0',
                fontSize: 9,
            },
            itemStyle: {
                borderColor: 'rgba(30,34,51,0.8)',
                borderWidth: 1,
                borderRadius: 2,
            },
            emphasis: {
                itemStyle: { shadowBlur: 8, shadowColor: 'rgba(236,72,153,0.4)' },
            },
        }],
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

    // 取所有榜单并集 Top 8 分类
    const allCats = new Set();
    lists.forEach(lk => {
        (allStatsData[lk].category_reads || []).slice(0, 8).forEach(c => allCats.add(c.category || c.name));
    });
    const radarCats = Array.from(allCats).slice(0, 10);

    // 找各榜最大值用于归一化
    const maxVal = Math.max(...lists.map(lk =>
        Math.max(...(allStatsData[lk].category_reads || []).map(c => c.total_reads || 0))
    ));

    const indicator = radarCats.map(cat => ({
        name: cat,
        max: Math.round(maxVal / 10000 * 1.2),
    }));

    const series = lists.map(lk => {
        const reads = radarCats.map(cat => {
            const c = (allStatsData[lk].category_reads || []).find(x => (x.category || x.name) === cat);
            return c ? Math.round((c.total_reads || 0) / 10000) : 0;
        });
        return {
            value: reads,
            name: LIST_NAMES[lk] || lk,
            type: 'radar',
            lineStyle: { width: 2, color: LIST_COLORS[lk] },
            itemStyle: { color: LIST_COLORS[lk] },
            areaStyle: { color: (LIST_COLORS[lk] || '#EC4899') + '33' },
            symbol: 'circle',
            symbolSize: 4,
        };
    });

    const chart = allCharts['radar'];
    chart.setOption({
        ...theme,
        legend: {
            ...theme.legend,
            data: lists.map(lk => LIST_NAMES[lk] || lk),
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
            axisName: { color: '#94A3B8', fontSize: 10 },
            splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(0,0,0,0)'] } },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
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
