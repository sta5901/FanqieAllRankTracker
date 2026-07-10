# 番茄全榜风向标 · 四榜合一改造方案

> 文档版本：v1.1 · 2026-07-10  
> 目标：支持男频/女频 × 阅读榜/新书榜 共四个榜单，全链路改造 + 图表数据 + 关键词提取

---

## 一、现状分析

### 1.1 当前架构

```
FanqieAllRankTracker/
├── scrape_fanqie_ranks.py     # 爬虫（硬编码女频新书榜 1_1_1141）
├── scripts/
│   └── build_latest.py         # 构建脚本（硬编码 fanqie_female_new_ranks_*.json）
├── data/
│   ├── fanqie_female_new_ranks_*.json   # 快照文件（单榜）
│   ├── latest_ranks.json       # 聚合数据（单榜）
│   ├── market_summary.json     # 全站热点（单榜）
│   ├── dates.json              # 日期索引（未区分榜单）
│   └── trends/                # 趋势归档（未区分榜单）
├── api/lastest/               # 静态接口（单榜）
├── index.html                  # 入口页（硬编码女频新书榜）
├── trend.html                  # 风向标页（仅女频新书榜）
├── book.html                   # 作品详情页（仅女频新书榜）
├── js/app.js                  # 前端渲染逻辑（hardcoded 路径）
├── js/trend.js                # 风向标 JS（hardcoded 路径）
├── js/book.js                 # 作品详情 JS（hardcoded 路径）
└── .github/workflows/scrape.yml  # CI（仅爬取单榜）
```

### 1.2 四个榜单 URL 特征

| 榜单 | URL 前缀 | 文件名标识 | 榜单ID |
|------|----------|-----------|--------|
| 男频阅读榜 | `/rank/1_2_` | `male_read` | 1141 |
| 男频新书榜 | `/rank/1_1_` | `male_new` | 1141 |
| 女频阅读榜 | `/rank/0_2_` | `female_read` | 1139 |
| 女频新书榜 | `/rank/0_1_` | `female_new` | 1139 |

URL 结构规律：`https://fanqienovel.com/rank/{prefix_1}_{prefix_2}_{id}`
- `{prefix_1}`: 0=女频，1=男频
- `{prefix_2}`: 1=新书榜，2=阅读榜
- `{id}`: 男频=1141，女频=1139

### 1.3 当前核心问题

| 问题 | 影响范围 |
|------|---------|
| 爬虫硬编码单榜 URL | 无法获取其他三榜 |
| 构建脚本文件名硬编码 | 无法合并多榜数据 |
| 前端 hardcoded 文件路径 | 只能展示单榜 |
| AI 分析仅女频新书榜 | 男频分析空白 |
| dates.json/trends 未分区 | 历史数据混淆 |
| GitHub Actions 单次爬取 | 四榜并发触发反爬 |

---

## 二、改造目标

### 2.1 核心目标

1. **四榜并行追踪**：男频阅读榜 + 男频新书榜 + 女频阅读榜 + 女频新书榜
2. **数据隔离存储**：每个榜单独立快照，独立趋势，独立 API
3. **统一看板展示**：Tab 切换榜单，共用基础设施
4. **AI 分析四榜覆盖**：每个榜单独立 AI 总结，独立全站热点
5. **防反爬工程化**：四榜顺序爬取，时间间隔保护
6. **Git 全自动闭环**：CI 触发 → 四榜爬取 → 构建 → 提交 → 部署

### 2.2 数据流改造目标

```
CI 触发（每日 UTC 00:00）
    │
    ├── 1. 爬取男频阅读榜 (1_2_1141)  ──→ fanqie_male_read_ranks_*.json
    │                                    ↓ sleep 8s
    ├── 2. 爬取男频新书榜 (1_1_1141)  ──→ fanqie_male_new_ranks_*.json
    │                                    ↓ sleep 8s
    ├── 3. 爬取女频阅读榜 (0_2_1139)  ──→ fanqie_female_read_ranks_*.json
    │                                    ↓ sleep 8s
    └── 4. 爬取女频新书榜 (0_1_1139)  ──→ fanqie_female_new_ranks_*.json
                                               │
                                               ▼
                              scripts/build_latest.py（四榜各自构建）
                                               │
                          ┌────────────────────┼────────────────────┐
                          ▼                    ▼                    ▼
              latest_male_read.json  latest_male_new.json  latest_female_read.json  latest_female_new.json
                          │                    │                    │                    │
                          └────────────────────┴────────────────────┘
                                               │
                                               ▼
                              四榜数据 → api/lastest/（各自独立）
                                               │
                                               ▼
                              四榜趋势 → data/trends/{list_key}/（独立目录）
                                               │
                                               ▼
                              market_summary_{list_key}.json（四榜各自独立）
                                               │
                                               ▼
                              GitHub Pages 部署 → 四榜看板（Tab 切换）
```

---

## 三、详细改造方案

### 3.1 数据模型定义

新增统一榜单标识符（list_key）：

```python
LISTS = {
    "male_read": {
        "name": "男频阅读榜",
        "name_en": "Male Reading",
        "prefix_1": "1",
        "prefix_2": "2",
        "category_id": "1141",
        "file_key": "male_read",
        "base_url": "https://fanqienovel.com/rank/1_2_1141",
        "init_href_pattern": "/rank/1_2_",   # 用于从入口页提取分类链接
        "color": "#3B82F6",                  # 男频蓝
        "emoji": "🧑",
    },
    "male_new": {
        "name": "男频新书榜",
        "name_en": "Male New Books",
        "prefix_1": "1",
        "prefix_2": "1",
        "category_id": "1141",
        "file_key": "male_new",
        "base_url": "https://fanqienovel.com/rank/1_1_1141",
        "init_href_pattern": "/rank/1_1_",
        "color": "#60A5FA",
        "emoji": "🧑‍💻",
    },
    "female_read": {
        "name": "女频阅读榜",
        "name_en": "Female Reading",
        "prefix_1": "0",
        "prefix_2": "2",
        "category_id": "1139",
        "file_key": "female_read",
        "base_url": "https://fanqienovel.com/rank/0_2_1139",
        "init_href_pattern": "/rank/0_2_",
        "color": "#EC4899",                  # 女频粉
        "emoji": "👩",
    },
    "female_new": {
        "name": "女频新书榜",
        "name_en": "Female New Books",
        "prefix_1": "0",
        "prefix_2": "1",
        "category_id": "1139",
        "file_key": "female_new",
        "base_url": "https://fanqienovel.com/rank/0_1_1139",
        "init_href_pattern": "/rank/0_1_",
        "color": "#F472B6",
        "emoji": "👩‍🦰",
    },
}
```

**新增 `data/trends/` 目录结构**（按榜单分区）：
```
data/
├── trends/
│   ├── male_read/         # 男频阅读榜趋势目录
│   │   ├── 2026-07-06.json
│   │   └── ...
│   ├── male_new/          # 男频新书榜趋势目录（现有单榜移入）
│   │   └── ...
│   ├── female_read/       # 女频阅读榜趋势目录
│   │   └── ...
│   └── female_new/        # 女频新书榜趋势目录（现有内容移入）
│       └── ...
```

**新增 `api/lastest/` 目录结构**：
```
api/lastest/
├── index.json              # 改为：全榜索引（列四个榜单 + 各自子类型）
├── all.json                # 改为：四榜全量（list_key 区分）
├── male_read/
│   ├── all.json            # 男频阅读榜全量
│   └── {category}.json     # 男频阅读榜各分类
├── male_new/
│   └── ...
├── female_read/
│   └── ...
└── female_new/
    └── ...（现有结构移入male_new目录）
```

---

### 3.2 爬虫层改造（scrape_fanqie_ranks.py）

#### 3.2.1 新增入口脚本 scrape_all.py

将原有 `scrape_fanqie_ranks.py` 重构为可复用模块，新建 `scrape_all.py` 作为统一入口：

```python
# scrape_all.py — 四榜顺序爬取主入口
import time
from datetime import datetime
from scrape_fanqie_ranks import run_single_list  # 重构后的单榜函数

LISTS_ORDER = ["male_read", "male_new", "female_read", "female_new"]
SLEEP_BETWEEN_LISTS = 10  # 榜单间休息 10 秒
SLEEP_BETWEEN_CATS = 5     # 同榜分类间休息 5 秒（原有）

def main():
    for list_key in LISTS_ORDER:
        print(f"\n{'='*50}")
        print(f"[{datetime.now().strftime('%H:%M:%S')}] 开始爬取：{LISTS[list_key]['name']}")
        print(f"{'='*50}")
        try:
            run_single_list(list_key, sleep_sec=SLEEP_BETWEEN_CATS)
        except Exception as e:
            print(f"❌ {LISTS[list_key]['name']} 爬取失败: {e}")
            # 单榜失败不影响其他榜，继续执行
        time.sleep(SLEEP_BETWEEN_LISTS)
    print("\n✅ 四榜爬取全部完成")

if __name__ == "__main__":
    main()
```

