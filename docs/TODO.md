# TODO · 番茄全榜风向标改造

> 文档版本：v1.0 · 2026-07-10  
> 基准：TRANSFORMATION_PLAN.md v1.1

---

## 图例

| 标记 | 含义 |
|------|------|
| `[P]` | 改动范围：Python 后端 |
| `[J]` | 改动范围：JavaScript 前端 |
| `[C]` | 改动范围：CSS 样式 |
| `[H]` | 改动范围：HTML |
| `[Y]` | 改动范围：GitHub Actions YAML |
| `[D]` | 改动范围：数据文件 / 目录结构 |
| `[T]` | 验证通过（需手动确认后打勾） |
| `→` | 依赖前置任务 |

---

## 阶段 0：准备与验证（动手改造前必做）

### T-0.1 男频页面 DOM 验证

- **文件**：新建 `scripts/verify_male_lists.py`
- **内容**：用 Playwright 分别访问 `1_2_1141`、`1_1_1141`、`0_2_1139`、`0_1_1139` 四个页面，提取分类链接，输出分类数量和名称
- **目的**：确认男频页面结构与女频一致，分类提取 JS 选择器无需调整
- **验收**：输出四个榜单的分类数量、分类名称列表，截图保存到 `docs/verification/`
- **依赖**：无

### T-0.2 现有代码快照

- **操作**：Git commit 当前代码（tag: `v1.0-base`）
- **目的**：改造出问题可一键回退
- **验收**：`git log --oneline` 确认 tag 存在

### T-0.3 requirements.txt 依赖补充

- **文件**：`requirements.txt`
- **新增**：
  ```
  rich>=13.0.0
  jieba>=0.42.1
  ```
- **依赖**：无

---

## 阶段 1：爬虫层改造

### T-1.1 新建榜单配置常量 [P]

- **文件**：`scrape_fanqie_ranks.py`
- **内容**：在文件顶部新增 `LISTS` 字典，包含四个榜单的完整配置
- **字段**：`name`（中文名）、`name_en`、`prefix_1`、`prefix_2`、`category_id`、`file_key`、`base_url`、`init_href_pattern`、`color`、`icon`（Tabler 图标类名）
- **依赖**：T-0.1
- **验收**：`python -c "from scrape_fanqie_ranks import LISTS; print(len(LISTS))"` 输出 `4`

### T-1.2 重构爬虫为主函数 [P]

- **文件**：`scrape_fanqie_ranks.py`
- **内容**：将原有 `main()` 逻辑重构为 `run_single_list(list_key, limit=30, sleep_sec=5)` 函数
- **改动点**：
  - `init_url = LISTS[list_key]["base_url"]`
  - `href_pattern = LISTS[list_key]["init_href_pattern"]`
  - `output_file = os.path.join(OUTPUT_DIR, f"fanqie_{LISTS[list_key]['file_key']}_ranks_{date_str}.json")`
  - `state_file = os.path.join(OUTPUT_DIR, f"task_state_{LISTS[list_key]['file_key']}_{date_str}.json")`
- **依赖**：T-1.1
- **验收**：`python -c "from scrape_fanqie_ranks import run_single_list; print('OK')"` 无报错

### T-1.3 新建入口脚本 [P]

- **文件**：`scrape_all.py`
- **内容**：四榜顺序爬取主入口，调用 `run_single_list()`
- **间隔策略**：四榜间 `sleep(10s)`，同榜分类间 `sleep(5s)`（原有）
- **断点续传**：每榜独立 state file，中断不影响其他三榜
- **Rich 日志**：使用 `rich` 库替代 print 中的 Emoji
- **依赖**：T-1.2
- **验收**：`python scrape_all.py --help` 显示帮助信息

### T-1.4 关键词提取模块 [P]

- **文件**：`scripts/keywords_lib.py`（新增）
- **内容**：维护 `COMMON_KEYWORDS` / `MALE_KEYWORDS` / `FEMALE_KEYWORDS` 三套关键词库，各 20+ 分类
- **文件**：`scripts/extract_keywords.py`（新增）
- **内容**：
  - `extract_keywords(title, intro, is_male) -> list[str]`：规则匹配 + 标题冒号后半段正则提取
  - 最多返回 6 个标签
