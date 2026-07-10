document.addEventListener('DOMContentLoaded', () => {
    // ─────────────────────────────────────────────────────────────────────────
    // 常量 & 状态
    // ─────────────────────────────────────────────────────────────────────────
    const LISTS = window.FANQIE_LISTS || {
        female_new: { name: "女频新书榜", file_key: "female_new", color: "#EC4899", icon: "ti-heart" },
        female_read: { name: "女频阅读榜", file_key: "female_read", color: "#F472B6", icon: "ti-heartbeat" },
        male_new: { name: "男频新书榜", file_key: "male_new", color: "#3B82F6", icon: "ti-user" },
        male_read: { name: "男频阅读榜", file_key: "male_read", color: "#60A5FA", icon: "ti-users" },
    };
    let currentListKey = window.CURRENT_LIST_KEY || "female_new";
    let allData = null;
    let typingTimer = null;
    let availableDates = [];     // sorted "YYYY-MM-DD" for current list
    let currentDateIndex = -1;
    let currentCategory = null;  // preserve across date switches

    // Cache-busting: 每10分钟一个新key，避免浏览器缓存旧JSON
    const cacheBuster = `v=${Math.floor(Date.now() / 600000)}`;

    // ─────────────────────────────────────────────────────────────────────────
    // DOM 引用
    // ─────────────────────────────────────────────────────────────────────────
    const categoryList  = document.getElementById('category-list');
    const waterfall     = document.getElementById('books-waterfall');
    const updateDate   = document.getElementById('update-date');
    const categoryTitle = document.getElementById('current-category-title');
    const aiContent     = document.getElementById('ai-content');
    const trendPanel    = document.getElementById('trend-panel');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar       = document.getElementById('sidebar');
    const dateDisplay   = document.getElementById('date-display');
    const datePickerBtn = document.getElementById('date-picker-btn');
    const dateInput     = document.getElementById('date-input');
    const datePrevBtn   = document.getElementById('date-prev');
    const dateNextBtn   = document.getElementById('date-next');
    const listTabs      = document.getElementById('list-tabs');
    const sidebarSubtitle = document.getElementById('sidebar-subtitle');
    const trendLinkBtn  = document.getElementById('trend-link');
    const statsLinkBtn  = document.getElementById('stats-link');

    // ─────────────────────────────────────────────────────────────────────────
    // Copy Toast
    // ─────────────────────────────────────────────────────────────────────────
    const copyToast = document.createElement('div');
    copyToast.className = 'copy-toast';
    copyToast.textContent = '已复制';
    document.body.appendChild(copyToast);
    let toastTimer = null;

    function showCopyToast(msg) {
        if (toastTimer) clearTimeout(toastTimer);
        copyToast.textContent = msg || '已复制';
        copyToast.classList.add('show');
        toastTimer = setTimeout(() => copyToast.classList.remove('show'), 1800);
    }

    function copyBookInfo(e, book) {
        e.preventDefault();
        e.stopPropagation();
        const text = `${book.title}\n作者：${book.author}\n阅读量：${book.reads}\n简介：${book.intro || '无'}\n链接：${book.url || '无'}`;
        navigator.clipboard.writeText(text).then(() => {
            const btn = e.currentTarget;
            btn.classList.add('copied');
            btn.innerHTML = '<i class="ti ti-check"></i> 已复制';
            showCopyToast();
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.innerHTML = '<i class="ti ti-copy"></i> 复制信息';
            }, 1500);
        }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showCopyToast();
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mobile Menu
    // ─────────────────────────────────────────────────────────────────────────
    let overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');
    });
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 四榜 Tab 切换
    // ─────────────────────────────────────────────────────────────────────────
    function switchList(newListKey) {
        if (newListKey === currentListKey) return;
        currentListKey = newListKey;
        currentCategory = null;

        // 更新 Tab 激活状态
        document.querySelectorAll('.list-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.key === newListKey);
        });

        // 更新页面标题 & 副标题
        const cfg = LISTS[newListKey];
        if (cfg) {
            document.title = `番茄风向标 · ${cfg.name}`;
            sidebarSubtitle.textContent = `${cfg.name}追踪`;
            // 更新 trend/stats 链接带上 listKey
            trendLinkBtn.href = `trend.html?list=${newListKey}`;
            statsLinkBtn.href = `stats.html?list=${newListKey}`;
            // 更新 body accent-color
            document.documentElement.style.setProperty('--list-color', cfg.color);
        }

        // 重置 UI
        waterfall.innerHTML = '<p class="empty-state-text"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> 切换榜单中...</p>';
        aiContent.innerHTML = '';
        categoryList.innerHTML = '<li class="loading-item"><i class="ti ti-loader-2 ti-spin"></i> 加载中...</li>';

        // 重新加载数据
        loadDatesAndStart();
    }

    // 绑定 Tab 点击事件（使用事件委托）
    listTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.list-tab');
        if (!tab) return;
        switchList(tab.dataset.key);
    });

    // 从 URL 参数恢复榜单选择
    (function restoreListFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const listParam = params.get('list');
        if (listParam && LISTS[listParam]) {
            switchList(listParam);
        } else {
            // 默认 Tab 高亮 + 设置 CSS 变量
            const activeTab = document.querySelector('.list-tab.active');
            if (activeTab) {
                const cfg = LISTS[activeTab.dataset.key] || {};
                document.documentElement.style.setProperty('--list-color', cfg.color || '#EC4899');
            }
        }
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // Date Navigation
    // ─────────────────────────────────────────────────────────────────────────
    function updateDateNav() {
        const isLatest = currentDateIndex === availableDates.length - 1;
        const isFirst  = currentDateIndex <= 0;
        datePrevBtn.disabled = isFirst;
        dateNextBtn.disabled = isLatest;

        const currentDate = availableDates[currentDateIndex];
        dateDisplay.textContent = currentDate || '加载中...';
        datePickerBtn.classList.toggle('is-historical', !isLatest);
        updatePresetButtons();
    }

    // Preset Buttons
    const presetBtns = document.querySelectorAll('.preset-btn');

    function updatePresetButtons() {
        const isLatest   = currentDateIndex === availableDates.length - 1;
        const isYesterday = availableDates.length >= 2 && currentDateIndex === availableDates.length - 2;
        presetBtns.forEach(btn => {
            const preset = btn.dataset.preset;
            if (preset === 'latest' && isLatest) {
                btn.classList.add('active');
            } else if (preset === 'yesterday' && isYesterday) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            if (preset === 'latest' && availableDates.length > 0) {
                currentDateIndex = availableDates.length - 1;
                loadDateData(availableDates[currentDateIndex]);
            } else if (preset === 'yesterday' && availableDates.length >= 2) {
                currentDateIndex = availableDates.length - 2;
                loadDateData(availableDates[currentDateIndex]);
            }
        });
    });

    datePrevBtn.addEventListener('click', () => {
        if (currentDateIndex > 0) {
            currentDateIndex--;
            loadDateData(availableDates[currentDateIndex]);
        }
    });

    dateNextBtn.addEventListener('click', () => {
        if (currentDateIndex < availableDates.length - 1) {
            currentDateIndex++;
            loadDateData(availableDates[currentDateIndex]);
        }
    });

    datePickerBtn.addEventListener('click', () => {
        dateInput.showPicker ? dateInput.showPicker() : dateInput.click();
    });

    dateInput.addEventListener('change', () => {
        const selected = dateInput.value;
        if (!selected) return;
        const idx = availableDates.indexOf(selected);
        if (idx !== -1) {
            currentDateIndex = idx;
            loadDateData(selected);
        } else {
            const nearest = availableDates.reduce((prev, curr) =>
                Math.abs(new Date(curr) - new Date(selected)) < Math.abs(new Date(prev) - new Date(selected))
                    ? curr : prev
            );
            const nearIdx = availableDates.indexOf(nearest);
            currentDateIndex = nearIdx;
            loadDateData(nearest);
            showToast(`${selected} 无数据，已跳转至 ${nearest}`);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 数据加载入口
    // ─────────────────────────────────────────────────────────────────────────
    function loadDatesAndStart() {
        fetch(`data/dates.json?${cacheBuster}`)
            .then(r => r.ok ? r.json() : Promise.reject('dates.json not found'))
            .then(idx => {
                // dates.json 新结构：idx.lists[listKey].dates
                const listInfo = idx.lists && idx.lists[currentListKey];
                availableDates = listInfo ? (listInfo.dates || []) : (idx.dates || []);
                if (availableDates.length > 0) {
                    dateInput.min = availableDates[0];
                    dateInput.max = availableDates[availableDates.length - 1];
                }
                return loadLatestData();
            })
            .catch(() => {
                console.warn('dates.json not found, falling back to latest only');
                loadLatestData();
            });
    }

    function loadLatestData() {
        return fetch(`data/latest_${currentListKey}.json?${cacheBuster}`)
            .then(r => {
                if (!r.ok) throw new Error(`latest_${currentListKey}.json not found`);
                return r.json();
            })
            .then(data => {
                allData = data;
                const latestDate = data.date;
                currentDateIndex = availableDates.indexOf(latestDate);
                if (currentDateIndex === -1) {
                    availableDates.push(latestDate);
                    availableDates.sort();
                    currentDateIndex = availableDates.indexOf(latestDate);
                }
                applyData(data);
            })
            .catch(err => {
                console.error(err);
                waterfall.innerHTML = `<p class="empty-state-text">
                    <i class="ti ti-alert-circle"></i>
                    数据加载失败，当前榜单「${LISTS[currentListKey]?.name || currentListKey}」暂无数据。
                    <br><small>可尝试切换其他榜单或稍后刷新。</small>
                </p>`;
            });
    }

    function loadDateData(dateStr) {
        const fileDateStr = dateStr.replace(/-/g, '');
        const isLatest = currentDateIndex === availableDates.length - 1;

        if (isLatest) {
            loadLatestData();
            return;
        }

        waterfall.innerHTML = '<p class="empty-state-text"><i class="ti ti-loader-2 ti-spin"></i> 加载中...</p>';

        const fileKey = LISTS[currentListKey]?.file_key || currentListKey;
        const snapshotUrl = `data/fanqie_${fileKey}_ranks_${fileDateStr}.json?${cacheBuster}`;
        const trendUrl    = `data/trends/${currentListKey}/${dateStr}.json?${cacheBuster}`;

        Promise.all([
            fetch(snapshotUrl).then(r => r.ok ? r.json() : Promise.reject('No snapshot')),
            fetch(trendUrl).then(r => r.ok ? r.json() : null).catch(() => null)
        ]).then(([snapshot, trendData]) => {
            const combined = {
                date: snapshot.date,
                prev_date: trendData ? trendData.prev_date : '',
                categories: snapshot.categories.map(cat => ({
                    name: cat.name,
                    trend: trendData && trendData.trends ? (trendData.trends[cat.name] || {}) : {},
                    books: cat.books || []
                }))
            };
            allData = combined;
            applyData(combined);
        }).catch(err => {
            console.error('Failed to load historical data:', err);
            const nearest = findNearestAvailableDate(availableDates[currentDateIndex]);
            if (nearest && nearest !== availableDates[currentDateIndex]) {
                showToast(`${dateStr} 数据不可用，已跳转至 ${nearest}`);
                currentDateIndex = availableDates.indexOf(nearest);
                loadDateData(nearest);
            } else {
                waterfall.innerHTML = `<p class="empty-state-text">
                    <i class="ti ti-inbox"></i>
                    ${dateStr} 暂无数据
                </p>`;
                updateDateNav();
            }
        });
    }

    function findNearestAvailableDate(targetDate) {
        if (availableDates.length === 0) return null;
        return availableDates.reduce((prev, curr) =>
            Math.abs(new Date(curr) - new Date(targetDate)) < Math.abs(new Date(prev) - new Date(targetDate))
                ? curr : prev
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Toast
    // ─────────────────────────────────────────────────────────────────────────
    function showToast(msg) {
        showCopyToast(msg);
        setTimeout(() => { copyToast.textContent = '已复制'; }, 2500);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Apply Data → 渲染
    // ─────────────────────────────────────────────────────────────────────────
    function applyData(data) {
        const prevInfo = data.prev_date ? ` (对比 ${data.prev_date})` : '';
        updateDate.textContent = `${data.date}${prevInfo}`;
        updateDateNav();

        const savedCategory = currentCategory;
        renderCategories();

        const categoryExists = savedCategory && data.categories.some(c => c.name === savedCategory);
        if (categoryExists) {
            selectCategory(savedCategory);
            document.querySelectorAll('#category-list li').forEach(el =>
                el.classList.toggle('active', el.dataset.category === savedCategory)
            );
        } else if (data.categories.length > 0) {
            selectCategory(data.categories[0].name);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 渲染侧边栏分类
    // ─────────────────────────────────────────────────────────────────────────
    function renderCategories() {
        categoryList.innerHTML = '';
        allData.categories.forEach((cat, i) => {
            const li = document.createElement('li');
            li.dataset.category = cat.name;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = cat.name;
            li.appendChild(nameSpan);

            const trend = cat.trend || {};
            if (trend.new_count > 0) {
                const badge = document.createElement('span');
                badge.className = 'cat-badge new';
                badge.textContent = `+${trend.new_count}`;
                li.appendChild(badge);
            }

            if ((currentCategory && cat.name === currentCategory) || (!currentCategory && i === 0)) {
                li.classList.add('active');
            }

            li.addEventListener('click', () => {
                document.querySelectorAll('#category-list li').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                selectCategory(cat.name);
                sidebar.classList.remove('open');
                overlay.classList.remove('show');
            });

            categoryList.appendChild(li);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 选择分类
    // ─────────────────────────────────────────────────────────────────────────
    function selectCategory(categoryName) {
        currentCategory = categoryName;
        categoryTitle.textContent = categoryName;
        const cat = allData.categories.find(c => c.name === categoryName);
        if (!cat) return;
        renderTrend(cat);
        renderBooks(cat);
    }

    function buildPrevRankMap(categoryName) {
        const cat = allData.categories.find(c => c.name === categoryName);
        if (!cat || !cat.trend) return {};
        const map = {};
        (cat.trend.new_books || []).forEach(title => { map[title] = 'new'; });
        (cat.trend.top_risers || []).forEach(r => { map[r.title] = r.change; });
        (cat.trend.top_fallers || []).forEach(f => { map[f.title] = f.change; });
        return map;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 渲染趋势面板
    // ─────────────────────────────────────────────────────────────────────────
    function renderTrend(cat) {
        const summary = cat.trend?.summary || '';
        typewriterEffect(summary);
    }

    function renderMarkdown(text) {
        if (!text) return '';
        let html = escapeHtml(text);
        html = html.replace(/^### (.+)$/gm,
            '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm,
            '<h2>$1</h2>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/《(.+?)》/g,
            '<span class="book-ref">《$1》</span>');
        html = html.replace(/^[-*] (.+)$/gm,
            '<span class="list-item">• $1</span>');
        html = html.replace(/^(\d+)\. (.+)$/gm,
            '<span class="list-item">$1. $2</span>');
        return html;
    }

    function typewriterEffect(text) {
        if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; }
        aiContent.innerHTML = '';
        if (!text) {
            aiContent.innerHTML = '<span class="ai-loading"><i class="ti ti-inbox"></i> 暂无分析数据</span>';
            return;
        }
        aiContent.innerHTML = renderMarkdown(text);
    }

    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;')
                          .replace(/</g, '&lt;')
                          .replace(/>/g, '&gt;')
                          .replace(/\n/g, '<br>');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 渲染书籍瀑布流
    // ─────────────────────────────────────────────────────────────────────────
    function renderBooks(cat) {
        waterfall.innerHTML = '';
        const books = cat.books || [];
        if (books.length === 0) {
            waterfall.innerHTML = '<p class="empty-state-text"><i class="ti ti-inbox"></i> 该分类暂无书籍</p>';
            return;
        }

        const changeMap = buildPrevRankMap(cat.name);
        const fragment = document.createDocumentFragment();

        books.forEach((book, index) => {
            const rank = index + 1;
            const card = document.createElement('a');
            const bookId = extractBookId(book.url);
            const keywords = book.keywords || [];
            const keywordsHtml = keywords.length > 0
                ? `<div class="book-tags">${keywords.slice(0, 3).map(k => `<span class="book-tag">${escapeHtml(k)}</span>`).join('')}</div>`
                : '';

            card.href = bookId ? `book.html?id=${encodeURIComponent(bookId)}&list=${currentListKey}` : 'javascript:void(0)';
            card.rel = 'noopener';
            card.className = 'book-card';

            let rankCls = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';

            let changeHtml = '';
            const change = changeMap[book.title];
            if (change === 'new') {
                changeHtml = '<span class="book-change new"><i class="ti ti-sparkles"></i>NEW</span>';
            } else if (change && change.startsWith('+')) {
                changeHtml = `<span class="book-change up"><i class="ti ti-arrow-up"></i>${change}</span>`;
            } else if (change && change.startsWith('-')) {
                changeHtml = `<span class="book-change down"><i class="ti ti-arrow-down"></i>${change.replace('-', '')}</span>`;
            }

            const coverHtml = book.cover
                ? `<div class="book-cover"><img src="${book.cover}" alt="${escapeAttr(book.title)}" loading="lazy"></div>`
                : `<div class="book-cover"><div class="no-cover"><i class="ti ti-photo-off"></i></div></div>`;

            card.innerHTML = `
                <span class="book-rank ${rankCls}">${rank}</span>
                ${changeHtml}
                ${coverHtml}
                <div class="book-info">
                    <h3 class="book-title" title="${escapeAttr(book.title)}">${escapeHtml(book.title)}</h3>
                    <div class="book-meta">
                        <span class="book-author"><i class="ti ti-user"></i>${escapeHtml(book.author)}</span>
                        <span class="book-reads"><i class="ti ti-eye"></i>${escapeHtml(book.reads)}</span>
                    </div>
                    ${keywordsHtml}
                    <p class="book-intro">${escapeHtml(book.intro)}</p>
                    <button class="book-copy-btn" type="button">
                        <i class="ti ti-copy"></i>复制信息
                    </button>
                </div>
            `;

            card.querySelector('.book-copy-btn').addEventListener('click', e => copyBookInfo(e, book));
            fragment.appendChild(card);
        });

        waterfall.appendChild(fragment);
    }

    function escapeAttr(str) {
        return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function extractBookId(url) {
        const match = String(url || '').match(/\/page\/(\d+)/);
        return match ? match[1] : '';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 启动
    // ─────────────────────────────────────────────────────────────────────────
    loadDatesAndStart();
});