#### 3.2.2 重构 scrape_fanqie_ranks.py → run_single_list()

```python
# 改造后的核心函数签名
def run_single_list(list_key: str, limit: int = 30, sleep_sec: int = 5):
    """
    爬取指定榜单。
    
    Args:
        list_key: 榜单标识符（male_read / male_new / female_read / female_new）
        limit: 每分类 Top N
        sleep_sec: 分类间间隔秒数
    """
    cfg = LISTS[list_key]
    base_url = cfg["base_url"]
    file_key = cfg["file_key"]
    # ... 原有逻辑，改动点：
    # 1. init_url = base_url
    # 2. categories_js 中匹配 href_pattern = cfg["init_href_pattern"]
    # 3. output_file = fanqie_{file_key}_ranks_{date}.json
    # 4. state_file = task_state_{file_key}_{date}.json
```

#### 3.2.3 断点续传支持（重要）

每个榜单独立 state file，防止中断后全部重来：

```python
# 每个榜单独立的状态文件
state_file = os.path.join(OUTPUT_DIR, f"task_state_{file_key}_{date_str}.json")

# 恢复逻辑：只续当前榜单，不影响其他三榜
```

#### 3.2.4 改造检查清单

| 改动点 | 文件 | 具体修改 |
|--------|------|---------|
| 榜单配置常量 | `scrape_fanqie_ranks.py` | 新增 `LISTS` 字典定义四个榜单 |
| 函数参数化 | `scrape_fanqie_ranks.py` | `run_single_list(list_key)` 替代硬编码 |
| URL 动态化 | `scrape_fanqie_ranks.py` | `init_url = LISTS[list_key]["base_url"]` |
| 分类提取正则 | `scrape_fanqie_ranks.py` | `href_pattern` 从配置读取 |
| 文件名动态化 | `scrape_fanqie_ranks.py` | `fanqie_{file_key}_ranks_{date}.json` |
| 状态文件隔离 | `scrape_fanqie_ranks.py` | `task_state_{file_key}_{date}.json` |
| 新增入口脚本 | `scrape_all.py` | 四榜顺序调用入口 |
| 保留原脚本 | `scrape_fanqie_ranks.py` | 默认行为不变（女频新书榜），兼容手动运行 |

---

### 3.3 构建层改造（scripts/build_latest.py）

#### 3.3.1 核心改动：四榜独立构建循环

```python
# 核心改造伪代码
def main():
    # 遍历四个榜单，各自构建
    for list_key in ["male_read", "male_new", "female_read", "female_new"]:
        snapshots = glob.glob(f"data/fanqie_{list_key}_ranks_*.json")
        if not snapshots:
            print(f"⚠️  未找到 {list_key} 快照，跳过")
            continue
        
        latest = snapshots[-1]
        prev = snapshots[-2] if len(snapshots) >= 2 else None
        
        # 对比趋势
        trends = compare_categories(latest, prev)
        
        # AI 总结（使用各自榜单的 prompt 模板）
        trends = generate_ai_summaries(..., list_key=list_key)
        
        # 写入 latest_{list_key}.json
        write_latest(list_key, trends)
        
        # 写入 trends/{list_key}/YYYY-MM-DD.json
        write_trend(list_key, trends)
        
        # 写入 market_summary_{list_key}.json
        write_market_summary(list_key)
        
        # 写入 api/lastest/{list_key}/all.json + 分类文件
        write_api(list_key)
        
        print(f"✅ {LISTS[list_key]['name']} 构建完成")

    # 写入全榜索引 api/lastest/index.json
    write_global_index()
```

#### 3.3.2 AI Prompt 按榜单定制

| 榜单 | Prompt 调整 |
|------|------------|
| 男频阅读榜 | 强调「长期霸榜」「完本阅读」「持续在读」等阅读榜特征 |
| 男频新书榜 | 强调「新书上榜」「题材风向」「新人崛起」等新书榜特征 |
| 女频阅读榜 | 沿用现有女频 prompt（已适配女频阅读行为） |
| 女频新书榜 | 沿用现有 prompt（已验证） |

> 💡 **关键洞察**：阅读榜的 AI 分析维度应区分"存量稳定"和"增量爆发"，新书榜侧重"题材新鲜度"和"读者猎奇心理"。

#### 3.3.3 GENRE_GROUPS 按性别分组

```python
MALE_GENRE_GROUPS = [
    {"name": "玄幻奇幻", "categories": ["东方仙侠", "传统玄幻", "西方奇幻", "玄幻脑洞"]},
    {"name": "都市题材", "categories": ["都市修真", "都市日常", "都市种田", "都市脑洞", "都市高武"]},
    {"name": "历史军事", "categories": ["历史古代", "历史脑洞", "战神赘婿", "抗战谍战"]},
    {"name": "科幻悬疑", "categories": ["科幻末世", "悬疑灵异", "悬疑脑洞"]},
    {"name": "衍生创作", "categories": ["游戏体育", "动漫衍生", "男频衍生"]},
]

FEMALE_GENRE_GROUPS = [
    {"name": "古风言情", "categories": ["古风世情", "古言脑洞", "宫斗宅斗", "种田"]},
    {"name": "现代言情", "categories": ["现言脑洞", "豪门总裁", "职场婚恋", "青春甜宠"]},
    {"name": "幻想言情", "categories": ["玄幻言情", "科幻末世", "悬疑脑洞", "女频悬疑"]},
    {"name": "快穿衍生", "categories": ["快穿", "女频衍生"]},
    {"name": "年代民国", "categories": ["年代", "民国言情"]},
    {"name": "娱乐星光", "categories": ["星光璀璨"]},
]
```

#### 3.3.4 dates.json 改造

```json
{
  "dates": ["2026-07-06", "2026-07-07", "..."],
  "lists": {
    "male_read": {"dates": [...], "latest": "2026-07-10"},
    "male_new":  {"dates": [...], "latest": "2026-07-10"},
    "female_read":{"dates": [...], "latest": "2026-07-10"},
    "female_new": {"dates": [...], "latest": "2026-07-10"}
  }
}
```

#### 3.3.5 改造检查清单

| 改动点 | 文件 | 具体修改 |
|--------|------|---------|
| 榜单配置导入 | `build_latest.py` | 导入 `LISTS` 常量 |
| 多榜构建循环 | `build_latest.py` | `for list_key in LISTS` 替代单榜逻辑 |
| 快照路径动态 | `build_latest.py` | `fanqie_{list_key}_ranks_*.json` |
| AI prompt 模板 | `build_latest.py` | 按 list_key 选择 prompt 模板 |
| GENRE_GROUPS | `build_latest.py` | 分男女频两套分组 |
| trends 目录分区 | `build_latest.py` | `data/trends/{list_key}/` |
| market_summary | `build_latest.py` | `market_summary_{list_key}.json` |
| api 目录分区 | `build_latest.py` | `api/lastest/{list_key}/` |
| dates.json 升级 | `build_latest.py` | 增加 `lists` 字段 |
| 迁移旧数据 | — | 现有 `fanqie_female_new_ranks_*.json` → `female_new/` |

---

### 3.4 前端层改造

#### 3.4.1 index.html — 榜单 Tab 导航

**改造前**（单榜）：
```html
<aside class="sidebar">
    <div class="sidebar-header">
        <h1>番茄风向标</h1>
        <p class="sidebar-subtitle">女频新书榜追踪</p>
    </div>
</aside>
```

**改造后**（四榜 Tab）：
```html
<!-- 顶部 Tab 切换 -->
<div class="rank-tabs" id="rank-tabs">
    <button class="rank-tab active" data-list="male_read">
        🧑 男频阅读榜
    </button>
    <button class="rank-tab" data-list="male_new">
        🧑‍💻 男频新书榜
    </button>
    <button class="rank-tab" data-list="female_read">
        👩 女频阅读榜
    </button>
    <button class="rank-tab" data-list="female_new">
        👩‍🦰 女频新书榜
    </button>
</div>

<!-- 侧边栏保留分类导航（不变）-->
<aside class="sidebar">
    <div class="sidebar-header">
        <h1 id="list-title">男频阅读榜</h1>
        <p class="sidebar-subtitle" id="list-subtitle">阅读量风向追踪</p>
    </div>
</aside>
```