- **集成**：`scrape_fanqie_ranks.py` 中在构造书籍字典时调用 `extract_keywords()`
- **依赖**：T-1.2
- **验收**：对测试书名"重生后，我被战神娇养了"调用函数返回 `["重生", "战神"]` 以上

### T-1.5 爬虫本地测试

- **操作**：运行 `python scrape_all.py`（可用 `--dry-run` 模式跳过实际爬取，仅验证路径生成）
- **检查点**：
  - 四个榜单的文件名符合 `fanqie_{file_key}_ranks_*.json`
  - 每本书包含 `keywords` 字段
  - state file 按榜单独立
- **依赖**：T-1.3, T-1.4
- **验收**：本地生成完整四榜数据（可事后删除）

---

## 阶段 2：构建层改造

### T-2.1 四榜构建循环 [P]

- **文件**：`scripts/build_latest.py`
- **内容**：
  - `for list_key in LISTS` 替代原有的单榜硬编码
  - 快照路径：`data/fanqie_{list_key}_ranks_*.json`
  - `latest_{list_key}.json` 替代 `latest_ranks.json`
  - `market_summary_{list_key}.json` 替代 `market_summary.json`
  - `data/trends/{list_key}/` 替代 `data/trends/`
- **依赖**：T-1.1（T-1.1 中 LISTS 常量可被 build_latest.py import）
- **验收**：`python scripts/build_latest.py` 生成四个 `latest_*.json` 文件

### T-2.2 AI Prompt 按榜单定制 [P]

- **文件**：`scripts/build_latest.py`
- **内容**：`get_prompt_for_list(list_key)` 函数，返回男频阅读/男频新书/女频阅读/女频新书各自专属 prompt 模板
- **男频 prompt**：强调"长期霸榜""完本阅读""持续在读"等阅读榜特征
- **新书榜 prompt**：强调"新书上榜""题材风向""新人崛起"
- **依赖**：T-2.1
- **验收**：四个榜单的 AI 分析结论有明显差异（男频 vs 女频；阅读 vs 新书）

### T-2.3 GENRE_GROUPS 按性别分离 [P]

- **文件**：`scripts/build_latest.py`
- **内容**：
  - `MALE_GENRE_GROUPS`（5 大组）
  - `FEMALE_GENRE_GROUPS`（6 大组，沿用现有）
  - `get_genre_groups(list_key)` 函数，按榜单返回对应分组
- **依赖**：T-2.1
- **验收**：男频榜单不出现女频分类（如"豪门总裁"），女频不出现男频分类（如"战神赘婿"）

### T-2.4 dates.json 结构升级 [P]

- **文件**：`scripts/build_latest.py`
- **内容**：生成结构改为 `{ "dates": [...], "lists": { "male_read": {...}, ... } }`
- **依赖**：T-2.1
- **验收**：`data/dates.json` 包含 `lists` 字段且四个榜单 key 存在

### T-2.5 stats_{listKey}.json 生成 [P]

- **文件**：`scripts/build_latest.py`
- **内容**：每次构建时生成 `data/stats_{list_key}.json`
- **数据结构**：见 TRANSFORMATION_PLAN.md §10.5
- **依赖**：T-2.1
- **验收**：`data/stats_female_new.json` 存在且包含 `category_reads`、`top_books`、`trend_7d` 字段

### T-2.6 API 目录结构改造 [P]

- **文件**：`scripts/build_latest.py`
- **内容**：
  - `api/lastest/index.json` → 全榜索引（version: 2，含 lists + types 向后兼容）
  - `api/lastest/{list_key}/all.json` → 各榜全量数据
  - 旧版 `api/lastest/latest_ranks.json` 不再生成（由 latest_{list_key}.json 替代）
- **依赖**：T-2.1
- **验收**：四个榜单的 `api/lastest/{list_key}/all.json` 均可访问

