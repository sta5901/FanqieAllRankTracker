document.addEventListener('DOMContentLoaded', () => {
    const detail = document.getElementById('book-detail');
    const listSelector = document.getElementById('list-selector');
    const cacheBuster = `v=${Math.floor(Date.now() / 600000)}`;
    const maxDays = 30;
    const copyToast = document.createElement('div');
    copyToast.className = 'copy-toast';
    copyToast.textContent = '已复制';
    document.body.appendChild(copyToast);
    let toastTimer = null;

    const LISTS = {
        female_new: { name: '女频新书榜', file_key: 'female_new' },
        female_read: { name: '女频阅读榜', file_key: 'female_read' },
        male_new: { name: '男频新书榜', file_key: 'male_new' },
        male_read: { name: '男频阅读榜', file_key: 'male_read' },
    };

    init();

    async function init() {
        const params = new URLSearchParams(window.location.search);
        const bookId = params.get('id');
        const bookTitle = params.get('title');
        const listKey = params.get('list') || window.DEFAULT_BOOK_LIST || '';

        if (!bookId && !bookTitle) {
            renderEmpty('缺少作品 ID 或书名参数。');
            return;
        }

        // 设置下拉框初始值
        if (listKey && LISTS[listKey]) {
            listSelector.value = listKey;
        }

        // 绑定榜单切换
        listSelector.addEventListener('change', () => {
            const newList = listSelector.value;
            const url = new URL(window.location.href);
            if (newList) {
                url.searchParams.set('list', newList);
            } else {
                url.searchParams.delete('list');
            }
            history.replaceState(null, '', url);
            loadBookDetail(bookId, bookTitle, newList);
        });

        await loadBookDetail(bookId, bookTitle, listKey);
    }

    async function loadBookDetail(bookId, bookTitle, listKey) {
        detail.innerHTML = '<div class="book-loading"><i class="ti ti-loader-2 ti-spin"></i> 加载中...</div>';

        try {
            const dateIndex = await fetchJson(`data/dates.json?${cacheBuster}`);
            const allDates = (dateIndex.dates || []).slice().sort().slice(-maxDays);

            // 确定要搜索的榜单列表
            const targetLists = listKey && LISTS[listKey]
                ? [listKey]
                : Object.keys(LISTS);

            let records = [];

            for (const lk of targetLists) {
                const fileKey = LISTS[lk].file_key;
                const listDates = dateIndex.lists && dateIndex.lists[lk]
                    ? dateIndex.lists[lk].dates || []
                    : allDates;
                const dates = listDates.slice().sort().slice(-maxDays);

                const snapshots = await Promise.all(
                    dates.map(date =>
                        fetchJson(`data/fanqie_${fileKey}_ranks_${date.replace(/-/g, '')}.json?${cacheBuster}`)
                            .catch(() => null)
                    )
                );
                const batch = collectBookRecords(bookId, bookTitle, dates, snapshots);
                batch.forEach(r => { r._listKey = lk; });
                records = records.concat(batch);
            }

            if (!records.length) {
                renderEmpty('最近 30 天榜单中没有找到这本书。');
                return;
            }

            renderBook(records);
        } catch (err) {
            console.error(err);
            renderEmpty('作品详情加载失败，请稍后刷新重试。');
        }
    }

    function fetchJson(url) {
        return fetch(url).then(response => {
            if (!response.ok) throw new Error(`Failed to load ${url}`);
            return response.json();
        });
    }

    function collectBookRecords(bookId, bookTitle, dates, snapshots) {
        const records = [];
        snapshots.forEach((snapshot, snapshotIndex) => {
            if (!snapshot || !snapshot.categories) return;
            const date = dates[snapshotIndex];
            snapshot.categories.forEach(cat => {
                (cat.books || []).forEach((book, index) => {
                    if (bookId && extractBookId(book.url) !== bookId) return;
                    if (!bookId && book.title !== bookTitle) return;
                    records.push({
                        date,
                        category: cat.name,
                        rank: index + 1,
                        readsLabel: book.reads || '未知',
                        readsValue: parseReads(book.reads),
                        book,
                    });
                });
            });
        });
        return records.sort((a, b) => a.date.localeCompare(b.date));
    }

    function renderBook(records) {
        const latest = records[records.length - 1];
        const book = latest.book;
        const chartRecords = compactRecordsByDate(records).filter(item => item.readsValue > 0);
        const maxReads = Math.max(...records.map(item => item.readsValue || 0));
        const listName = (LISTS[latest._listKey] || {}).name || '';
        const keywords = book.keywords || [];
        const keywordsHtml = keywords.length > 0
            ? `<div class="book-tags">${keywords.map(k => `<span class="book-tag">${escapeHtml(k)}</span>`).join('')}</div>`
            : '';

        detail.innerHTML = `
            <section class="book-detail-hero">
                <div class="detail-cover">
                    ${book.cover ? `<img src="${book.cover}" alt="${escapeAttr(book.title)}">` : '<div class="no-cover"><i class="ti ti-photo-off"></i></div>'}
                </div>
                <div class="detail-main">
                    <span class="panel-kicker">${listName ? escapeHtml(listName) + ' · ' : ''}${escapeHtml(latest.category)} · 第 ${latest.rank} 名</span>
                    <h1>${escapeHtml(book.title)}</h1>
                    <p class="detail-author"><i class="ti ti-user"></i> ${escapeHtml(book.author || '未知')}</p>
                    <div class="detail-stats">
                        <span><strong>${escapeHtml(latest.readsLabel)}</strong><small>当前在读</small></span>
                        <span><strong>${escapeHtml(formatReads(maxReads))}</strong><small>近30日峰值</small></span>
                        <span><strong>${records.length}</strong><small>上榜记录</small></span>
                    </div>
                    ${keywordsHtml}
                    <p class="detail-intro">${escapeHtml(book.intro || '暂无简介')}</p>
                    <div class="detail-actions">
                        <button class="book-copy-btn detail-copy-btn" type="button"><i class="ti ti-copy"></i> 复制信息</button>
                        ${book.url ? `<a class="source-link-btn" href="${escapeAttr(book.url)}" target="_blank" rel="noopener noreferrer"><i class="ti ti-external-link"></i> 打开番茄原文</a>` : ''}
                    </div>
                </div>
            </section>

            <section class="book-detail-grid">
                <article class="detail-panel detail-panel-wide">
                    <span class="panel-kicker">阅读趋势</span>
                    <h2>最近 30 天在读变化</h2>
                    ${renderReadsChart(chartRecords)}
                </article>
                <article class="detail-panel">
                    <span class="panel-kicker">上榜记录</span>
                    <h2>最近出现</h2>
                    <div class="book-history-list">
                        ${records.slice().reverse().slice(0, 12).map(renderHistoryRow).join('')}
                    </div>
                </article>
            </section>
        `;

        detail.querySelector('.detail-copy-btn').addEventListener('click', e => copyBookInfo(e, book, latest));
        bindReadsChart(chartRecords);
    }

    function copyBookInfo(e, book, latest) {
        const btn = e.currentTarget;
        const text = `${book.title}
作者：${book.author || '未知'}
阅读量：${latest.readsLabel}
简介：${book.intro || '无'}
链接：${book.url || '无'}`;
        copyText(text).then(() => {
            btn.classList.add('copied');
            btn.innerHTML = '<i class="ti ti-check"></i> 已复制';
            showCopyToast();
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.innerHTML = '<i class="ti ti-copy"></i> 复制信息';
            }, 1500);
        });
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
        }

        return fallbackCopyText(text);
    }

    function fallbackCopyText(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return Promise.resolve();
    }

    function showCopyToast() {
        if (toastTimer) clearTimeout(toastTimer);
        copyToast.classList.add('show');
        toastTimer = setTimeout(() => copyToast.classList.remove('show'), 1800);
    }

    function compactRecordsByDate(records) {
        const map = new Map();
        records.forEach(record => {
            const current = map.get(record.date);
            if (!current || record.readsValue >= current.readsValue) {
                map.set(record.date, record);
            }
        });
        return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    }

    function renderReadsChart(records) {
        if (!records.length) {
            return '<p class="muted-line">暂无可用的在读趋势数据。</p>';
        }

        const layout = getReadsChartLayout(records);
        const points = layout.points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
        const labelStep = records.length <= 8 ? 1 : Math.ceil(records.length / 6);

        return `
            <div class="reads-chart-wrap">
                <div class="reads-chart-frame">
                    <svg class="reads-chart" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="阅读数趋势">
                    ${layout.ticks.map(value => {
                        const y = layout.yFor(value);
                        return `
                            <line class="chart-grid" x1="${layout.pad.left}" y1="${y}" x2="${layout.width - layout.pad.right}" y2="${y}"></line>
                            <text class="chart-axis-label" x="${layout.pad.left - 12}" y="${y + 4}" text-anchor="end">${formatReads(value)}</text>
                        `;
                    }).join('')}
                    <line class="chart-axis-base" x1="${layout.pad.left}" y1="${layout.height - layout.pad.bottom}" x2="${layout.width - layout.pad.right}" y2="${layout.height - layout.pad.bottom}"></line>
                    <polyline class="reads-line" points="${points}"></polyline>
                    ${records.map((item, index) => {
                        if (index !== 0 && index !== records.length - 1 && index % labelStep !== 0) return '';
                        return `<text class="chart-date-label" x="${layout.points[index].x}" y="${layout.height - 16}" text-anchor="middle">${escapeHtml(item.date.slice(5))}</text>`;
                    }).join('')}
                    <line class="chart-hover-line" x1="0" y1="${layout.pad.top}" x2="0" y2="${layout.height - layout.pad.bottom}"></line>
                    <circle class="reads-hover-point" cx="0" cy="0" r="5"></circle>
                    <rect class="chart-hit-area" x="${layout.pad.left}" y="${layout.pad.top}" width="${layout.innerW}" height="${layout.innerH}"></rect>
                    </svg>
                    <div class="reads-tooltip" hidden></div>
                </div>
            </div>
        `;
    }

    function bindReadsChart(records) {
        if (!records.length) return;

        const frame = detail.querySelector('.reads-chart-frame');
        const svg = detail.querySelector('.reads-chart');
        const hitArea = detail.querySelector('.chart-hit-area');
        const hoverLine = detail.querySelector('.chart-hover-line');
        const hoverPoint = detail.querySelector('.reads-hover-point');
        const tooltip = detail.querySelector('.reads-tooltip');
        if (!frame || !svg || !hitArea || !hoverLine || !hoverPoint || !tooltip) return;

        const layout = getReadsChartLayout(records);

        function showPoint(index) {
            const point = layout.points[index];
            const record = records[index];
            const frameWidth = frame.clientWidth;
            const frameHeight = svg.getBoundingClientRect().height;
            const left = point.x / layout.width * frameWidth;
            const top = point.y / layout.height * frameHeight;

            hoverLine.setAttribute('x1', point.x);
            hoverLine.setAttribute('x2', point.x);
            hoverLine.classList.add('show');
            hoverPoint.setAttribute('cx', point.x);
            hoverPoint.setAttribute('cy', point.y);
            hoverPoint.classList.add('show');

            tooltip.hidden = false;
            tooltip.innerHTML = `
                <time>${escapeHtml(record.date)}</time>
                <div><i></i><span>阅读人数</span><strong>${escapeHtml(record.readsLabel)}</strong></div>
            `;
            const tooltipWidth = tooltip.offsetWidth || 180;
            const tooltipLeft = Math.min(Math.max(left + 12, 8), frameWidth - tooltipWidth - 8);
            tooltip.style.left = `${tooltipLeft}px`;
            tooltip.style.top = `${Math.max(10, top - 24)}px`;
        }

        hitArea.addEventListener('mousemove', event => {
            const rect = svg.getBoundingClientRect();
            const viewX = (event.clientX - rect.left) * layout.width / rect.width;
            const nearest = layout.points.reduce((best, point, index) => {
                const distance = Math.abs(point.x - viewX);
                return distance < best.distance ? { index, distance } : best;
            }, { index: 0, distance: Infinity });
            showPoint(nearest.index);
        });

        hitArea.addEventListener('mouseleave', () => {
            showPoint(records.length - 1);
        });

        setTimeout(() => showPoint(records.length - 1), 0);
    }

    function getReadsChartLayout(records) {
        const width = 840;
        const height = 300;
        const pad = { top: 28, right: 28, bottom: 48, left: 58 };
        const innerW = width - pad.left - pad.right;
        const innerH = height - pad.top - pad.bottom;
        const maxValue = niceChartMax(Math.max(1, ...records.map(item => item.readsValue)));
        const xStep = records.length > 1 ? innerW / (records.length - 1) : 0;
        const xFor = index => records.length > 1 ? pad.left + index * xStep : pad.left + innerW / 2;
        const yFor = value => pad.top + innerH - (value / maxValue) * innerH;
        const ticks = [0, maxValue / 4, maxValue / 2, maxValue * 3 / 4, maxValue];
        const points = records.map((item, index) => ({
            x: xFor(index),
            y: yFor(item.readsValue),
        }));

        return { width, height, pad, innerW, innerH, maxValue, ticks, points, yFor };
    }

    function niceChartMax(value) {
        const raw = Math.max(1, Number(value || 1));
        const magnitude = 10 ** Math.floor(Math.log10(raw));
        const step = raw / magnitude > 5 ? magnitude : magnitude / 2;
        return Math.ceil(raw / step) * step;
    }

    function renderHistoryRow(record) {
        const listName = (LISTS[record._listKey] || {}).name || '';
        const listLabel = listName ? `<span class="book-list-label">${escapeHtml(listName)}</span>` : '';
        return `
            <div class="book-history-row">
                <time>${escapeHtml(record.date)}</time>
                ${listLabel}
                <strong>${escapeHtml(record.category)} · 第 ${record.rank} 名</strong>
                <span>${escapeHtml(record.readsLabel)}</span>
            </div>
        `;
    }

    function renderEmpty(message) {
        detail.innerHTML = `
            <div class="book-empty-state">
                <p>${escapeHtml(message)}</p>
                <a href="index.html" class="back-link"><i class="ti ti-arrow-left"></i> 返回榜单</a>
            </div>
        `;
    }

    function extractBookId(url) {
        const match = String(url || '').match(/\/page\/(\d+)/);
        return match ? match[1] : '';
    }

    function parseReads(reads) {
        const raw = String(reads || '').replace(',', '').trim();
        const num = parseFloat(raw);
        if (Number.isNaN(num)) return 0;
        return raw.includes('万') ? num * 10000 : num;
    }

    function formatReads(value) {
        const num = Number(value || 0);
        if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
        return String(Math.round(num));
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