#### 3.4.2 index.html — 页面标题动态化

```html
<title id="page-title">番茄男频阅读榜 · 风向标</title>
<meta name="description" id="page-desc" content="番茄小说男频阅读榜趋势分析">
```

#### 3.4.3 js/app.js — 核心改造

```javascript
// 改造要点：

// 1. 新增 listKey 全局状态
let currentListKey = "male_read";  // 默认男频阅读榜

// 2. 榜单配置（前端内联或从 API 加载）
const LIST_CONFIG = {
    male_read:  { name: "男频阅读榜", subtitle: "阅读量风向追踪", color: "#3B82F6", emoji: "🧑" },
    male_new:   { name: "男频新书榜", subtitle: "新人上榜风向追踪", color: "#60A5FA", emoji: "🧑‍💻" },
    female_read:{ name: "女频阅读榜", subtitle: "阅读量风向追踪", color: "#EC4899", emoji: "👩" },
    female_new: { name: "女频新书榜", subtitle: "新人上榜风向追踪", color: "#F472B6", emoji: "👩‍🦰" },
};

// 3. 数据加载路径改造
function loadLatestData() {
    // 改造前: data/latest_ranks.json
    // 改造后: data/latest_{listKey}.json
    return fetch(`data/latest_${currentListKey}.json?${cacheBuster}`)
        .then(r => r.json());
}

function loadDateData(dateStr) {
    // 改造前: data/fanqie_female_new_ranks_YYYYMMDD.json
    // 改造后: data/fanqie_{listKey}_ranks_YYYYMMDD.json
    const fileKey = listKey;  // e.g. "male_read"
    const snapshotUrl = `data/fanqie_${fileKey}_ranks_${fileDateStr}.json?${cacheBuster}`;
    // trends 也按榜单分区
    const trendUrl = `data/trends/${fileKey}/${dateStr}.json?${cacheBuster}`;
    // ...
}

// 4. Tab 切换逻辑
document.getElementById("rank-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".rank-tab");
    if (!tab) return;
    
    const newListKey = tab.dataset.list;
    if (newListKey === currentListKey) return;
    
    currentListKey = newListKey;
    // 更新 Tab 激活状态
    // 更新页面标题
    // 重新加载数据
    renderListTitle();
    loadLatestData().then(applyData);
});

// 5. 日期导航改造：dates.json 按榜单获取可用日期
function loadAvailableDates() {
    return fetch(`data/dates.json?${cacheBuster}`)
        .then(r => r.json())
        .then(idx => {
            const listDates = idx.lists?.[currentListKey]?.dates || idx.dates || [];
            return listDates;
        });
}
```

#### 3.4.4 trend.html — 榜单切换 + 标题

```html
<!-- 新增榜单选择器 -->
<div class="trend-list-selector" id="trend-list-selector">
    <button class="rank-tab active" data-list="male_read">🧑 男频阅读榜</button>
    <button class="rank-tab" data-list="male_new">🧑‍💻 男频新书榜</button>
    <button class="rank-tab" data-list="female_read">👩 女频阅读榜</button>
    <button class="rank-tab" data-list="female_new">👩‍🦰 女频新书榜</button>
</div>
```

```javascript
// js/trend.js 改造：
// 1. 加载 market_summary_{listKey}.json 而非统一的 market_summary.json
// 2. trendRows 从 data/trends/{listKey}/ 目录加载
// 3. GENRE_GROUPS 根据 listKey 切换（男频/女频）
// 4. market_summary.json 的 periods key 按榜单分别存储

// 改造后路径：
const marketUrl = `data/market_summary_${currentListKey}.json?${cacheBuster}`;
const trendUrl  = `data/trends/${currentListKey}/${date}.json?${cacheBuster}`;
```

#### 3.4.5 book.html — 榜单标识传递

```html
<!-- URL 增加 list 参数 -->
<!-- 改造前: book.html?id=xxx -->
<!-- 改造后: book.html?id=xxx&list=male_read -->

<!-- 从 index.html 跳转时携带 listKey -->
<a href="book.html?id=${bookId}&list=${currentListKey}">
```

```javascript
// js/book.js 改造：
// 1. 从 URL 读取 list 参数
const listKey = params.get("list") || "female_new";

// 2. 数据文件路径
function snapshotUrl(date) {
    return `data/fanqie_${listKey}_ranks_${date.replace(/-/g, "")}.json`;
}

// 3. 页面标题
document.title = `作品详情 · 番茄${LIST_CONFIG[listKey].name}`;
```

#### 3.4.6 CSS 改造（css/style.css）

```css
/* 新增 Tab 样式 */
.rank-tabs {
    display: flex;
    gap: 4px;
    padding: 12px 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
}

.rank-tab {
    flex-shrink: 0;
    padding: 6px 14px;
    border-radius: 20px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.2s;
}

.rank-tab.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
}

/* 榜单色彩变量 */
:root {
    --male-color: #3B82F6;
    --female-color: #EC4899;
    --list-accent: var(--male-color);  /* 动态切换 */
}
```

#### 3.4.7 前端改造检查清单

| 改动点 | 文件 | 具体修改 |
|--------|------|---------|
| Tab 导航 | `index.html` | 新增四个榜单 Tab |
| 动态标题 | `index.html` | `<title>` 和 `<meta>` 动态化 |
| 数据路径 | `js/app.js` | `latest_${listKey}.json` |
| 快照路径 | `js/app.js` | `fanqie_${listKey}_ranks_${date}.json` |
| trends 路径 | `js/app.js` | `data/trends/${listKey}/` |
| Tab 切换逻辑 | `js/app.js` | 切换 listKey → reload |
| 日期索引 | `js/app.js` | 从 dates.json.lists 读取 |
| Tab 导航 | `trend.html` | 新增榜单选择器 |
| market_summary | `js/trend.js` | `market_summary_${listKey}.json` |
| trend rows | `js/trend.js` | `data/trends/${listKey}/` |
| GENRE_GROUPS | `js/trend.js` | 按 listKey 切换男/女频 |
| URL 参数 | `js/book.js` | 增加 `list` 参数 |
| 快照路径 | `js/book.js` | `fanqie_${listKey}_ranks_*.json` |
| Tab 样式 | `css/style.css` | 新增 `.rank-tab` 样式 |
| 色彩变量 | `css/style.css` | 新增男/女频主题色 |

---

### 3.5 CI/CD 层改造（.github/workflows/scrape.yml）

#### 3.5.1 改造方案

**问题**：四榜并发爬取会触发番茄反爬机制。

**方案**：CI 中四榜顺序执行，通过 Python 脚本统一调度，不依赖四次 Workflow 调用。