### T-2.7 Rich 终端美化 [P]

- **文件**：`scripts/build_latest.py`
- **内容**：所有 `print()` 中的 Emoji 替换为 `rich` 库彩色输出
- **需清理的 Emoji**：`✅❌⚠️📦🔄↩️⭐📊` 等
- **依赖**：T-0.3
- **验收**：`python scripts/build_latest.py` 终端输出无 Emoji，颜色正常

---

## 阶段 3：图标库迁移（去 Emoji）

### T-3.1 Tabler Icons CDN 引入 [H]

- **文件**：`index.html`、`trend.html`、`book.html`（新建的 stats.html 同步引入）
- **内容**：在 `</head>` 前追加
  ```html
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">
  ```
- **依赖**：无
- **验收**：四个 HTML 文件均含此 CDN link

### T-3.2 index.html 菜单按钮图标替换 [H]

- **文件**：`index.html`
- **改动**：`<button>☰</button>` → `<button><i class="ti ti-menu-2"></i></button>`
- **依赖**：T-3.1
- **验收**：浏览器打开后菜单按钮显示为 Tabler icon

### T-3.3 js/app.js 图标替换 [J]

- **文件**：`js/app.js`
- **需替换位置**：
  - 空状态：`📭` → `<i class="ti ti-inbox"></i>`
  - 日历无数据：`📭` → `<i class="ti ti-calendar-off"></i>`
  - 加载中提示：补充 `<i class="ti ti-loader"></i>`
- **CSS 基础样式**：新增 `.ti-* { font-size: 1.1em; vertical-align: middle; }`
- **依赖**：T-3.1
- **验收**：空状态、加载中均有 Tabler icon 显示

### T-3.4 js/app.js 箭头按钮图标 [J]

- **文件**：`js/app.js`
- **改动**：`◀` → `<i class="ti ti-chevron-left"></i>`，`▶` → `<i class="ti ti-chevron-right"></i>`
- **依赖**：T-3.1
- **验收**：日期翻页按钮显示为 Tabler chevron 图标

### T-3.5 Python 脚本 Rich 美化 [P]

- **文件**：`scrape_fanqie_ranks.py`、`scrape_all.py`、`scripts/build_latest.py`
- **内容**：移除所有 Emoji print，用 `rich.console.Console` 替代
- **依赖**：T-0.3
- **验收**：运行脚本终端无 Emoji，颜色输出正常

---

## 阶段 4：前端层改造（四榜 Tab）

### T-4.1 index.html 榜单 Tab 导航 [H][J]

- **文件**：`index.html`
- **改动**：
  - 顶部 `<body>` 下新增 `<div class="rank-tabs" id="rank-tabs">`
  - 四个 Tab：`male_read` / `male_new` / `female_read` / `female_new`
  - Tab 内容使用 Tabler icon：`ti-user`（男）、`ti-heart`（女）
  - 侧边栏 `<h1>` 加 `id="list-title"`，`<p class="sidebar-subtitle">` 加 `id="list-subtitle"`
  - 页面 `<title>` 改为动态占位符（由 JS 填充）
- **默认选中**：由 JS 从 URL 参数或 localStorage 读取，默认 `female_new`（向后兼容）
- **依赖**：T-3.1, T-3.2, T-3.3
- **验收**：四个 Tab 均可点击，切换后标题和分类数据同步更新

### T-4.2 js/app.js 全局状态改造 [J]

- **文件**：`js/app.js`
- **新增全局变量**：
  ```javascript
  let currentListKey = localStorage.getItem('listKey') || 'female_new';
  const LIST_CONFIG = { /* 四榜配置，含 name、color、icon */ };
  ```
- **改造函数**：
  - `loadLatestData()` → `data/latest_${currentListKey}.json`
  - `loadDateData(dateStr)` → `data/fanqie_${currentListKey}_ranks_${YMD}.json`
  - `loadTrendData(dateStr)` → `data/trends/${currentListKey}/${date}.json`
  - `loadAvailableDates()` → 从 `data/dates.json.lists[currentListKey].dates` 读取
  - `renderListTitle()` → 更新 list-title / list-subtitle / document.title
