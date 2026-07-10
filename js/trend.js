document.addEventListener('DOMContentLoaded', () => {
    const categoryButtons = document.getElementById('trend-category-buttons');
    const subtitle = document.getElementById('trend-subtitle');
    const rangeButtons = document.querySelectorAll('.range-btn');
    const cacheBuster = `v=${Math.floor(Date.now() / 600000)}`;

    let categories = [];
    let trendRows = [];
    let latestData = null;
    let marketSummaryData = null;
    let selectedCategory = '';
    let selectedDays = 7;

    const genreGroups = [
        { name: '古风言情', categories: ['古风世情', '古言脑洞', '宫斗宅斗', '种田'] },
        { name: '现代言情', categories: ['现言脑洞', '豪门总裁', '职场婚恋', '青春甜宠'] },
        { name: '幻想言情', categories: ['玄幻言情', '科幻末世', '悬疑脑洞', '女频悬疑'] },
        { name: '快穿衍生', categories: ['快穿', '女频衍生'] },
        { name: '年代民国', categories: ['年代', '民国言情'] },
        { name: '娱乐星光', categories: ['星光璀璨'] },
        { name: '游戏体育', categories: ['游戏体育'] },
    ];

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

    init();

    async function init() {
        try {
            const [dateIndex, latestIndex, latestAll, marketSummary] = await Promise.all([
                fetchJson(`data/dates.json?${cacheBuster}`),
                fetchJson(`api/lastest.json?${cacheBuster}`).catch(() => null),
                fetchJson(`api/lastest/all.json?${cacheBuster}`)
                    .catch(() => fetchJson(`data/latest_ranks.json?${cacheBuster}`)),
                fetchJson(`data/market_summary.json?${cacheBuster}`).catch(() => null),
            ]);
            latestData = latestAll;
            marketSummaryData = marketSummary;

            categories = latestIndex && latestIndex.types
                ? latestIndex.types.filter(item => item.type !== 'all').map(item => item.type)
                : await loadCategoriesFallback();

            const dates = (dateIndex.dates || []).slice().sort();
            const trendDates = dates.slice(1);
            const trendFiles = await Promise.all(
                trendDates.map(date => fetchJson(`data/trends/${date}.json?${cacheBuster}`).catch(() => null))
            );
            trendRows = trendFiles
                .filter(Boolean)
                .map(item => ({ date: item.date, prevDate: item.prev_date, trends: item.trends || {} }))
                .sort((a, b) => a.date.localeCompare(b.date));

            if (trendRows.length === 0 || categories.length === 0) {
                renderEmpty('暂无可分析的趋势数据。');
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

    async function loadCategoriesFallback() {
        const latest = await fetchJson(`data/latest_ranks.json?${cacheBuster}`);
        return (latest.categories || []).map(cat => cat.name);
    }

    function fetchJson(url) {
        return fetch(url).then(response => {
            if (!response.ok) throw new Error(`Failed to load ${url}`);
            return response.json();
        });
    }

    function bindEvents() {
        rangeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                rangeButtons.forEach(item => item.classList.remove('active'));
                btn.classList.add('active');
                selectedDays = btn.dataset.days === 'all' ? 'all' : Number(btn.dataset.days);
                render();
            });
        });
    }

    function getInitialCategory() {
        const params = new URLSearchParams(window.location.search);
        const type = params.get('type');
        return categories.includes(type) ? type : categories[0];
    }

    function renderCategoryButtons() {
        categoryButtons.innerHTML = categories.map(name => `
            <button class="category-chip${name === selectedCategory ? ' active' : ''}" type="button" data-type="${escapeAttr(name)}">
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

        subtitle.textContent = `${selectedCategory} · ${rows[0].date} 至 ${rows[rows.length - 1].date} · ${rows.length} 个观察日`;

        renderMarketBoard(getWindowRows());
        renderList(els.reads, collectReads(rows));
        renderList(els.newBooks, collectNewBooks(rows));
        renderList(els.risers, collectRisers(rows));
        renderSummaries(rows);
    }

    function getWindowRows() {
        if (selectedDays === 'all') return trendRows;
        return trendRows.slice(-selectedDays);
    }

    function summarizeRows(rows) {
        return rows.reduce((acc, row) => {
            const trend = row.trend;
            const riserCount = (trend.top_risers || []).length;
            const fallerCount = (trend.top_fallers || []).length;
            const readCount = (trend.reads_growth || []).length;
            const readGrowthTotal = (trend.reads_growth || []).reduce((sum, item) => sum + parseReadsGrowth(item.growth), 0);
            acc.newCount += Number(trend.new_count || 0);
            acc.droppedCount += Number(trend.dropped_count || 0);
            acc.riserCount += riserCount;
            acc.fallerCount += fallerCount;
            acc.readCount += readCount;
            acc.readGrowthTotal += readGrowthTotal;
            if ((trend.new_count || 0) || (trend.dropped_count || 0) || riserCount || fallerCount || readCount) {
                acc.activeDays += 1;
            }
            return acc;
        }, { newCount: 0, droppedCount: 0, riserCount: 0, fallerCount: 0, readCount: 0, readGrowthTotal: 0, activeDays: 0 });
    }

    function renderMarketBoard(rowsWindow) {
        const hotGenres = collectHotGenres(rowsWindow);
        const hotTypes = collectHotTypes(rowsWindow);
        const hotThemes = collectHotThemes(rowsWindow);

        if (!hotTypes.length) {
            els.marketSummary.textContent = '暂无足够数据判断全站热点。';
            els.marketSource.textContent = '暂无数据';
            els.hotGenres.innerHTML = '<p class="muted-line">暂无数据。</p>';
            els.hotTypes.innerHTML = '<p class="muted-line">暂无数据。</p>';
            els.hotThemes.innerHTML = '<p class="muted-line">暂无数据。</p>';
            return;
        }

        const topGenres = hotGenres.slice(0, 2).map(item => item.name).join('、');
        const topTypes = hotTypes.slice(0, 3).map(item => item.name).join('、');
        const topThemes = hotThemes.slice(0, 6).map(item => item.name).join('、');
        const period = selectedDays === 'all' ? '全部样本' : `近 ${selectedDays} 日`;
        const fallbackSummary = `${period}里，${topGenres || topTypes} 的阅读增长更强，具体分类以 ${topTypes} 的新增在读更集中；新书题材上 ${topThemes} 更高频，说明读者仍偏好强设定、强情绪钩子和明确爽点。`;
        const summaryData = getMarketSummaryForPeriod();
        els.marketSummary.textContent = summaryData ? summaryData.summary : fallbackSummary;
        els.marketSource.textContent = summaryData && summaryData.source === 'ai'
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

        els.hotTypes.querySelectorAll('.hot-type-row').forEach(btn => {
            btn.addEventListener('click', () => {
                selectCategory(btn.dataset.type);
            });
        });

        els.hotThemes.innerHTML = hotThemes.slice(0, 14).map(item => `
            <span class="theme-chip" title="新书 ${item.count} 本，覆盖 ${item.categories.size} 个类型">
                ${escapeHtml(item.name)} <small>${item.count}</small>
            </span>
        `).join('');
    }

    function collectHotGenres(rowsWindow) {
        const hotTypes = collectHotTypes(rowsWindow);
        const hotTypeMap = new Map(hotTypes.map(item => [item.name, item]));

        return genreGroups.map(group => {
            const matched = group.categories
                .filter(name => categories.includes(name))
                .map(name => hotTypeMap.get(name) || {
                    name,
                    score: 0,
                    newCount: 0,
                    droppedCount: 0,
                    readCount: 0,
                    readGrowthTotal: 0,
                    activeDays: 0,
                });

            const score = matched.reduce((sum, item) => sum + item.score, 0);
            const lead = matched.slice().sort((a, b) => b.score - a.score)[0];
            return {
                name: group.name,
                score,
                newCount: matched.reduce((sum, item) => sum + item.newCount, 0),
                droppedCount: matched.reduce((sum, item) => sum + item.droppedCount, 0),
                readCount: matched.reduce((sum, item) => sum + item.readCount, 0),
                readGrowthTotal: matched.reduce((sum, item) => sum + item.readGrowthTotal, 0),
                activeDays: matched.reduce((sum, item) => sum + item.activeDays, 0),
                leadCategory: lead ? lead.name : group.categories[0],
                categoryText: matched.map(item => item.name).join(' / '),
            };
        })
            .filter(item => item.score > 0 && item.leadCategory)
            .sort((a, b) => b.score - a.score);
    }

    function collectHotTypes(rowsWindow) {
        return categories.map(name => {
            const rows = rowsWindow
                .map(row => ({ trend: row.trends[name] || null }))
                .filter(row => row.trend);
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
            .filter(item => item.readGrowthTotal > 0)
            .sort((a, b) => b.readGrowthTotal - a.readGrowthTotal || b.readCount - a.readCount);
    }

    function collectHotThemes(rowsWindow) {
        const keywords = [
            '重生', '穿书', '快穿', '系统', '空间', '团宠', '萌宝', '幼崽', '女配', '炮灰',
            '反派', '权臣', '宅斗', '宫斗', '和离', '替嫁', '逃荒', '种田', '美食', '经商',
            '年代', '七零', '八零', '军婚', '豪门', '总裁', '真假千金', '先婚后爱', '追妻',
            '甜宠', '双洁', '强制爱', '无CP', '末世', '废土', '天灾', '囤货', '异能',
            '国运', '星际', '修仙', '玄学', '无限流', '悬疑', '直播', '综艺', '娱乐圈',
            '校园', '暗恋', '青梅竹马', '民国', '兽世', '远古', '基建'
        ];
        const scoreMap = new Map(keywords.map(name => [name, { name, count: 0, categories: new Set() }]));

        const latestBookMap = buildLatestBookMap();

        rowsWindow.forEach(row => {
            categories.forEach(catName => {
                const trend = row.trends[catName];
                if (!trend) return;
                (trend.new_books || []).forEach(title => {
                    const book = latestBookMap.get(title) || {};
                    addThemeHits(scoreMap, keywords, `${title} ${book.intro || ''}`, catName, 1);
                });
            });
        });

        return Array.from(scoreMap.values())
            .filter(item => item.count > 0)
            .sort((a, b) => b.count - a.count || b.categories.size - a.categories.size);
    }

    function buildLatestBookMap() {
        const bookMap = new Map();
        const latestCategories = latestData && latestData.categories ? latestData.categories : [];
        latestCategories.forEach(cat => {
            (cat.books || []).forEach(book => {
                if (book.title) bookMap.set(book.title, book);
            });
        });
        return bookMap;
    }

    function extractBookId(url) {
        const match = String(url || '').match(/\/page\/(\d+)/);
        return match ? match[1] : '';
    }

    function addThemeHits(scoreMap, keywords, text, categoryName, weight) {
        const source = String(text || '');
        if (!source) return;
        keywords.forEach(keyword => {
            if (!source.includes(keyword)) return;
            const item = scoreMap.get(keyword);
            item.count += weight;
            item.categories.add(categoryName);
        });
    }

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
        const scoreMap = new Map();
        rows.forEach(row => {
            (row.trend.top_risers || []).forEach(item => {
                const current = scoreMap.get(item.title) || { title: item.title, score: 0, dates: [] };
                current.score += parseChange(item.change);
                current.dates.push(`${row.date} ${item.change}`);
                scoreMap.set(item.title, current);
            });
        });
        return Array.from(scoreMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map(item => ({ title: item.title, meta: item.dates.slice(-2).join(' / '), value: `+${item.score}` }));
    }

    function collectReads(rows) {
        const scoreMap = new Map();
        rows.forEach(row => {
            (row.trend.reads_growth || []).forEach(item => {
                const current = scoreMap.get(item.title) || { title: item.title, score: 0, dates: [] };
                current.score += parseReadsGrowth(item.growth);
                current.dates.push(`${row.date} ${item.growth}`);
                scoreMap.set(item.title, current);
            });
        });
        return Array.from(scoreMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map(item => ({ title: item.title, meta: item.dates.slice(-2).join(' / '), value: formatReads(item.score) }));
    }

    function renderList(container, items) {
        if (!items.length) {
            container.innerHTML = '<p class="muted-line">暂无明显信号。</p>';
            return;
        }

        const latestBookMap = buildLatestBookMap();

        container.innerHTML = items.map(item => {
            const book = latestBookMap.get(item.title) || {};
            const bookId = extractBookId(book.url);
            const detailUrl = bookId
                ? `book.html?id=${encodeURIComponent(bookId)}`
                : `book.html?title=${encodeURIComponent(item.title)}`;

            return `
            <a class="compact-row compact-row-link" href="${detailUrl}" target="_blank" rel="noopener noreferrer">
                <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <small>${escapeHtml(item.meta)}</small>
                </div>
                <span>${escapeHtml(item.value)}</span>
            </a>
        `;
        }).join('');
    }

    function renderSummaries(rows) {
        const rowsWithSummary = rows
            .slice()
            .reverse()
            .filter(row => row.trend.summary)
            .slice(0, 10);

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
        subtitle.textContent = message;
        els.marketSummary.textContent = message;
        els.marketSource.textContent = '暂无数据';
        els.hotGenres.innerHTML = '<p class="muted-line">暂无数据。</p>';
        els.hotTypes.innerHTML = '<p class="muted-line">暂无数据。</p>';
        els.hotThemes.innerHTML = '<p class="muted-line">暂无数据。</p>';
        [els.newBooks, els.risers, els.reads, els.summaries].forEach(el => {
            el.innerHTML = '<p class="muted-line">暂无数据。</p>';
        });
    }

    function parseChange(value) {
        return Number(String(value || '0').replace('+', '')) || 0;
    }

    function getMarketSummaryForPeriod() {
        if (!marketSummaryData || !marketSummaryData.periods) return null;
        const key = selectedDays === 'all' ? 'all' : String(selectedDays);
        const item = marketSummaryData.periods[key];
        if (!item || !item.summary) return null;
        return item;
    }

    function parseReadsGrowth(value) {
        const raw = String(value || '0').replace('+', '').replace(',', '').trim();
        const num = parseFloat(raw);
        if (Number.isNaN(num)) return 0;
        return raw.includes('万') ? num * 10000 : num;
    }

    function formatReads(value) {
        if (value >= 10000) return `+${(value / 10000).toFixed(1)}万`;
        return `+${Math.round(value)}`;
    }

    function renderMarkdown(text) {
        let html = escapeHtml(text);
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/《(.+?)》/g, '<span class="book-mark">《$1》</span>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeAttr(str) {
        return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
});