```yaml
name: Daily Fanqie Four Lists Scraper

on:
  schedule:
    # 每天 UTC 00:00（北京时间 08:00）
    - cron: '0 0 * * *'
  workflow_dispatch:
    inputs:
      list_key:
        description: '指定榜单（留空则爬取全部四榜）'
        required: false
        default: ''

jobs:
  scrape-and-commit:
    runs-on: ubuntu-22.04
    # ...

    steps:
    - name: Checkout
      uses: actions/checkout@v4

    # ── 增量检查：四榜分别检查 ──
    - name: Check existing data
      id: check_data
      run: |
        TODAY=$(date -u +"%Y%m%d")
        
        # 如果 workflow_dispatch 指定了单榜，只检查该榜
        LIST_KEY="${{ github.event.inputs.list_key }}"
        if [ -z "$LIST_KEY" ]; then
          LIST_KEYS="male_read male_new female_read female_new"
        else
          LIST_KEYS="$LIST_KEY"
        fi
        
        ALL_EXIST=true
        for key in $LIST_KEYS; do
          FILE="data/fanqie_${key}_ranks_${TODAY}.json"
          if [ -f "$FILE" ]; then
            echo "✅ $key 今日数据已存在: $FILE"
          else
            echo "📭 $key 今日数据不存在"
            ALL_EXIST=false
          fi
        done
        
        if [ "$ALL_EXIST" = true ]; then
          echo "all_exists=true" >> $GITHUB_OUTPUT
          echo "exists=true" >> $GITHUB_OUTPUT
        else
          echo "all_exists=false" >> $GITHUB_OUTPUT
          echo "exists=false" >> $GITHUB_OUTPUT
        fi

    - name: Set up Python
      uses: actions/setup-python@v5
      with:
        python-version: '3.9'
        cache: 'pip'

    - name: Install Dependencies
      run: |
        pip install -r requirements.txt
        # Playwright 仅在需要爬取时安装
        if [ "${{ steps.check_data.outputs.exists }}" = "false" ]; then
          playwright install --with-deps chromium
          pip install openai
        fi

    # ── 顺序爬取四榜（单次执行，脚本内控间隔）──
    - name: Run Four Lists Scraper
      if: steps.check_data.outputs.exists == 'false'
      run: |
        if [ -z "${{ github.event.inputs.list_key }}" ]; then
          python scrape_all.py
        else
          python -c "
          from scrape_fanqie_ranks import run_single_list
          run_single_list('${{ github.event.inputs.list_key }}')
          "
        fi
      env:
        GITHUB_ACTIONS: true

    # ── 四榜各自构建 ──
    - name: Build All Lists Data
      if: steps.check_data.outputs.exists == 'false'
      run: python scripts/build_latest.py
      env:
        API_BASE_URL: ${{ secrets.API_BASE_URL }}
        API_KEY: ${{ secrets.API_KEY }}
        API_MODEL: ${{ secrets.API_MODEL }}

    # ── 迁移旧数据（首次改造执行一次）──
    - name: Migrate old female_new data
      if: steps.check_data.outputs.exists == 'false'
      run: |
        # 将旧的 fanqie_female_new_ranks_*.json 迁移到 data/female_new/ 快照目录
        python scripts/migrate_to_subdir.py --list female_new
      # 此步骤只在首次部署或数据迁移时需要，平时跳过

    - name: Commit and Push
      uses: stefanzweifel/git-auto-commit-action@v5
      with:
        commit_message: "[Auto] Update Fanqie four lists daily ranks"
        file_pattern: data api index.html trend.html book.html js css
        branch: main
```

#### 3.5.2 断点续传在 CI 中的处理

```yaml
# 每个榜单独立 state file，保证 CI 中断后能续跑
# 示例：CI 运行到一半中断，重新触发时：
# - male_read ✅ 已完成（state file 存在，数据完整）
# - male_new ⏳ 中断（state file 存在，但数据不完整）→ 续跑
# - female_read ❌ 未开始 → 从头跑
```

#### 3.5.3 手动触发优化

```yaml
# workflow_dispatch 支持指定单榜调试
# 用途：某榜页面结构变化时，单独重跑该榜而不影响其他三榜
```

#### 3.5.4 CI 改造检查清单

| 改动点 | 文件 | 具体修改 |
|--------|------|---------|
| 入口脚本 | `scrape_all.py` | 新建，四榜顺序调度 |
| 四榜增量检查 | `scrape.yml` | 各自检查 `fanqie_${key}_ranks_${TODAY}.json` |
| 顺序爬取 | `scrape.yml` | 调用 `scrape_all.py`（单 Job，内控间隔） |
| 分榜单触发 | `scrape.yml` | `workflow_dispatch.list_key` 参数 |
| 迁移脚本 | `scripts/migrate_to_subdir.py` | 新建，迁移旧数据到子目录 |
| 提交范围 | `scrape.yml` | `file_pattern` 增加 `js css`（前端改动） |

---

## 四、用户未曾提及的补充改造点

### 4.1 数据迁移

现有 `data/fanqie_female_new_ranks_*.json` 需要迁移到 `data/female_new/` 子目录，新增迁移脚本：

```python
# scripts/migrate_to_subdir.py
"""
首次改造时执行：将旧版文件名迁移到新版目录结构。
执行一次后不再需要。
"""
```

**迁移策略**：
- `fanqie_female_new_ranks_*.json` → `data/female_new/snapshots/*.json`
- `data/trends/*.json` → `data/trends/female_new/*.json`
- 不迁移 `latest_ranks.json`（由构建脚本重新生成）

### 4.2 API 接口版本管理

改造后 API 结构变化，需要向后兼容：

```json
// api/lastest/index.json
{
  "version": 2,
  "date": "2026-07-10",
  "lists": {
    "male_read":  {"name": "男频阅读榜", "url": "api/lastest/male_read/all.json"},
    "male_new":   {"name": "男频新书榜", "url": "api/lastest/male_new/all.json"},
    "female_read":{"name": "女频阅读榜", "url": "api/lastest/female_read/all.json"},
    "female_new": {"name": "女频新书榜", "url": "api/lastest/female_new/all.json"}
  },
  "types": { ... }  // 保留原有单榜类型索引（向后兼容）
}
```

### 4.3 旧版文件清理

**首次部署时执行一次**：
- 删除根目录的 `fanqie_female_new_ranks_*.json`（迁移后）
- 删除 `latest_ranks.json`（由构建脚本重新生成）
- 删除 `data/trends/*.json`（迁移到 `data/trends/female_new/`）
- 删除旧的 `api/lastest/*.json`（由构建脚本重新生成）

### 4.4 前端 URL 回退兼容

book.html 从旧版 index.html 跳转时可能不带 `list` 参数，需要回退到女频新书榜（向后兼容）：

```javascript
const listKey = params.get("list") || "female_new";  // 兼容旧链接
```

### 4.5 男频与女频的分类差异处理

> ⚠️ **重要发现**：男频和女频在番茄小说的分类体系完全不同！
> - 男频分类示例：玄幻脑洞、都市日常、东方仙侠、战神赘婿、历史古代、游戏体育
> - 女频分类示例：古风世情、现言脑洞、豪门总裁、快穿、年代

**影响**：
1. `GENRE_GROUPS` 必须按男/女分开（已在 §3.3.3 处理）
2. AI prompt 的题材关键词库需要按性别定制（男频更多"爽文"、"系统"、"无敌"；女频更多"甜宠"、"重生"、"豪门"）
3. trend.html 切换榜单时，`genreGroups` 变量需要动态切换

**男频题材关键词（建议新增）**：
```
战神、赘婿、神医、奶爸、兵王、修罗、阎罗、无双、狂少、继承、豪门、
系统、穿越、重生、无敌流、爽文、修仙、都市、乡村、年代、星际、
机甲、异界、退婚、翻身、打脸、装逼、护短、护国、杀伐果断
```

### 4.6 全站热点跨榜对比（新增功能）

四榜分离后，可以新增一个**全站总览页**（`all.html`）：

```html
<!-- 新增 all.html：四榜同屏对比 -->
<div class="four-lists-grid">
    <section class="list-panel male_read">...</section>
    <section class="list-panel male_new">...</section>
    <section class="list-panel female_read">...</section>
    <section class="list-panel female_new">...</section>
</div>
```

功能：同时展示四榜 Top 10，适合快速横向对比男女频市场差异。

### 4.7 SEO 与链接改造

| 改动点 | 说明 |
|--------|------|
| Sitemap 生成 | 可新增 `sitemap.json` 索引四个榜单的分类页 |
| OG Tag 动态化 | 每个榜单的 Open Graph 标题/描述不同 |
| RSS 源 | 可新增 `feed_{listKey}.json` 分榜单订阅 |

### 4.8 错误处理与告警

```yaml
# GitHub Actions 失败通知（可扩展）
- name: Notify on failure
  if: failure()
  run: |
    echo "::error::Fanqie scraper failed. Check Actions logs."
```

---

## 五、改造执行顺序（推荐）

### 第一阶段：基础设施（改动风险低）

1. **新建 `scrape_all.py`**：新建文件，不动原有逻辑
2. **重构 `scrape_fanqie_ranks.py`**：新增 `run_single_list(list_key)` 函数，保留原行为
3. **数据迁移脚本**：`scripts/migrate_to_subdir.py`
4. **本地测试**：单独跑四个榜单爬取，验证数据完整性

### 第二阶段：构建层（核心改造）

5. **改造 `build_latest.py`**：四榜独立构建循环
6. **本地测试**：`python scripts/build_latest.py`，验证四榜数据生成
7. **API 验证**：检查 `api/lastest/male_read/` 等目录结构

### 第三阶段：前端层（界面改造）

8. **改造 `index.html` + `js/app.js`**：Tab 切换 + 数据路径改造
9. **改造 `trend.html` + `js/trend.js`**：榜单选择器 + 趋势数据路径
10. **改造 `book.html` + `js/book.js`**：URL 参数 + 快照路径
11. **改造 `css/style.css`**：Tab 样式
12. **本地预览**：`python -m http.server 8000`，验证四个榜单切换