- **Tab 点击事件**：
  ```javascript
  rankTabs.addEventListener('click', e => {
    const tab = e.target.closest('.rank-tab');
    if (!tab) return;
    currentListKey = tab.dataset.list;
    localStorage.setItem('listKey', currentListKey);
    renderListTitle();
    loadLatestData().then(applyData);
  });
  ```
- **book.html 跳转链接**：在跳转 URL 中附加 `&list=${currentListKey}`
- **依赖**：T-4.1
- **验收**：
  - Tab 切换后页面内容完全切换为对应榜单
  - 刷新页面保持当前 Tab 不变

### T-4.3 trend.html 榜单选择器 [H][J]

- **文件**：`trend.html`
- **改动**：
  - `<header>` 下新增与 index.html 同款的 `<div class="rank-tabs">`
  - 标题 `<h1>` 改为 `<h1 id="list-title">类型风向标</h1>`
  - `id="trend-subtitle"` 元素由 JS 动态填充
- **依赖**：T-3.1, T-4.1（T-4.1 的 Tab HTML 结构复用）
- **验收**：trend.html 有四个榜单 Tab，点击后切换

### T-4.4 js/trend.js 改造 [J]

- **文件**：`js/trend.js`
- **改动**：
  - `currentListKey` 状态 + `LIST_CONFIG`
  - `loadMarketData()` → `data/market_summary_${currentListKey}.json`
  - `loadTrendRows()` → `data/trends/${currentListKey}/` 目录
  - `getGenreGroups(listKey)` → 男频返回 `MALE_GENRE_GROUPS`，女频返回 `FEMALE_GENRE_GROUPS`
  - Tab 点击事件逻辑同 T-4.2
- **依赖**：T-4.3, T-2.3（T-2.3 的 GENRE_GROUPS）
- **验收**：切换榜单后趋势数据、市场看板同步更新

### T-4.5 book.html 标题改造 [H][J]

- **文件**：`book.html`
- **改动**：
  - `<title>` 改为 `<title id="page-title">作品详情 · 番茄风向标</title>`
  - `<meta name="description">` 改为动态
- **依赖**：T-3.1
- **验收**：book.html 有正确的页面标题

### T-4.6 js/book.js 改造 [J]

- **文件**：`js/book.js`
- **改动**：
  - 从 URL 读取 `list` 参数，无则默认 `female_new`（向后兼容旧链接）
  - 快照路径 `data/fanqie_${listKey}_ranks_${YMD}.json`
  - 页面标题 `document.title = "作品详情 · 番茄" + LIST_CONFIG[listKey].name`
  - 关键词标签渲染（调用 `renderKeywords(keywords)`）
- **关键词渲染函数**：
  ```javascript
  function renderKeywords(keywords) {
    // 生成 keyword-tag 标签，使用 ti ti-tag 图标
    // 无关键词时显示为空
  }
  ```
- **依赖**：T-4.5, T-1.4
- **验收**：book.html 打开后显示关键词标签（已有关键词数据的书籍）

### T-4.7 CSS Tab 样式与色彩 [C]

- **文件**：`css/style.css`
- **新增样式**：
  - `.rank-tabs` 容器（flex 布局，底边线）
  - `.rank-tab` 按钮（圆角胶囊、hover/active 状态）
  - `.rank-tab.active`（背景色使用榜单 color：`var(--list-color)`）
  - `:root { --male-color: #3B82F6; --female-color: #EC4899; --list-color: var(--female-color); }`
  - `.keyword-tag`（胶囊标签样式）
  - `.ti-*` 图标基础样式
  - `.stat-card` / `.stat-label` / `.stat-value`（stats.html 概览卡）
  - `.chart-card` / `.chart-card-wide` / `.chart-container`（图表容器）
  - `.empty-msg`（图标 + 文字 flex 布局）
  - `.stats-page` / `.stats-shell` / `.stats-topbar` / `.stats-grid` / `.stats-overview`（stats.html 布局）
