document.addEventListener('DOMContentLoaded', () => {
    const categoryList = document.getElementById('category-list');
    const waterfall = document.getElementById('books-waterfall');
    const updateDate = document.getElementById('update-date');
    const categoryTitle = document.getElementById('current-category-title');
    const aiContent = document.getElementById('ai-content');
    const trendPanel = document.getElementById('trend-panel');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    const dateDisplay = document.getElementById('date-display');
    const datePickerBtn = document.getElementById('date-picker-btn');
    const dateInput = document.getElementById('date-input');
    const datePrevBtn = document.getElementById('date-prev');
    const dateNextBtn = document.getElementById('date-next');

    let allData = null;
    let typingTimer = null;
    let availableDates = [];   // sorted list of "YYYY-MM-DD"
    let currentDateIndex = -1; // index into availableDates
    let currentCategory = null; // preserve selected category across date switches

    // Cache-busting: 每10分钟一个新key，避免浏览器缓存旧JSON
    const cacheBuster = `v=${Math.floor(Date.now() / 600000)}`;

    // ========== Copy Toast ==========
    const copyToast = document.createElement('div');
    copyToast.className = 'copy-toast';
    copyToast.textContent = '书本信息已复制';
    document.body.appendChild(copyToast);
    let toastTimer = null;

    function showCopyToast() {
        if (toastTimer) clearTimeout(toastTimer);
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
            btn.textContent = '已复制';
            showCopyToast();
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.textContent = '复制信息';
            }, 1500);
        }).catch(() => {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showCopyToast();
        });
    }

    // ========== Mobile menu ==========
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

    // ========== Date Navigation ==========
    function updateDateNav() {
        const isLatest = currentDateIndex === availableDates.length - 1;
        const isFirst = currentDateIndex <= 0;

        datePrevBtn.disabled = isFirst;
        dateNextBtn.disabled = isLatest;

        const currentDate = availableDates[currentDateIndex];
        dateDisplay.textContent = currentDate || '加载中...';

        // Highlight if viewing historical (non-latest) data
        if (isLatest) {
            datePickerBtn.classList.remove('is-historical');
        } else {
            datePickerBtn.classList.add('is-historical');
        }

        // Sync preset button active state
        updatePresetButtons();
    }

    // ========== Preset Buttons ==========
    const presetBtns = document.querySelectorAll('.preset-btn');

    function updatePresetButtons() {
        const isLatest = currentDateIndex === availableDates.length - 1;
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
        // Trigger native date picker
        dateInput.showPicker ? dateInput.showPicker() : dateInput.click();
    });

    dateInput.addEventListener('change', () => {
        const selected = dateInput.value; // YYYY-MM-DD
        if (!selected) return;
        const idx = availableDates.indexOf(selected);
        if (idx !== -1) {
            currentDateIndex = idx;
            loadDateData(selected);
        } else {
            // Find nearest available date and show friendly hint
            const nearest = availableDates.reduce((prev, curr) =>
                Math.abs(new Date(curr) - new Date(selected)) < Math.abs(new Date(prev) - new Date(selected)) ? curr : prev
            );
            const nearIdx = availableDates.indexOf(nearest);
            currentDateIndex = nearIdx;
            loadDateData(nearest);
            showToast(`${selected} 无数据，已跳转至最近的 ${nearest}`);
        }
    });

    // ========== Load dates index, then load latest ==========
    fetch(`data/dates.json?${cacheBuster}`)
        .then(r => r.ok ? r.json() : Promise.reject('No dates.json'))
        .then(idx => {
            availableDates = idx.dates || [];
            if (availableDates.length > 0) {
                // Set min/max for native date input
                dateInput.min = availableDates[0];
                dateInput.max = availableDates[availableDates.length - 1];
            }
            // Start by loading latest_ranks.json (already has trend data baked in)
            return loadLatestData();
        })
        .catch(() => {
            // Fallback: no dates.json available, just load latest
            console.warn('dates.json not found, falling back to latest only');
            loadLatestData();
        });

    function loadLatestData() {
        return fetch(`data/latest_ranks.json?${cacheBuster}`)
            .then(r => {
                if (!r.ok) throw new Error('Network error');
                return r.json();
            })
            .then(data => {
                allData = data;
                // Set current index from dates list
                const latestDate = data.date;
                currentDateIndex = availableDates.indexOf(latestDate);
                if (currentDateIndex === -1) {
                    // Date might not be in index yet (e.g., dates.json not regenerated)
                    availableDates.push(latestDate);
                    availableDates.sort();
                    currentDateIndex = availableDates.indexOf(latestDate);
                }
                applyData(data);
            })
            .catch(err => {
                console.error(err);
                waterfall.innerHTML = '<p style="color:#f87171;padding:20px;">数据加载失败，请刷新重试。</p>';
            });
    }

    function loadDateData(dateStr) {
        // dateStr = "YYYY-MM-DD", file = fanqie_female_new_ranks_YYYYMMDD.json
        const fileDateStr = dateStr.replace(/-/g, '');
        const isLatest = currentDateIndex === availableDates.length - 1;

        if (isLatest) {
            // Just load the pre-built latest with trends
            loadLatestData();
            return;
        }

        // Show loading state
        waterfall.innerHTML = '<p style="color:var(--text-muted);padding:20px;">加载中...</p>';

        const snapshotUrl = `data/fanqie_female_new_ranks_${fileDateStr}.json?${cacheBuster}`;
        const trendUrl = `data/trends/${dateStr}.json?${cacheBuster}`;

        // Load snapshot + trends in parallel
        Promise.all([
            fetch(snapshotUrl).then(r => r.ok ? r.json() : Promise.reject('No snapshot')),
            fetch(trendUrl).then(r => r.ok ? r.json() : null).catch(() => null)
        ]).then(([snapshot, trendData]) => {
            // Build a data object in the same shape as latest_ranks.json
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
            const dateStr = availableDates[currentDateIndex];
            // Friendly no-data handler: auto-jump to nearest date
            const nearest = findNearestAvailableDate(dateStr);
            if (nearest && nearest !== dateStr) {
                showToast(`${dateStr} 数据不可用，已跳转至 ${nearest}`);
                currentDateIndex = availableDates.indexOf(nearest);
                loadDateData(nearest);
            } else {
                waterfall.innerHTML = `<div class="empty-state">
                    <p>📭 该日期（${dateStr}）暂无数据</p>
                    <p class="empty-hint">可尝试切换到其他日期查看</p>
                </div>`;
                updateDateNav();
            }
        });
    }

    function findNearestAvailableDate(targetDate) {
        // Try nearby dates, preferring the latest
        if (availableDates.length === 0) return null;
        return availableDates.reduce((prev, curr) =>
            Math.abs(new Date(curr) - new Date(targetDate)) < Math.abs(new Date(prev) - new Date(targetDate)) ? curr : prev
        );
    }

    // ========== General Toast ==========
    function showToast(msg) {
        copyToast.textContent = msg;
        if (toastTimer) clearTimeout(toastTimer);
        copyToast.classList.add('show');
        toastTimer = setTimeout(() => {
            copyToast.classList.remove('show');
            copyToast.textContent = '书本信息已复制';
        }, 2500);
    }

    function applyData(data) {
        const prevInfo = data.prev_date ? ` (对比 ${data.prev_date})` : '';
        updateDate.textContent = `${data.date}${prevInfo}`;
        updateDateNav();

        // Remember current category before re-rendering
        const savedCategory = currentCategory;
        renderCategories();

        // Try to restore previously selected category, otherwise pick first
        const categoryExists = savedCategory && data.categories.some(c => c.name === savedCategory);
        if (categoryExists) {
            selectCategory(savedCategory);
            // Also update sidebar active state
            document.querySelectorAll('#category-list li').forEach(el => {
                el.classList.toggle('active', el.dataset.category === savedCategory);
            });
        } else if (data.categories.length > 0) {
            selectCategory(data.categories[0].name);
        }
    }

    // ========== Render sidebar categories ==========
    function renderCategories() {
        categoryList.innerHTML = '';
        allData.categories.forEach((cat, i) => {
            const li = document.createElement('li');
            li.dataset.category = cat.name;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = cat.name;
            li.appendChild(nameSpan);

            // New entry badge
            const trend = cat.trend || {};
            if (trend.new_count > 0) {
                const badge = document.createElement('span');
                badge.className = 'cat-badge new';
                badge.textContent = `+${trend.new_count}`;
                li.appendChild(badge);
            }

            // Mark active: either the saved category or first item
            if ((currentCategory && cat.name === currentCategory) || (!currentCategory && i === 0)) {
                li.classList.add('active');
            }

            li.addEventListener('click', () => {
                document.querySelectorAll('#category-list li').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                selectCategory(cat.name);
                // Close mobile sidebar
                sidebar.classList.remove('open');
                overlay.classList.remove('show');
            });

            categoryList.appendChild(li);
        });
    }

    // ========== Select a category ==========
    function selectCategory(categoryName) {
        currentCategory = categoryName; // persist selection
        categoryTitle.textContent = categoryName;
        const cat = allData.categories.find(c => c.name === categoryName);
        if (!cat) return;
        renderTrend(cat);
        renderBooks(cat);
    }

    // ========== Build a url->rank lookup for previous day ==========
    function buildPrevRankMap(categoryName) {
        // We infer prev rank from trend data
        // Actually, the trend data already has this info baked in.
        // For the card badges we need to know if a book is new or changed rank.
        const cat = allData.categories.find(c => c.name === categoryName);
        if (!cat || !cat.trend) return {};

        const map = {};
        // Mark new books
        (cat.trend.new_books || []).forEach(title => {
            map[title] = 'new';
        });
        // Risers
        (cat.trend.top_risers || []).forEach(r => {
            map[r.title] = r.change;
        });
        // Fallers
        (cat.trend.top_fallers || []).forEach(f => {
            map[f.title] = f.change;
        });
        return map;
    }

    // ========== Render Trend Panel ==========
    function renderTrend(cat) {
        const trend = cat.trend || {};
        const summary = trend.summary || '';
        typewriterEffect(summary);
    }

    // ========== Simple Markdown renderer ==========
    function renderMarkdown(text) {
        let html = escapeHtml(text);
        // Headers: ### h3, ## h2 (rare in summaries but support it)
        html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:1.05rem; margin:1em 0 0.5em; color:var(--text-primary);">$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:1.15rem; margin:1em 0 0.5em; color:var(--text-primary);">$1</h2>');
        // Bold: **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Italic: *text*
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // Book titles: 《》 highlight
        html = html.replace(/《(.+?)》/g, '<span style="color:var(--accent);font-weight:500">《$1》</span>');
        // Unordered lists: - item or * item
        html = html.replace(/^[-*] (.+)$/gm, '<span style="display:block;padding-left:1em;text-indent:-0.6em">• $1</span>');
        // Numbered lists: 1. item
        html = html.replace(/^(\d+)\. (.+)$/gm, '<span style="display:block;padding-left:1em;text-indent:-0.6em">$1. $2</span>');
        return html;
    }

    // ========== Typewriter effect ==========
    function typewriterEffect(text) {
        // Cancel any previous animation
        if (typingTimer) {
            clearTimeout(typingTimer);
            typingTimer = null;
        }

        aiContent.innerHTML = '';

        if (!text) {
            aiContent.innerHTML = '<span class="ai-loading">暂无分析数据</span>';
            return;
        }

        aiContent.innerHTML = renderMarkdown(text);
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
    }

    // ========== Render Books (Waterfall) ==========
    function renderBooks(cat) {
        waterfall.innerHTML = '';
        const books = cat.books || [];

        if (books.length === 0) {
            waterfall.innerHTML = '<p style="color:var(--text-muted);padding:20px;">该分类暂无书籍。</p>';
            return;
        }

        const changeMap = buildPrevRankMap(cat.name);
        const fragment = document.createDocumentFragment();

        books.forEach((book, index) => {
            const rank = index + 1;
            const card = document.createElement('a');
            const bookId = extractBookId(book.url);
            card.href = bookId ? `book.html?id=${encodeURIComponent(bookId)}` : 'javascript:void(0)';
            card.rel = 'noopener';
            card.className = 'book-card';

            // Rank badge class
            let rankCls = '';
            if (rank === 1) rankCls = 'rank-1';
            else if (rank === 2) rankCls = 'rank-2';
            else if (rank === 3) rankCls = 'rank-3';

            // Change indicator
            let changeHtml = '';
            const change = changeMap[book.title];
            if (change === 'new') {
                changeHtml = '<span class="book-change new">NEW</span>';
            } else if (change && change.startsWith('+')) {
                changeHtml = `<span class="book-change up">↑${change}</span>`;
            } else if (change && change.startsWith('-')) {
                changeHtml = `<span class="book-change down">↓${change.replace('-', '')}</span>`;
            }

            // Cover
            const coverHtml = book.cover
                ? `<div class="book-cover"><img src="${book.cover}" alt="${escapeAttr(book.title)}" loading="lazy"></div>`
                : `<div class="book-cover"><div class="no-cover">暂无封面</div></div>`;

            card.innerHTML = `
                <span class="book-rank ${rankCls}">${rank}</span>
                ${changeHtml}
                ${coverHtml}
                <div class="book-info">
                    <h3 class="book-title" title="${escapeAttr(book.title)}">${escapeHtml(book.title)}</h3>
                    <div class="book-meta">
                        <span class="book-author">${escapeHtml(book.author)}</span>
                        <span class="book-reads">${escapeHtml(book.reads)}</span>
                    </div>
                    <p class="book-intro">${escapeHtml(book.intro)}</p>
                    <button class="book-copy-btn" type="button">复制信息</button>
                </div>
            `;

            // Bind copy button
            const copyBtn = card.querySelector('.book-copy-btn');
            copyBtn.addEventListener('click', (e) => copyBookInfo(e, book));

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
});