### 第四阶段：CI/CD（收尾）

13. **改造 `.github/workflows/scrape.yml`**：四榜顺序执行
14. **执行数据迁移脚本**（一次性）
15. **Git 提交 → 推送 → GitHub Actions 自动部署**
16. **线上验证**：GitHub Pages 检查四个榜单

---

## 六、风险评估

| 风险 | 等级 | 缓解方案 |
|------|------|---------|
| 番茄小说反爬升级 | 高 | 四榜间隔 8s，已够保守；可后续加随机延迟 |
| 男频页面结构与女频不同 | 中 | 需实际访问男频页面验证 DOM 选择器 |
| 男频分类数量/名称差异 | 中 | 爬虫使用动态提取（从入口页抓所有分类链接），不依赖固定列表 |
| 改造期间数据丢失 | 中 | CI 增量检查，只在数据不存在时爬取 |
| AI API 成本翻 4 倍 | 中 | 可配置每个榜单独立开关；初期只开女频新书榜 AI |
| 前端 JS 改动引 Bug | 中 | 保留旧版 `latest_ranks.json` 生成逻辑作为 fallback |

### 男频页面验证（需实测）

在开始编码前，建议先访问以下页面确认 DOM 结构：

```python
# 验证脚本（可先单独运行）
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chrome")
    page = browser.new_page()
    
    # 验证男频阅读榜
    page.goto("https://fanqienovel.com/rank/1_2_1141", timeout=15000)
    page.wait_for_selector('a[href^="/page/"]', timeout=5000)
    categories = page.evaluate("""
        () => Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('/rank/1_2_'))
            .map(a => ({ name: a.innerText.trim(), href: a.getAttribute('href') }))
    """)
    print("男频阅读榜分类:", categories)
    
    # 同样验证男频新书榜 (1_1_)
    # ...
```

---

## 七、验收标准

改造完成后，系统应满足以下标准：

| 验收项 | 标准 |
|--------|------|
| 四个榜单独立存储 | `data/fanqie_*_ranks_*.json` 各自独立，无混淆 |
| Tab 切换正常 | 前端四个 Tab 点击后正确加载对应榜单数据 |
| AI 分析四榜覆盖 | 每个榜单 `latest_{listKey}.json` 包含 AI summary |
| 趋势数据分区 | `data/trends/{listKey}/` 各自独立，无交叉污染 |
| API 接口正确 | `api/lastest/{listKey}/all.json` 各自独立可访问 |
| 断点续传有效 | 单榜中断后重跑只补缺失分类，不重复爬取 |
| CI 全自动 | 每日 UTC 00:00 自动运行并提交，无人工干预 |
| 历史数据兼容 | `book.html?id=xxx` 旧链接自动回退到女频新书榜 |
| 本地开发可用 | `python scrape_all.py && python scripts/build_latest.py && python -m http.server` |

---

## 八、文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 新增 | `docs/TRANSFORMATION_PLAN.md` | 本改造文档 |
| 新增 | `scrape_all.py` | 四榜顺序爬取入口 |
| 修改 | `scrape_fanqie_ranks.py` | 重构为 `run_single_list(list_key)` |
| 新增 | `scripts/migrate_to_subdir.py` | 旧数据迁移脚本（一次性） |
| 修改 | `scripts/build_latest.py` | 四榜独立构建循环 |
| 修改 | `index.html` | 新增榜单 Tab 导航 |
| 修改 | `js/app.js` | 数据路径 + Tab 切换逻辑 |
| 修改 | `trend.html` | 新增榜单选择器 |
| 修改 | `js/trend.js` | 趋势数据路径 + GENRE_GROUPS 切换 |
| 修改 | `book.html` | 标题 + 链接改造 |
| 修改 | `js/book.js` | URL 参数 + 快照路径 |
| 修改 | `css/style.css` | Tab 样式 + 榜单主题色 |
| 修改 | `.github/workflows/scrape.yml` | 四榜顺序执行 + 分榜触发 |
| 新增 | `all.html` | 全站四榜同屏对比页（可选） |
| 修改 | `README.md` | 更新文档说明四榜功能 |
| 新增 | `stats.html` | 图表数据页（在读人数可视化） |
| 新增 | `js/stats.js` | 图表数据渲染（ECharts） |
| 新增 | `scripts/extract_keywords.py` | 关键词提取脚本 |
| 新增 | `data/keywords.json` | 关键词提取结果存储 |
| 修改 | `scrape_fanqie_ranks.py` | 增加 `keywords` 字段写入 |
| 修改 | `scripts/build_latest.py` | 集成关键词提取步骤 |
| 修改 | `js/book.js` | 展示作品关键词标签 |
| 修改 | `css/style.css` | 关键词标签样式 + 图标样式 |

---

## 九、图标库迁移（去除 Emoji）

### 9.1 现状盘点

项目中 Emoji 使用情况盘点：

| 位置 | Emoji | 类型 | 处理方式 |
|------|-------|------|---------|
| `js/app.js` 空状态 | `📭` | UI 元素 | 替换为 SVG |
| `index.html` 菜单按钮 | `☰` | Unicode 符号 | 替换为 Tabler Icon |
| `index.html` 日期导航 | `◀` `▶` | Unicode 符号 | 保留（功能性箭头，兼容性好） |
| `scripts/build_latest.py` | `✅❌⚠️📦🔄↩️` | Python print | 改用 `rich` 库着色终端输出 |
| 页面 `panel-kicker` 标签 | 中文文本 | 已有语义标签 | 不动 |
| CSS/HTML 注释 | 中文 | 注释 | 不动 |
| docs/ 文档 | Emoji | 文档装饰 | 文档中替换为文字标签 |

### 9.2 图标库选型

**选择：Tabler Icons**

| 维度 | 结论 |
|------|------|
| 授权 | MIT，完全免费商用 |
| 图标数量 | 7000+ 个，覆盖所有业务场景 |
| 设计风格 | 2px 描边，与现有暗色编辑器风格完全契合 |
| 使用方式 | SVG sprite CDN，无需构建工具 |
| 中文站 | tabler.io/icons |
| CDN | `https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css` |

**备选对比：**

| 图标库 | 优点 | 缺点 |
|--------|------|------|
| Tabler Icons | 描边风格最佳、MIT 授权、CDN 友好 | 需手动按名引用 |
| Lucide | 社区活跃、tree-shaking 友好 | 默认填充风格为主 |
| Heroicons | Tailwind 官方出品 | 需要 @heroicons/react 或手动 SVG |
| Font Awesome | 知名度最高 | 6 开始需要注册，免费版限制 |

### 9.3 替换方案

#### 9.3.1 HTML 层：引入 CDN

在所有 HTML 文件 `<head>` 中加入（已有 `style.css` 的 `<link>` 后追加）：

```html
<!-- Tabler Icons CDN -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">
```

#### 9.3.2 index.html 菜单按钮

**改造前：**
```html
<button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="菜单">☰</button>
```

**改造后：**
```html
<button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="菜单">
    <i class="ti ti-menu-2"></i>
</button>
```

#### 9.3.3 js/app.js 空状态图标

**改造前：**
```javascript
waterfall.innerHTML = '<p style="color:var(--text-muted);padding:20px;">该分类暂无书籍。</p>';
// ...
waterfall.innerHTML = `<div class="empty-state">
    <p>📭 该日期（${dateStr}）暂无数据</p>
    ...
</div>`;
```

**改造后：**
```javascript
waterfall.innerHTML = '<p class="empty-msg"><i class="ti ti-inbox"></i> 该分类暂无书籍。</p>';
// ...
waterfall.innerHTML = `<div class="empty-state">
    <p class="empty-msg"><i class="ti ti-calendar-off"></i> 该日期（${dateStr}）暂无数据</p>
    ...
</div>`;
```

#### 9.3.4 Python 脚本终端输出（rich 库）

安装依赖：
```bash
pip install rich
```

**改造前：**
```python
print(f"✅ 成功提取到 {len(categories)} 个分类标签")
print(f"📭 今日数据不存在，将执行爬取")
print("❌ 未找到任何 JSON 快照文件")
```

**改造后：**
```python
from rich.console import Console
from rich.theme import Theme
console = Console(theme=Theme({
    "success": "green bold",
    "warning": "yellow",
    "error": "red bold",
    "info": "cyan",
}))

console.print(f"[success]✓[/] 成功提取到 {len(categories)} 个分类标签")
console.print(f"[warning]![/] 今日数据不存在，将执行爬取")
console.print("[error]✗[/] 未找到任何 JSON 快照文件")
console.print(f"[info]→[/] 开始爬取：{cfg['name']}")
```