- **依赖**：T-3.3, T-4.1
- **验收**：CSS 无报错，Tab 样式符合设计稿

---

## 阶段 5：图表数据页

### T-5.1 stats.html 页面骨架 [H][C]

- **文件**：`stats.html`（新建）
- **内容**：
  - 引入 `tabler-icons.min.css` + `echarts@5/dist/echarts.min.js`
  - `body.stats-page` 布局：topbar + rank-tabs + stats-overview + stats-grid
  - stats-overview：4 张统计卡（总在读 / 上榜作品 / 活跃分类 / 新书上榜）
  - stats-grid：5 个 chart-card（见 T-5.2）
- **依赖**：T-3.1, T-4.7
- **验收**：页面可正常打开，无 JS 报错

### T-5.2 js/stats.js 图表一 + 二 [J]

- **文件**：`js/stats.js`（新建）
- **图表一：分类在读人数横向柱状图**
  - 容器：`#chart-category-bar`
  - 数据来源：`data/stats_${currentListKey}.json` → `category_reads`
  - 交互：hover 显示分类详情，点击柱体高亮
- **图表二：单书在读 Top 20 柱状图**
  - 容器：`#chart-top-books`
  - 数据来源：`data/stats_${currentListKey}.json` → `top_books`
  - 每柱显示书名（截断）和在读人数
- **ECharts 公共配置**：`CHART_THEME`（暗色主题、Tooltip、分色板）
- **响应式**：`window.addEventListener('resize', chart.resize)`
- **依赖**：T-2.5（T-2.5 生成 stats JSON）、T-5.1
- **验收**：两张图表均渲染，数据正确

### T-5.3 js/stats.js 图表三 [J]

- **文件**：`js/stats.js`
- **图表三：分类在读趋势折线图**
  - 容器：`#chart-trend-line`
  - 数据来源：`data/stats_${currentListKey}.json` → `trend_7d`
  - 多线折线，每条线代表一个分类
  - 支持切换 7 日 / 14 日 / 30 日
- **依赖**：T-5.2
- **验收**：趋势线图渲染正确，支持时间范围切换

### T-5.4 js/stats.js 图表四 [J]

- **文件**：`js/stats.js`
- **图表四：分类阅读热力图**
  - 容器：`#chart-heatmap`
  - X 轴：Top 分类（最多 10 个）
  - Y 轴：排名区间（Top5 / Top10 / Top20 / Top30）
  - 颜色深浅：代表在读人数
- **依赖**：T-5.2
- **验收**：热力图矩阵正确显示，颜色梯度合理

### T-5.5 js/stats.js 图表五（四榜对比雷达图）[J]

- **文件**：`js/stats.js`
- **图表五：四榜分类对比雷达**
  - 容器：`#chart-radar-compare`
  - 数据来源：四个榜单的 `data/stats_*.json` 并行加载
  - 取四榜并集的 Top 分类，标准化为百分比
  - 雷达五个轴：各榜单的相对读者规模
- **依赖**：T-5.2（T-5.2 中 `buildRadarData()` 函数）
- **验收**：雷达图正确展示四榜对比

### T-5.6 stats.json 生成逻辑 [P]

- **文件**：`scripts/build_latest.py`（在 T-2.5 基础上完善）
- **补充**：生成 `data/trends_stats_{list_key}_7d.json`（独立趋势数据文件，供 stats.html 异步加载）
- **依赖**：T-2.5
- **验收**：`data/trends_stats_female_new_7d.json` 存在且格式正确

---

## 阶段 6：CI/CD 改造

### T-6.1 scrape.yml 增量检查改造 [Y]

- **文件**：`.github/workflows/scrape.yml`
- **改动**：
  - 四榜分别检查各自 `data/fanqie_${key}_ranks_${TODAY}.json`
  - `workflow_dispatch` 新增 `list_key` 输入参数
  - 检查通过则跳过爬取步骤
