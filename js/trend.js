document.addEventListener('DOMContentLoaded', () => {
    // ─────────────────────────────────────────────────────────────────────────
    // 常量
    // ─────────────────────────────────────────────────────────────────────────
    const LISTS = window.FANQIE_LISTS || {
        female_new: { name: "女频新书榜", file_key: "female_new", color: "#EC4899" },
        female_read: { name: "女频阅读榜", file_key: "female_read", color: "#F472B6" },
        male_new: { name: "男频新书榜", file_key: "male_new", color: "#3B82F6" },
        male_read: { name: "男频阅读榜", file_key: "male_read", color: "#60A5FA" },
    };

    const cacheBuster = `v=${Math.floor(Date.now() / 600000)}`;

    const FEMALE_GENRE_GROUPS = [
        { name: '古风言情', categories: ['古风世情', '古言脑洞', '宫斗宅斗', '种田'] },
        { name: '现代言情', categories: ['现言脑洞', '豪门总裁', '职场婚恋', '青春甜宠'] },
        { name: '幻想言情', categories: ['玄幻言情', '科幻末世', '悬疑脑洞', '女频悬疑'] },
        { name: '快穿衍生', categories: ['快穿', '女频衍生'] },
        { name: '年代民国', categories: ['年代', '民国言情'] },
        { name: '娱乐星光', categories: ['星光璀璨'] },
        { name: '游戏体育', categories: ['游戏体育'] },
    ];

    const MALE_GENRE_GROUPS = [
        { name: '都市异能', categories: ['都市脑洞', '都市日常', '都市种田', '都市高武', '都市修真'] },
        { name: '玄幻奇幻', categories: ['传统玄幻', '东方仙侠', '玄幻脑洞', '西方奇幻'] },
        { name: '历史军事', categories: ['历史古代', '历史脑洞', '抗战谍战', '军旅生涯'] },
        { name: '科幻末日', categories: ['科幻末世', '末世危机'] },
        { name: '游戏竞技', categories: ['游戏体育', '游戏主播'] },
        { name: '男频衍生', categories: ['男频衍生', '动漫衍生'] },
    ];

    const MARKET_KEYWORDS = [
        '重生', '穿书', '快穿', '系统', '空间', '团宠', '萌宝', '幼崽', '女配', '炮灰',
        '反派', '权臣', '宅斗', '宫斗', '和离', '替嫁', '逃荒', '种田', '美食', '经商',
        '年代', '七零', '八零', '军婚', '豪门', '总裁', '真假千金', '先婚后爱', '追妻',
        '甜宠', '双洁', '强制爱', '无CP', '末世', '废土', '天灾', '囤货', '异能',
        '国运', '星际', '修仙', '玄学', '无限流', '悬疑', '直播', '综艺', '娱乐圈',
        '校园', '暗恋', '青梅竹马', '民国', '兽世', '远古', '基建',
        '战神', '赘婿', '兵王', '修罗', '鉴宝', '风水', '赌石',
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // 状态
    // ─────────────────────────────────────────────────────────────────────────
    let currentListKey = window.CURRENT_LIST_KEY || "female_new";
    let categories = [];
    let trendRows = [];
    let latestData = null;
    let marketSummaryData = null;
    let selectedCategory = '';
    let selectedDays = 7;
    let genreGroups = FEMALE_GENRE_GROUPS;

    // ─────────────────────────────────────────────────────────────────────────
    // DOM
    // ─────────────────────────────────────────────────────────────────────────
    const listTabs = document.getElementById('list-tabs');
    const trendSubtitle = document.getElementById('trend-subtitle');
    const rangeButtons = document.querySelectorAll('.range-btn');
    const categoryButtons = document.getElementById('trend-category-buttons');

    const els = {
        marketSummary: document.getElementById('market-summary'),
        marketSource: document.getElementById('market-source'),
        hotGenres: document.getElementById('hot-genre-list'),
        hotTypes: document.getElementById('hot-type-list'),
        hotThemes: document.getElementById('hot-theme-list'),
        newBooks: document.getElementById('new-books-list'),
        risers: document.getElementById('risers-list'),
        reads: document.getElementById('reads-list'),
        summaries: document.getElementById('summary-feed'),
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 四榜 Tab 切换
    // ─────────────────────────────────────────────────────────────────────────
    function switchList(newKey) {
        if (newKey === currentListKey) return;
        currentListKey = newKey;
        genreGroups = LISTS[newKey]?.name?.includes('男') ? MALE_GENRE_GROUPS : FEMALE_GENRE_GROUPS;

        document.querySelectorAll('.list-tab').forEach(btn =>
            btn.classList.toggle('active', btn.dataset.key === newKey)
        );

        const cfg = LISTS[newKey];
        if (cfg) {
            document.title = `类型风向标 · ${cfg.name}`;
            document.documentElement.style.setProperty('--list-color', cfg.color);
            document.getElementById('trend-subtitle').textContent = '加载中...';
        }

        trendSubtitle.textContent = '加载中...';
        renderEmpty('加载中...');
        loadAll();
    }

    listTabs.addEventListener('click', e => {
        const tab = e.target.closest('.list-tab');
        if (!tab) return;
        switchList(tab.dataset.key);
    });

    // 从 URL 恢复榜单选择
    (function restoreFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const listParam = params.get('list');
        if (listParam && LISTS[listParam]) {
            switchList(listParam);
            // 更新 Tab 状态
            document.querySelectorAll('.list-tab').forEach(btn =>
                btn.classList.toggle('active', btn.dataset.key === listParam)
            );
        } else {
            // 默认 Tab 高亮
            document.documentElement.style.setProperty('--list-color', LISTS[currentListKey]?.color || '#EC4899');
        }
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // 数据加载
    // ─────────────────────────────────────────────────────────────────────────
    function fetchJson(url) {
        return fetch(url).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
            return r.json();
        });
    }

    async function loadAll() {
        try {
            const [datesIdx, latestAll, marketSummary] = await Promise.all([
                fetchJson(`data/dates.json?${cacheBuster}`),
                fetchJson(`data/latest_${currentListKey}.json?${cacheBuster}`),
                fetchJson(`data/market_summary_${currentListKey}.json?${cacheBuster}`).catch(() => null),
            ]);

            latestData = latestAll;
            marketSummaryData = marketSummary;

            // 获取分类列表（从 latest.json 的 categories 字段提取）
            categories = (latestAll.categories || []).map(cat => cat.name);

            // 获取趋势数据日期列表
            const listDates = datesIdx.lists && datesIdx.lists[currentListKey]
                ? datesIdx.lists[currentListKey].dates || []
                : (datesIdx.dates || []);
            const trendDates = listDates.slice(1); // 排除最新一天（latest 已包含）

            trendRows = await Promise.all(
                trendDates.map(date =>
                    fetchJson(`data/trends/${currentListKey}/${date}.json?${cacheBuster}`)
                        .then(item => ({ date: item.date, prevDate: item.prev_date, trends: item.trends || {} }))
                        .catch(() => null)
                )
            );
            trendRows = trendRows.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

            if (trendRows.length === 0 && categories.length === 0) {
                renderEmpty('暂无趋势数据。');
                return;
            }

            selectedCategory = getInitialCategory();
            renderCategoryButtons();
            bindEvents();
            render();
        } catch (err) {
            console.error(err);
            renderEmpty('趋势数据加载失败，请稍后刷新重试。');
        }
    }

    function getInitialCategory() {
        const params = new URLSearchParams(window.location.search);
        const type = params.get('type');
        return categories.includes(type) ? type : (categories[0] || '');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 事件绑定
    // ─────────────────────────────────────────────────────────────────────────
    function bindEvents() {
        rangeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                rangeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedDays = btn.dataset.days === 'all' ? 'all' : Number(btn.dataset.days);
                render();
            });
        });
    }

    function renderCategoryButtons() {
        categoryButtons.innerHTML = categories.map(name => `
            <button class="category-chip${name === selectedCategory ? ' active' : ''}"
                    type="button" data-type="${escapeAttr(name)}">
                ${escapeHtml(name)}
            </button>
        `).join('');

        categoryButtons.querySelectorAll('.category-chip').forEach(btn => {
            btn.addEventListener('click', () => selectCategory(btn.dataset.type));
        });
    }

    function selectCategory(type) {
        if (!categories.includes(type)) return;
        selectedCategory = type;
        const url = new URL(window.location.href);
        url.searchParams.set('type', selectedCategory);
        history.replaceState(null, '', url);
        renderCategoryButtons();
        render();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 渲染主函数
    // ─────────────────────────────────────────────────────────────────────────
    function render() {
        const rows = getWindowRows()
            .map(row => ({
                date: row.date,
                prevDate: row.prevDate,
                trend: row.trends[selectedCategory] || null,
            }))
            .filter(row => row.trend);

        if (rows.length === 0) {
            renderEmpty(`${selectedCategory} 暂无趋势数据。`);
            return;
        }

        trendSubtitle.textContent =
            `${selectedCategory} · ${rows[0].date} 至 ${rows[rows.length - 1].date} · ${rows.length} 个观察日`;

        renderMarketBoard(getWindowRows());
        renderList(els.reads, collectReads(rows));
        renderList(els.newBooks, collectNewBooks(rows));
        renderList(els.risers, collectRisers(rows));
        renderSummaries(rows);
    }

    function getWindowRows() {
        return selectedDays === 'all' ? trendRows : trendRows.slice(-selectedDays);
    }

    function summarizeRows(rows) {
        return rows.reduce((acc, row) => {
            const t = row.trend;
            const riserCount = (t.top_risers || []).length;
            const fallerCount = (t.top_fallers || []).length;
            const readCount = (t.reads_growth || []).length;
            const readGrowthTotal = (t.reads_growth || []).reduce(
                (sum, item) => sum + parseReadsGrowth(item.growth), 0
            );
            acc.newCount += Number(t.new_count || 0);
            acc.droppedCount += Number(t.dropped_count || 0);
            acc.riserCount += riserCount;
            acc.fallerCount += fallerCount;
            acc.readCount += readCount;
            acc.readGrowthTotal += readGrowthTotal;
            if ((t.new_count || 0) || (t.dropped_count || 0) || riserCount || fallerCount || readCount) {
                acc.activeDays += 1;
            }
            return acc;
        }, { newCount: 0, droppedCount: 0, riserCount: 0, fallerCount: 0, readCount: 0, readGrowthTotal: 0, activeDays: 0 });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 市场看板
    // ─────────────────────────────────────────────────────────────────────────
    function renderMarketBoard(rowsWindow) {
        const hotGenres = collectHotGenres(rowsWindow);
        const hotTypes = collectHotTypes(rowsWindow);
        const hotThemes = collectHotThemes(rowsWindow);

        if (!hotTypes.length) {
            els.marketSummary.textContent = '暂无足够数据判断全站热点。';
            els.marketSource.textContent = '暂无数据';
            els.hotGenres.innerHTML = els.hotTypes.innerHTML =
                els.hotThemes.innerHTML = '<p class="muted-line">暂无数据。</p>';
            return;
        }

        const topGenres = hotGenres.slice(0, 2).map(i => i.name).join('、');
        const topTypes = hotTypes.slice(0, 3).map(i => i.name).join('、');
        const topThemes = hotThemes.slice(0, 6).map(i => i.name).join('、');
        const period = selectedDays === 'all' ? '全部样本' : `近 ${selectedDays} 日`;
        const fallbackSummary =
            `${period}里，${topGenres || topTypes} 的阅读增长更强，` +
            `具体分类以 ${topTypes} 的新增在读更集中；` +
            `新书题材上 ${topThemes} 更高频，说明读者仍偏好强设定、强情绪钩子和明确爽点。`;

        const summaryData = getMarketSummaryForPeriod();
        els.marketSummary.textContent = summaryData ? summaryData.summary : fallbackSummary;
        els.marketSource.textContent =
            summaryData && summaryData.source === 'ai'
                ? `AI 总结 · ${summaryData.period || period}`
                : `规则统计 · ${period}`;

        els.hotGenres.innerHTML = hotGenres.slice(0, 5).map((item, index) => `
            <div class="hot-type-row hot-type-row-static genre-row">
                <span>${index + 1}</span>
                <strong>${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(item.categoryText)} · 新增在读 ${formatReads(item.readGrowthTotal)} · 增长作品 ${item.readCount}</small>
                <em>${formatReads(item.readGrowthTotal)}</em>
            </div>
        `).join('');

        els.hotTypes.innerHTML = hotTypes.slice(0, 6).map((item, index) => `
            <button class="hot-type-row" type="button" data-type="${escapeAttr(item.name)}">
                <span>${index + 1}</span>
                <strong>${escapeHtml(item.name)}</strong>
                <small>新增在读 ${formatReads(item.readGrowthTotal)} · 增长作品 ${item.readCount}</small>
                <em>${formatReads(item.readGrowthTotal)}</em>
            </button>
        `).join('');

        els.hotTypes.querySelectorAll('.hot-type-row').forEach(btn =>
            btn.addEventListener('click', () => selectCategory(btn.dataset.type))
        );

        els.hotThemes.innerHTML = hotThemes.slice(0, 14).map(item => `
            <span class="theme-chip" title="新书 ${item.count} 本，覆盖 ${item.categories.size} 个类型">
                ${escapeHtml(item.name)} <small>${item.count}</small>
            </span>
        `).join('');
    }

    function collectHotGenres(rowsWindow) {
        const hotTypes = collectHotTypes(rowsWindow);
        const hotTypeMap = new Map(hotTypes.map(i => [i.name, i]));

        return genreGroups
            .map(group => {
                const matched = group.categories
                    .filter(name => categories.includes(name))
                    .map(name => hotTypeMap.get(name) || {
                        name, score: 0, newCount: 0,
                        droppedCount: 0, readCount: 0, readGrowthTotal: 0, activeDays: 0,
                    });

                const score = matched.reduce((s, i) => s + i.score, 0);
                const lead = [...matched].sort((a, b) => b.score - a.score)[0];
                return {
                    name: group.name,
                    score,
                    newCount: matched.reduce((s, i) => s + i.newCount, 0),
                    droppedCount: matched.reduce((s, i) => s + i.droppedCount, 0),
                    readCount: matched.reduce((s, i) => s + i.readCount, 0),
                    readGrowthTotal: matched.reduce((s, i) => s + i.readGrowthTotal, 0),
                    activeDays: matched.reduce((s, i) => s + i.activeDays, 0),
                    leadCategory: lead ? lead.name : group.categories[0],
                    categoryText: matched.map(i => i.name).join(' / '),
                };
            })
            .filter(i => i.score > 0 && i.leadCategory)
            .sort((a, b) => b.score - a.score);
    }

    function collectHotTypes(rowsWindow) {
        return categories
            .map(name => {
                const rows = rowsWindow
                    .map(row => ({ trend: row.trends[name] || null }))
                    .filter(r => r.trend);
                const totals = summarizeRows(rows);
                return {
                    name,
                    score: totals.readGrowthTotal,
                    newCount: totals.newCount,
                    droppedCount: totals.droppedCount,
                    readCount: totals.readCount,
                    readGrowthTotal: totals.readGrowthTotal,
                    activeDays: totals.activeDays,
                };
            })
            .filter(i => i.readGrowthTotal > 0)
            .sort((a, b) => b.readGrowthTotal - a.readGrowthTotal || b.readCount - a.readCount);
    }

    function collectHotThemes(rowsWindow) {
        const scoreMap = new Map(MARKET_KEYWORDS.map(k => [k, { name: k, count: 0, categories: new Set() }]));
        const latestBookMap = buildLatestBookMap();

        rowsWindow.forEach(row => {
            categories.forEach(catName => {
                const trend = row.trends[catName];
                if (!trend) return;
                (trend.new_books || []).forEach(title => {
                    const book = latestBookMap.get(title) || {};
                    addThemeHits(scoreMap, `${title} ${book.intro || ''}`, catName, 1);
                });
            });
        });

        return [...scoreMap.values()]
            .filter(i => i.count > 0)
            .sort((a, b) => b.count - a.count || b.categories.size - a.categories.size);
    }

    function buildLatestBookMap() {
        const map = new Map();
        const cats = latestData && latestData.categories ? latestData.categories : [];
        cats.forEach(cat => (cat.books || []).forEach(book => {
            if (book.title) map.set(book.title, book);
        }));
        return map;
    }

    function addThemeHits(scoreMap, text, categoryName, weight) {
        MARKET_KEYWORDS.forEach(kw => {
            if (!String(text || '').includes(kw)) return;
            const item = scoreMap.get(kw);
            item.count += weight;
            item.categories.add(categoryName);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 列表数据收集
    // ─────────────────────────────────────────────────────────────────────────
    function collectNewBooks(rows) {
        const items = [];
        rows.slice().reverse().forEach(row => {
            (row.trend.new_books || []).forEach(title => {
                items.push({ title, meta: row.date, value: '新上榜' });
            });
        });
        return items.slice(0, 12);
    }

    function collectRisers(rows) {
        const map = new Map();
        rows.forEach(row => {
            (row.trend.top_risers || []).forEach(item => {
                const cur = map.get(item.title) || { title: item.title, score: 0, dates: [] };
                cur.score += parseChange(item.change);
                cur.dates.push(`${row.date} ${item.change}`);
                map.set(item.title, cur);
            });
        });
        return [...map.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map(i => ({
                title: i.title,
                meta: i.dates.slice(-2).join(' / '),
                value: `+${i.score}`,
            }));
    }

    function collectReads(rows) {
        const map = new Map();
        rows.forEach(row => {
            (row.trend.reads_growth || []).forEach(item => {
                const cur = map.get(item.title) || { title: item.title, score: 0, dates: [] };
                cur.score += parseReadsGrowth(item.growth);
                cur.dates.push(`${row.date} ${item.growth}`);
                map.set(item.title, cur);
            });
        });
        return [...map.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map(i => ({
                title: i.title,
                meta: i.dates.slice(-2).join(' / '),
                value: formatReads(i.score),
            }));
    }

    function renderList(container, items) {
        const latestBookMap = buildLatestBookMap();
        if (!items.length) {
            container.innerHTML = '<p class="muted-line">暂无明显信号。</p>';
            return;
        }
        container.innerHTML = items.map(item => {
            const book = latestBookMap.get(item.title) || {};
            const bookId = extractBookId(book.url);
            const detailUrl = bookId
                ? `book.html?id=${encodeURIComponent(bookId)}&list=${currentListKey}`
                : `book.html?title=${encodeURIComponent(item.title)}&list=${currentListKey}`;
            return `
            <a class="compact-row compact-row-link" href="${detailUrl}" target="_blank" rel="noopener">
                <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <small>${escapeHtml(item.meta)}</small>
                </div>
                <span>${escapeHtml(item.value)}</span>
            </a>`;
        }).join('');
    }

    function renderSummaries(rows) {
        const rowsWithSummary = rows.slice().reverse().filter(r => r.trend.summary).slice(0, 10);
        if (!rowsWithSummary.length) {
            els.summaries.innerHTML = '<p class="muted-line">暂无摘要数据。</p>';
            return;
        }
        els.summaries.innerHTML = rowsWithSummary.map(row => `
            <article class="summary-item">
                <time>${escapeHtml(row.date)}</time>
                <div>${renderMarkdown(row.trend.summary)}</div>
            </article>
        `).join('');
    }

    function renderEmpty(message) {
        trendSubtitle.textContent = message;
        els.marketSummary.textContent = message;
        els.marketSource.textContent = '暂无数据';
        const blank = '<p class="muted-line">暂无数据。</p>';
        [els.hotGenres, els.hotTypes, els.hotThemes].forEach(el => { el.innerHTML = blank; });
        [els.newBooks, els.risers, els.reads, els.summaries].forEach(el => { el.innerHTML = blank; });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 工具函数
    // ─────────────────────────────────────────────────────────────────────────
    function parseChange(value) {
        return Number(String(value || '0').replace('+', '')) || 0;
    }

    function parseReadsGrowth(value) {
        const raw = String(value || '0').replace('+', '').replace(',', '').trim();
        const num = parseFloat(raw);
        return Number.isNaN(num) ? 0 : raw.includes('万') ? num * 10000 : num;
    }

    function formatReads(value) {
        if (value >= 10000) return `+${(value / 10000).toFixed(1)}万`;
        return `+${Math.round(value)}`;
    }

    function getMarketSummaryForPeriod() {
        if (!marketSummaryData || !marketSummaryData.periods) return null;
        const key = selectedDays === 'all' ? 'all' : String(selectedDays);
        const item = marketSummaryData.periods[key];
        return item && item.summary ? item : null;
    }

    function extractBookId(url) {
        const match = String(url || '').match(/\/page\/(\d+)/);
        return match ? match[1] : '';
    }

    function renderMarkdown(text) {
        let html = escapeHtml(String(text || ''));
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/《(.+?)》/g, '<span class="book-mark">《$1》</span>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function escapeAttr(str) {
        return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 启动
    // ─────────────────────────────────────────────────────────────────────────
    loadAll();
});