> 💡 `rich` 库支持颜色、进度条、表格，比 Emoji 更专业，且跨平台兼容。

#### 9.3.5 CSS 图标基础样式

```css
/* 图标统一基础样式 */
[class*="ti-"] {
    font-size: 1.1em;
    vertical-align: middle;
    display: inline-block;
}

/* 空状态图标 */
.empty-msg {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
    padding: 20px;
}

.empty-msg i {
    font-size: 1.4rem;
    opacity: 0.5;
}
```

### 9.4 图标对照表（核心替换）

| 业务场景 | Emoji | Tabler Icon | 类名 |
|---------|-------|------------|------|
| 菜单 | `☰` | menu-2 | `ti ti-menu-2` |
| 空状态/无数据 | `📭` | inbox | `ti ti-inbox` |
| 日历无数据 | `📭` | calendar-off | `ti ti-calendar-off` |
| 加载中 | — | loader | `ti ti-loader` |
| 趋势上升 | `↑` | trend-up | `ti ti-trend-up` |
| 趋势下降 | `↓` | trend-down | `ti ti-trend-down` |
| 新上榜 | NEW | spark | `ti ti-spark` |
| 复制 | — | copy | `ti ti-copy` |
| 打开外部链接 | — | external-link | `ti ti-external-link` |
| 返回 | — | arrow-left | `ti ti-arrow-left` |
| 前进/后退 | `◀` `▶` | chevron-left / chevron-right | `ti ti-chevron-left` |
| GitHub | — | brand-github | `ti ti-brand-github` |
| AI 分析 | `🤖` | brain | `ti ti-brain` |
| 书籍 | — | book | `ti ti-book` |
| 图表 | — | chart-bar | `ti ti-chart-bar` |
| 关键词 | — | tag | `ti ti-tag` |

---

## 十、图表数据页设计（stats.html）

### 10.1 设计目标

番茄小说的**在读人数**是最核心的指标，可以直接反映题材热度、市场偏好和读者规模。本页以在读人数为核心，围绕四个榜单设计图表数据可视化。

### 10.2 核心图表设计

#### 图表一：分类在读人数排行榜（横向柱状图）

**数据来源**：`latest_{listKey}.json` → 各分类的 books[].reads

**逻辑**：聚合当前榜单下所有分类的总在读人数，排序后以横向柱状图展示。

```javascript
// js/stats.js - 分类聚合
function getCategoryReads(listKey) {
    return allData.categories.map(cat => {
        const totalReads = cat.books.reduce((sum, book) => {
            return sum + parseReads(book.reads);
        }, 0);
        const avgReads = cat.books.length > 0
            ? totalReads / cat.books.length : 0;
        return {
            name: cat.name,
            totalReads,
            avgReads,
            bookCount: cat.books.length,
        };
    }).sort((a, b) => b.totalReads - a.totalReads);
}

// ECharts 横向柱状图
option = {
    tooltip: { trigger: 'axis', formatter: '{b}: {c} 在读' },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: names, axisLabel: { fontSize: 12 } },
    series: [{
        type: 'bar',
        data: values,
        itemStyle: { color: listConfig[listKey].color },
        label: { show: true, position: 'right', formatter: '{c}' }
    }]
};
```

**图表样式**：横向柱状图，总在读人数降序，每柱显示具体数值。

#### 图表二：单书在读人数 Top 20（柱状图 + 气泡）

**数据来源**：当前榜单全部书籍的 reads 值排序

```javascript
// 聚合四榜所有书，取每个榜单 Top 20
function getTopBooks(listKey, limit = 20) {
    const allBooks = allData.categories.flatMap(cat => cat.books);
    return allBooks
        .map(book => ({ ...book, readsValue: parseReads(book.reads) }))
        .sort((a, b) => b.readsValue - a.readsValue)
        .slice(0, limit);
}
```

#### 图表三：分类在读人数趋势线图（多线折线图）

**数据来源**：`data/trends/{listKey}/YYYY-MM-DD.json` → `reads_growth[].growth`

**逻辑**：取最近 7/14/30 日，对每个分类计算每日总在读增量，绘制趋势折线。

```javascript
// 按日期 × 分类 聚合
function buildTrendMatrix(listKey, days) {
    const rows = loadTrendRows(listKey, days);
    const categories = new Set();
    rows.forEach(row => {
        Object.keys(row.trends).forEach(k => categories.add(k));
    });

    const series = Array.from(categories).map(catName => {
        const data = rows.map(row => {
            const trend = row.trends[catName];
            const growth = (trend?.reads_growth || [])
                .reduce((sum, item) => sum + parseReadsGrowth(item.growth), 0);
            return growth;
        });
        return { name: catName, type: 'line', data };
    });

    return {
        xAxis: { data: rows.map(r => r.date) },
        series
    };
}
```

#### 图表四：阅读量分布箱线图/热力图

**数据来源**：各分类的 books[].reads

**展示形式**：热力图矩阵

```
         玄幻脑洞   都市日常   东方仙侠   战神赘婿
Top 5   ████████  ███████   ████████  ████
Top 10  ██████    ████████  ██████    ██████
Top 20  ████      █████     ████      ████
Top 30  ███       ████      ███       ███
```

ECharts 支持 `heatmap` 类型，X 轴为分类，Y 轴为排名区间，颜色深浅代表在读人数。

#### 图表五：榜单对比雷达图

**数据来源**：四个榜单的分类总在读人数

**展示形式**：四榜同时展示，每榜选 Top 5 分类，以雷达图对比读者分布。

### 10.3 stats.html 页面结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>图表数据 · 番茄风向标</title>
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">
    <!-- ECharts CDN -->
    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
</head>
<body class="stats-page">
    <div class="stats-shell">
        <header class="stats-topbar">
            <div>
                <a href="index.html" class="back-link">
                    <i class="ti ti-arrow-left"></i> 返回榜单
                </a>
                <h1>图表数据</h1>
                <p id="stats-subtitle">加载中...</p>
            </div>
        </header>

        <!-- 榜单 Tab 筛选 -->
        <div class="rank-tabs" id="stats-rank-tabs">
            <button class="rank-tab active" data-list="male_read">
                <i class="ti ti-user"></i> 男频阅读榜
            </button>
            <button class="rank-tab" data-list="male_new">
                <i class="ti ti-rocket"></i> 男频新书榜
            </button>
            <button class="rank-tab" data-list="female_read">
                <i class="ti ti-heart"></i> 女频阅读榜
            </button>
            <button class="rank-tab" data-list="female_new">
                <i class="ti ti-star"></i> 女频新书榜
            </button>
        </div>

        <!-- 统计概览 -->
        <section class="stats-overview">
            <div class="stat-card">
                <span class="stat-label">总在读人数</span>
                <strong class="stat-value" id="total-reads">--</strong>
            </div>
            <div class="stat-card">
                <span class="stat-label">上榜作品</span>
                <strong class="stat-value" id="total-books">--</strong>
            </div>
            <div class="stat-card">
                <span class="stat-label">活跃分类</span>
                <strong class="stat-value" id="total-cats">--</strong>
            </div>
            <div class="stat-card">
                <span class="stat-label">新书上榜</span>
                <strong class="stat-value" id="new-books-count">--</strong>
            </div>
        </section>

        <!-- 图表网格 -->
        <main class="stats-grid">
            <!-- 图表一：分类在读排行 -->
            <section class="chart-card chart-card-wide">
                <h2><i class="ti ti-chart-bar"></i> 分类在读人数排行</h2>
                <div id="chart-category-bar" class="chart-container"></div>
            </section>

            <!-- 图表二：单书 Top 20 -->
            <section class="chart-card">
                <h2><i class="ti ti-crown"></i> 单书在读 Top 20</h2>
                <div id="chart-top-books" class="chart-container"></div>
            </section>

            <!-- 图表三：趋势线图 -->
            <section class="chart-card chart-card-wide">
                <h2><i class="ti ti-trending-up"></i> 分类在读趋势（近7日）</h2>
                <div id="chart-trend-line" class="chart-container"></div>
            </section>

            <!-- 图表四：热力图 -->
            <section class="chart-card">
                <h2><i class="ti ti-flame"></i> 分类阅读热力图</h2>
                <div id="chart-heatmap" class="chart-container"></div>
            </section>

            <!-- 图表五：四榜对比雷达 -->
            <section class="chart-card chart-card-wide">
                <h2><i class="ti ti-radar"></i> 四榜分类对比雷达</h2>
                <div id="chart-radar-compare" class="chart-container"></div>
            </section>
        </main>
    </div>

    <script src="js/stats.js"></script>