- **依赖**：T-1.3（T-1.3 的 scrape_all.py 入口）
- **验收**：修改后 CI 本地 `act` 测试（可选），或手动触发 workflow_dispatch 验证

### T-6.2 scrape.yml 顺序执行改造 [Y]

- **文件**：`.github/workflows/scrape.yml`
- **改动**：
  - 删除四次 `python scrape_fanqie_ranks.py` 重复调用
  - 改为单次调用 `python scrape_all.py`（脚本内控间隔）
  - 或单次调用 `python -c "from scrape_fanqie_ranks import run_single_list; run_single_list('${{ inputs.list_key }}')"`
- **依赖**：T-6.1
- **验收**：CI 日志显示四榜按顺序执行（间隔可见）

### T-6.3 scrape.yml 提交范围更新 [Y]

- **文件**：`.github/workflows/scrape.yml`
- **改动**：`file_pattern` 增加 `js css`
- **依赖**：T-6.2
- **验收**：`git diff .github/workflows/scrape.yml` 确认 file_pattern 包含 `js css`

---

## 阶段 7：数据迁移（一次性）

> 以下任务只在首次部署时执行一次，完成后打勾并 commit

### T-7.1 新建迁移脚本 [P]

- **文件**：`scripts/migrate_to_subdir.py`（新建）
- **内容**：
  - 将 `data/fanqie_female_new_ranks_*.json` → `data/female_new/snapshots/*.json`
  - 将 `data/trends/*.json` → `data/trends/female_new/*.json`
  - 将 `api/lastest/*.json` → `api/lastest/female_new/` 目录
- **dry-run 模式**：`--dry-run` 参数只打印操作，不实际执行
- **依赖**：T-2.1（T-2.1 生成的目录结构）
- **验收**：`python scripts/migrate_to_subdir.py --dry-run` 输出迁移计划

### T-7.2 执行数据迁移

- **操作**：去掉 `--dry-run` 实际执行迁移脚本
- **提交**：`git add data/ api/` + commit `chore: migrate female_new data to subdir structure`
- **依赖**：T-7.1, T-7.2（同一次部署）
- **验收**：
  - `data/female_new/snapshots/` 目录存在且包含所有旧快照
  - `data/trends/female_new/` 存在且包含旧趋势文件
  - `api/lastest/female_new/` 存在

### T-7.3 旧文件清理

- **操作**：删除根目录旧文件
  - `data/fanqie_female_new_ranks_*.json`（已迁移到子目录）
  - `data/latest_ranks.json`（由构建脚本重新生成）
  - `data/market_summary.json`（由构建脚本重新生成）
  - `data/dates.json`（由构建脚本重新生成）
  - `api/lastest/latest_ranks.json`（由构建脚本重新生成）
- **提交**：`git rm` + commit `chore: remove legacy single-list files`
- **依赖**：T-7.2
- **验收**：`ls data/` 和 `ls api/lastest/` 不含旧版文件名

---

## 阶段 8：集成测试与验收

### T-8.1 全链路本地测试

- **操作**（在 git 新分支上执行）：
  ```bash
  python scrape_all.py
  python scripts/build_latest.py
  python -m http.server 8080
  ```
- **检查点**：
  - [ ] index.html 四个 Tab 切换正常
  - [ ] trend.html 四个榜单数据独立
  - [ ] book.html 关键词标签显示
  - [ ] stats.html 五张图表渲染
  - [ ] 所有页面无 Emoji
  - [ ] Tabler Icons 全部正常显示
  - [ ] `data/fanqie_*_ranks_*.json` 四个榜单文件存在
  - [ ] `data/latest_*.json` 四个榜单文件存在
  - [ ] `data/market_summary_*.json` 四个榜单文件存在
  - [ ] `data/stats_*.json` 四个榜单文件存在
  - [ ] `api/lastest/{list_key}/all.json` 四个榜单文件存在
  - [ ] `data/trends/{list_key}/` 四个榜单目录存在
  - [ ] `data/dates.json` 包含 lists 字段
- **依赖**：阶段 1-7 全部完成
- **验收**：全部检查点通过

### T-8.2 浏览器兼容性检查

- **操作**：用 Chrome / Edge / Firefox 打开 `http://localhost:8080`
- **检查点**：
  - [ ] index.html 瀑布流布局正常
  - [ ] Tab 切换无闪烁
  - [ ] ECharts 图表全部渲染（Chrome/Edge 需确认 Chromium 内核下 ECharts 正常）
  - [ ] Tabler Icons CDN 可访问（网络正常时）
- **依赖**：T-8.1
- **验收**：三款浏览器均无报错

### T-8.3 Git 提交与 PR

- **操作**：
  ```bash
  git checkout -b feat/four-lists
  git add .
  git commit -m "feat: four-list tracker with charts and keywords"
  git push origin feat/four-lists
  ```
- **PR 内容**：说明改造内容、测试结果、验收截图
- **依赖**：T-8.1, T-8.2
- **验收**：PR 创建成功，CI 通过

### T-8.4 GitHub Pages 部署验证

- **操作**：GitHub Actions CI 完成后，打开 GitHub Pages 部署的站点
- **检查点**：
  - [ ] 线上 index.html 四个 Tab 正常
  - [ ] 线上 trend.html 数据正常
  - [ ] 线上 book.html 详情页正常
  - [ ] 线上 stats.html 图表正常
  - [ ] GitHub Pages URL 可正常访问
- **依赖**：T-8.3（PR merge 后 CI 自动部署）
- **验收**：线上站点完全可用

---

## 附录：任务依赖图

```
[T-0.1] → [T-1.1] → [T-1.2] → [T-1.3] → [T-1.4] → [T-1.5] ──┐
[T-0.2] ───────────────────────────────────────────────────┤
[T-0.3] ─────────────────────────────────────────────────┤
                                                              │
[T-1.1] ─────────────────────────────────────────────────┤
                                                              │
[T-1.1] → [T-2.1] → [T-2.2] → [T-2.3] → [T-2.4] ──→ [T-2.5] ──┤
[T-2.1] ──────────────────────────────────────────────→ [T-2.6] ──┤
[T-0.3] → [T-2.7] ─────────────────────────────────────────────────┤
                                                              │
[T-0.3] → [T-3.1] → [T-3.2] → [T-3.3] ───────────────────────────┤
[T-3.1] ───────────────────────────────────────────────────────┤
                                                              │
[T-3.1] → [T-4.1] ───→ [T-4.2] ───→ [T-4.3] ───→ [T-4.4] ──┐   │
[T-4.3] ───────────────────────────────────────────────┤   │
[T-4.5] ───────────────────────────────────────────────┤   │
[T-4.5] → [T-4.6] ───────────────────────────────────────────┤   │
[T-3.3] → [T-4.7] ───────────────────────────────────────────┤   │
                                                              │   │
[T-3.1] → [T-5.1] → [T-5.2] → [T-5.3] → [T-5.4] → [T-5.5] ──┤   │
[T-2.5] ───────────────────────────────────────────→ [T-5.6] ──┤   │
                                                              │
[T-1.3] → [T-6.1] → [T-6.2] → [T-6.3] ───────────────────────────┤
                                                              │
[T-2.1] → [T-7.1] → [T-7.2] → [T-7.3] ───────────────────────────┤
                                                              │
                                           [T-8.1] ← [阶段1-7] ─┤
                                           [T-8.2]              │
                                           [T-8.3]              │
                                           [T-8.4] ← [T-8.3] ──┘
```

---

## 验收总览表