</body>
</html>
```

### 10.4 ECharts 公共配置

```javascript
// js/stats.js - 全局 ECharts 主题
const CHART_THEME = {
    color: ['#3B82F6', '#EC4899', '#10B981', '#F59E0B'],
    textStyle: { fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif' },
    tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(30,34,51,0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#E2E8F0' }
    },
    legend: {
        textStyle: { color: '#94A3B8' }
    },
    grid: {
        left: '3%', right: '4%', bottom: '8%',
        containLabel: true
    },
};

// 响应式 resize
window.addEventListener('resize', () => {
    charts.forEach(chart => chart.resize());
});
```

### 10.5 API 数据结构扩展

为支持图表，在 `build_latest.py` 中生成统计聚合文件：

```python
# data/stats_{listKey}.json
# 由 build_latest.py 在构建时生成，供 stats.html 直接使用

{
    "date": "2026-07-10",
    "list_key": "male_read",
    "stats": {
        "total_reads": 12345678,
        "total_books": 720,
        "total_categories": 24,
        "avg_reads_per_book": 17146,
        "avg_reads_per_category": 514403,
    },
    "category_reads": [
        {"name": "玄幻脑洞", "total": 2345678, "avg": 78189, "count": 30},
        ...
    ],
    "top_books": [
        {"title": "...", "author": "...", "reads": "234.5万", "reads_value": 2345000, "category": "..."},
        ...
    ],
    "trend_7d": {
        "categories": ["玄幻脑洞", ...],
        "dates": ["2026-07-04", "2026-07-05", ...],
        "series": [
            {"name": "玄幻脑洞", "data": [12345, 23456, ...]},
            ...
        ]
    }
}
```

### 10.6 四榜对比雷达图数据构建

```javascript
// 四榜各自取 Top 5 分类，计算各分类在读人数百分比
async function buildRadarData() {
    const lists = ['male_read', 'male_new', 'female_read', 'female_new'];
    const allData = await Promise.all(
        lists.map(key => fetch(`data/stats_${key}.json`).then(r => r.json()))
    );

    // 对齐分类：取四榜并集
    const allCategories = new Set();
    allData.forEach(d => {
        d.category_reads.forEach(cat => allCategories.add(cat.name));
    });

    // 标准化到百分比（各自 Top 分类 = 100%）
    const radarSeries = lists.map((key, i) => {
        const data = allData[i];
        const maxCat = data.category_reads[0];
        const maxVal = maxCat ? maxCat.total : 1;
        return {
            name: LIST_CONFIG[key].name,
            value: Array.from(allCategories).map(catName => {
                const cat = data.category_reads.find(c => c.name === catName);
                return cat ? Math.round((cat.total / maxVal) * 100) : 0;
            })
        };
    });

    return { categories: Array.from(allCategories), series: radarSeries };
}
```

---

## 十一、关键词提取

### 11.1 需求分析

#### 现状

当前单作品数据字段：
```json
{
    "title": "书名",
    "author": "作者",
    "reads": "34.8万",
    "intro": "简介文本",
    "cover": "封面URL",
    "url": "https://fanqienovel.com/page/xxx"
}
```

**缺少**：关键词标签。关键词可以：
- 帮助用户快速了解作品题材（系统流、重生、甜宠等）
- 丰富 AI 分析的输入维度
- 支持作品筛选和聚类

#### 实现难度评估

| 方法 | 难度 | 精度 | 依赖 | 推荐场景 |
|------|------|------|------|---------|
| **基于规则匹配**（推荐） | ⭐ 低 | 中 | 无 | 第一步实现，稳定可控 |
| **jieba 分词 + TF-IDF** | ⭐⭐ 中 | 高 | jieba | 第二步，提取未登录词 |
| **大模型提取（LLM）** | ⭐⭐⭐ 高 | 最高 | OpenAI API | AI 分析时附带生成 |
| **正则规则** | ⭐ 低 | 中 | 无 | 标题模式（"《XXX：YYY》" 提取冒号后半段） |

**推荐路线**：先用**规则匹配**快速上线，再用 **jieba + TF-IDF** 深度优化。

### 11.2 方案一：规则关键词匹配（推荐第一步实现）

#### 关键词库

在 `scripts/keywords_lib.py` 中维护两套关键词库（男频/女频分开）：

```python
# scripts/keywords_lib.py

# === 通用关键词 ===
COMMON_KEYWORDS = {
    "重生": ["重生", "再活一世", "回到过去", "重活"],
    "系统": ["系统", "面板", "提示音", "任务系统"],
    "穿越": ["穿越", "转生", "异世界", "穿书", "穿成"],
    "空间": ["空间", "随身空间", "异空间", "位面"],
    "甜宠": ["甜宠", "宠文", "甜文", "宠夫", "宠妻", "撒糖"],
    "虐恋": ["虐恋", "虐文", "虐心", "BE", "刀子"],
    "爽文": ["爽文", "打脸", "逆袭", "装逼打脸", "爽"],
    "无敌": ["无敌", "最强", "满级", "秒杀", "一打十"],
    "种田": ["种田", "发家致富", "家长里短", "日常"],
    "萌宝": ["萌宝", "崽", "宝宝", "团子", "幼崽"],
    "权谋": ["权谋", "朝堂", "朝代", "帝王", "谋士"],
    "军婚": ["军婚", "兵哥", "军人", "特种兵"],
    "豪门": ["豪门", "总裁", "霸总", "世家", "财阀"],
    "星际": ["星际", "机甲", "星球", "宇宙", "赛博"],
    "修仙": ["修仙", "飞升", "筑基", "金丹", "修士"],
    "末世": ["末世", "丧尸", "废土", "天灾", "囤货"],
    "娱乐圈": ["娱乐圈", "爱豆", "偶像", "影帝", "顶流"],
    "校园": ["校园", "大学", "高中", "暗恋", "学长"],
    "快穿": ["快穿", "任务者", "攻略", "位面穿梭"],
    "玄学": ["玄学", "风水", "算命", "相师", "天师"],
    "无限流": ["无限流", "副本", "逃生", "生存游戏"],
}

# === 男频专属关键词 ===
MALE_KEYWORDS = {
    "战神": ["战神", "兵王", "军神", "修罗"],
    "神医": ["神医", "医圣", "医仙", "医术"],
    "奶爸": ["奶爸", "萌娃", "带娃", "女儿奴"],
    "赘婿": ["赘婿", "上门女婿", "入赘"],
    "都市": ["都市", "都市文", "现代都市"],
    "乡村": ["乡村", "农村", "致富"],
    "玄幻": ["玄幻", "奇幻", "魔法"],
    "历史": ["历史", "古代", "架空", "穿越古代"],
    "游戏": ["游戏", "电竞", "网游", "虚拟游戏"],
    "悬疑": ["悬疑", "推理", "探案", "破案"],
}

# === 女频专属关键词 ===
FEMALE_KEYWORDS = {
    "宫斗": ["宫斗", "后宫", "妃子", "宠妃"],
    "宅斗": ["宅斗", "内宅", "嫡女", "庶女"],
    "和离": ["和离", "休夫", "和离书"],
    "替嫁": ["替嫁", "冲喜", "代嫁"],
    "逃荒": ["逃荒", "灾年", "流民"],
    "美食": ["美食", "做饭", "厨艺", "食肆"],
    "民国": ["民国", "军阀", "姨太太"],
    "年代": ["年代", "七零", "八零", "知青"],
    "真假千金": ["真假千金", "掉包", "抱错"],
    "先婚后爱": ["先婚后爱", "契约婚姻", "隐婚"],
    "追妻": ["追妻", "火葬场", "破镜重圆"],
    "双洁": ["双洁", "身心干净"],
    "无CP": ["无CP", "无男主", "无女主", "独自美丽"],
    "民国言情": ["民国", "军阀", "少爷", "小姐"],
    "电竞甜": ["电竞", "游戏", "CP", "甜"],
}
```

#### 提取逻辑

```python
# scripts/extract_keywords.py

def extract_keywords(title: str, intro: str, is_male: bool = False) -> list[str]:
    """
    从书名和简介中提取关键词标签。

    Args:
        title: 书名
        intro: 简介
        is_male: 是否男频（决定关键词库）

    Returns:
        关键词列表，如 ["重生", "系统", "甜宠", "都市"]
    """
    text = f"{title} {intro}".lower()
    found = []

    for kw_set in [COMMON_KEYWORDS, (MALE_KEYWORDS if is_male else FEMALE_KEYWORDS)]:
        for keyword, patterns in kw_set.items():
            if keyword in found:
                continue
            for pattern in patterns:
                if pattern in text:
                    found.append(keyword)
                    break

    # 正则：从标题提取副标题（如《XXX：逆袭之路》 → 逆袭）
    colons = re.findall(r'[：:]\s*([^\]]{2,8})', title)
    for colon in colons:
        if colon not in found and len(colon) >= 2:
            found.append(colon.strip())

    return found[:6]  # 最多 6 个标签
```

#### 与爬虫集成

```python
# scrape_fanqie_ranks.py - 提取后写入 JSON

category_books.append({
    "title": t,
    "author": a,
    "reads": cleaned_r,
    "intro": i,
    "cover": c,
    "url": "https://fanqienovel.com" + b.get("url", ""),
    # 新增字段
    "keywords": extract_keywords(t, i, is_male=(list_key.startswith("male"))),
})
```

#### JSON 输出示例

```json
{
    "title": "重生后，我被战神娇养了",
    "author": "三月九",
    "reads": "34.8万",
    "intro": "前世她被渣男蒙蔽双眼，落得家破人亡。重生后，她手撕剧本，...",
    "cover": "https://...",
    "url": "https://fanqienovel.com/page/...",
    "keywords": ["重生", "甜宠", "战神", "豪门", "复仇"]
}
```

### 11.3 方案二：jieba + TF-IDF（进阶实现）

```python
# scripts/extract_keywords_tfidf.py

import jieba
import re
from collections import Counter
from pathlib import Path
import json

# 结巴精确模式分词
def tokenize(text: str) -> list[str]:
    return [w for w in jieba.cut(text) if len(w) >= 2 and w.isalpha()]

STOPWORDS = set(['一个', '什么', '这个', '那个', '他们', '我们', ...])

def extract_by_tfidf(snapshot_path: str, top_n: int = 20) -> dict:
    """
    对一批书名+简介做 TF-IDF，提取各分类的高权重词作为代表关键词。
    用于补充规则库未覆盖的新兴题材。
    """
    with open(snapshot_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    category_keywords = {}
    for cat in data["categories"]:
        texts = [f"{b['title']} {b['intro']}" for b in cat.get("books", [])]
        # 简单 TF-IDF（可改用 sklearn）
        word_counts = Counter()
        for text in texts:
            words = [w for w in tokenize(text) if w not in STOPWORDS]
            word_counts.update(words)

        # 取高频词（每分类 Top 5）
        category_keywords[cat["name"]] = [
            word for word, count in word_counts.most_common(top_n)
        ]

    return category_keywords
```

> ⚠️ jieba 分词依赖：需要 `pip install jieba`，CI 中需要预装。

### 方案三：LLM 提取（最精准，放在 AI 分析流程中）

在 `scripts/build_latest.py` 的 AI prompt 中附带：

```
## 额外任务
请为上述每本书提取 3-5 个关键词标签（如"重生"、"系统"、"甜宠"、"都市"），
以 JSON 格式附在每本书的 reads 后面。
```

由 AI 生成的关键词最准确，但成本高，适合作为"精品标注"而非全量生成。

### 11.4 前端展示

```html
<!-- js/book.js - 作品详情页关键词标签 -->
<div class="book-keywords" id="book-keywords">
    <!-- 由 JS 动态渲染 -->
</div>
```

```javascript
// js/book.js
function renderKeywords(keywords) {
    const el = document.getElementById("book-keywords");
    if (!keywords || !keywords.length) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = `
        <span class="keywords-label">
            <i class="ti ti-tag"></i> 关键词
        </span>
        ${keywords.map(kw => `<span class="keyword-tag">${escapeHtml(kw)}</span>`).join('')}
    `;
}

// 调用
const keywords = latest.book.keywords || [];
renderKeywords(keywords);
```

### 11.5 CSS 样式

```css
/* 关键词标签 */
.keyword-tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    background: var(--surface-tint);
    border: 1px solid var(--accent-soft);
    border-radius: 20px;
    font-size: 0.78rem;
    color: var(--accent);
    font-weight: 500;
}

.keywords-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.78rem;
    color: var(--text-muted);
    margin-right: 6px;
}
```

### 11.6 实现优先级

| 阶段 | 内容 | 依赖 | 工作量 |
|------|------|------|-------|
| **P0** 规则匹配 | `scripts/keywords_lib.py` + `extract_keywords()` | 无 | 半天 |
| **P0** 集成爬虫 | 在 `scrape_fanqie_ranks.py` 中调用 | P0 | 1 小时 |
| **P0** 前端展示 | book.html + CSS | P0 | 1 小时 |
| **P1** jieba TF-IDF | `extract_keywords_tfidf.py` | jieba | 半天 |
| **P2** LLM 提取 | 在 AI 分析流程中附带 | OpenAI API | 1 天 |

**推荐实现顺序**：P0 × 3 → 测试验证 → P1 → P2

---

## 十二、改造执行总览（含新增需求）

### 12.1 最终文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `docs/TRANSFORMATION_PLAN.md` | 本改造文档 |
| 新增 | `scrape_all.py` | 四榜顺序爬取入口 |
| 修改 | `scrape_fanqie_ranks.py` | 重构 + 关键词提取 + rich 日志 |
| 新增 | `scripts/migrate_to_subdir.py` | 旧数据迁移（一次性） |
| 修改 | `scripts/build_latest.py` | 四榜独立构建 + stats JSON 生成 |
| 新增 | `scripts/keywords_lib.py` | 男/女频关键词库 |
| 新增 | `scripts/extract_keywords.py` | 规则关键词提取器 |
| 新增 | `scripts/extract_keywords_tfidf.py` | TF-IDF 关键词提取（进阶） |
| 修改 | `index.html` | 榜单 Tab 导航 + Tabler Icons CDN |
| 修改 | `js/app.js` | 数据路径 + Tab 切换 + SVG 图标 |
| 修改 | `trend.html` | 榜单选择器 + Tabler Icons CDN |
| 修改 | `js/trend.js` | 趋势数据路径 + GENRE_GROUPS 切换 |
| 修改 | `book.html` | 标题 + 链接改造 |
| 修改 | `js/book.js` | URL 参数 + 快照路径 + 关键词展示 |
| 新增 | `stats.html` | 图表数据页 |
| 新增 | `js/stats.js` | ECharts 图表渲染 |
| 新增 | `all.html` | 全站四榜同屏对比页（可选） |
| 修改 | `css/style.css` | Tab 样式 + 榜单色 + 关键词样式 + 图标样式 |
| 修改 | `.github/workflows/scrape.yml` | 四榜顺序 + 分榜触发 |
| 新增 | `requirements.txt` | 添加 `rich` 依赖 |

### 12.2 依赖更新

```txt
# requirements.txt
playwright==1.41.0
pytest-playwright==0.4.0
openai>=1.0.0          # AI 分析
jieba>=0.42.1          # 中文分词（关键词提取 P1）
rich>=13.0.0           # 终端美化（替代 Emoji）
```

### 12.3 最终验收标准（更新版）

| 验收项 | 标准 |
|--------|------|
| Emoji 全清除 | 项目所有 .html / .js / .py 文件中无 Emoji |
| 图标正常显示 | Tabler Icons CDN 引入，图标在所有页面正常显示 |
| 图表页可运行 | stats.html 加载后展示 5 张图表，数据正确 |
| 关键词提取 | 每本书 keywords 字段非空，准确率 ≥ 80% |
| 四榜数据隔离 | 各自独立 data/ 子目录，无混淆 |
| Tab 切换正常 | 前端四个 Tab 点击后正确加载对应榜单数据 |
| AI 分析四榜覆盖 | 每个榜单 latest_{listKey}.json 包含 AI summary |
| 趋势数据分区 | data/trends/{listKey}/ 各自独立 |
| API 接口正确 | api/lastest/{listKey}/all.json 各自独立可访问 |
| CI 全自动 | 每日 UTC 00:00 自动运行并提交 |
| 关键词前端展示 | book.html 每本书展示关键词标签 |
| 本地开发可用 | 全套流程 `scrape_all.py` → `build_latest.py` → `python -m http.server` |