| 任务 | 阶段 | 验收条件 | 状态 |
|------|------|---------|------|
| T-0.1 男频 DOM 验证 | 0 | 四个榜单分类数量和名称输出 | ☐ |
| T-0.2 代码快照 | 0 | git tag v1.0-base 存在 | ☐ |
| T-0.3 依赖补充 | 0 | requirements.txt 含 rich + jieba | ☐ |
| T-1.1 LISTS 常量 | 1 | `from scrape_fanqie_ranks import LISTS; len(LISTS)==4` | ☐ |
| T-1.2 run_single_list | 1 | 函数可正常调用，无报错 | ☐ |
| T-1.3 scrape_all.py | 1 | `--help` 正常，四榜顺序打印 | ☐ |
| T-1.4 关键词提取 | 1 | 测试用例返回正确标签 | ☐ |
| T-1.5 爬虫本地测试 | 1 | 四榜数据文件 + keywords 字段 | ☐ |
| T-2.1 四榜构建循环 | 2 | 四个 latest_*.json 生成 | ☐ |
| T-2.2 AI Prompt 定制 | 2 | 四个榜单 AI 结论有明显差异 | ☐ |
| T-2.3 GENRE_GROUPS | 2 | 男/女频分类无混淆 | ☐ |
| T-2.4 dates.json 升级 | 2 | 含 lists 字段，四榜 key 存在 | ☐ |
| T-2.5 stats JSON | 2 | stats_female_new.json 含三个字段 | ☐ |
| T-2.6 API 目录改造 | 2 | 四个 api/lastest/{key}/all.json 可访问 | ☐ |
| T-2.7 Rich 终端美化 | 2 | 终端输出无 Emoji，颜色正常 | ☐ |
| T-3.1 CDN 引入 | 3 | 四个 HTML 含 Tabler link | ☐ |
| T-3.2 菜单图标 | 3 | 浏览器显示 Tabler icon | ☐ |
| T-3.3 app.js 图标 | 3 | 空状态、加载中显示 Tabler icon | ☐ |
| T-3.4 箭头图标 | 3 | 翻页按钮显示 chevron | ☐ |
| T-3.5 Python Rich | 3 | 脚本无 Emoji | ☐ |
| T-4.1 index Tab | 4 | 四 Tab 可点击切换 | ☐ |
| T-4.2 app.js 状态 | 4 | Tab 切换内容同步更新 | ☐ |
| T-4.3 trend Tab | 4 | trend.html 有四榜单选择器 | ☐ |
| T-4.4 trend.js | 4 | 切换后趋势数据更新 | ☐ |
| T-4.5 book 标题 | 4 | book.html 标题正确 | ☐ |
| T-4.6 book.js 改造 | 4 | 关键词标签渲染 + list 参数 | ☐ |
| T-4.7 CSS 样式 | 4 | Tab 样式 + 关键词样式正常 | ☐ |
| T-5.1 stats.html | 5 | 页面正常打开，无报错 | ☐ |
| T-5.2 图表一+二 | 5 | 柱状图渲染正确 | ☐ |
| T-5.3 图表三 | 5 | 趋势折线图渲染正确 | ☐ |
| T-5.4 图表四 | 5 | 热力图渲染正确 | ☐ |
| T-5.5 图表五 | 5 | 雷达图渲染正确 | ☐ |
| T-5.6 stats 趋势文件 | 5 | trends_stats_*.json 存在 | ☐ |
| T-6.1 CI 增量检查 | 6 | 四榜分别检查逻辑正确 | ☐ |
| T-6.2 CI 顺序执行 | 6 | 日志显示顺序执行间隔 | ☐ |
| T-6.3 CI 提交范围 | 6 | file_pattern 含 js css | ☐ |
| T-7.1 迁移脚本 | 7 | --dry-run 打印迁移计划 | ☐ |
| T-7.2 执行迁移 | 7 | 三个子目录正确迁移 | ☐ |
| T-7.3 旧文件清理 | 7 | 无旧版文件名残留 | ☐ |
| T-8.1 全链路测试 | 8 | 全部 14 项检查点通过 | ☐ |
| T-8.2 浏览器兼容 | 8 | 三款浏览器无报错 | ☐ |
| T-8.3 Git 提交 | 8 | PR 创建成功，CI 通过 | ☐ |
| T-8.4 线上验证 | 8 | GitHub Pages 全功能正常 | ☐ |
