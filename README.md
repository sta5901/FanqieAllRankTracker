# 🏆 番茄全榜风向标 · Fanqie All Rank Tracker

> 🙏 **本项目基于 [FanqieRankTracker](https://github.com/ZTNIAN/FanqieRankTracker) 开发，感谢原作者的开源贡献！**
>
> 原项目仅支持追踪番茄小说**女频新书榜**，本项目在其基础上扩展为同时追踪**男频/女频的阅读榜与新书榜**共四个榜单，并对 HTML 页面进行了优化改进。内核本质仍基于原项目，秉承开源精神，特此注明。

---

> 👗📖 专注于**番茄小说男频女频阅读榜、新书榜**，每日自动追踪四大榜单排行数据并结合 AI 生成趋势分析，部署为精美的在线看板。

---

## ✨ 功能概览

| 功能 | 说明 |
|------|------|
| 🕷️ 自动爬取 | 每日定时抓取番茄小说**男频/女频阅读榜、男频/女频新书榜**共四个榜单各分类 Top 30 |
| 📊 趋势对比 | 自动对比相邻两天数据：新上榜 / 掉榜 / 排名变化 / 阅读量增长 |
| 🤖 AI 风向分析 | 接入 OpenAI 兼容 API，按分类生成市场趋势速评 |
| 🧭 类型风向标 | 独立趋势页聚合多日数据，用 AI 总结综合赛道、具体热门分类和高频题材；未配置 API 时自动规则兜底 |
| 🖥️ 精美看板 | 暗色编辑风格仪表盘，带打字机动画和瀑布流书籍卡片，优化页面布局与交互体验 |
| 📱 移动适配 | 完整的移动端适配，侧边栏抽屉式菜单 |
| 🔌 数据接口 | 生成静态 `lastest` JSON 接口，可按类型读取最新数据 |
| ⚡ 全自动化 | GitHub Actions + GitHub Pages，零服务器运维 |

---

## 🔄 与原项目的区别

| 对比项 | [原项目 FanqieRankTracker](https://github.com/ZTNIAN/FanqieRankTracker) | 本项目 FanqieAllRankTracker |
|--------|------|------|
| 追踪榜单 | 女频新书榜（1个） | 男频阅读榜 / 女频阅读榜 / 男频新书榜 / 女频新书榜（4个） |
| 榜单覆盖 | 仅女频新书 | 男频 + 女频，阅读 + 新书全覆盖 |
| HTML 页面 | 原版看板 | 优化改进的看板页面 |
| 核心逻辑 | ✅ 原创核心 | 基于原项目核心扩展 |

---

## 🚀 食用指南

### 前置条件

- **Python 3.9+**
- **Git**
- 一个 GitHub 账号
- （可选）一个 OpenAI 兼容 API 的密钥，用于 AI 分析

### 第一步：Fork 仓库

点击 GitHub 页面右上角的 **Fork** 按钮，将项目 Fork 到你自己的账号下。

### 第二步：开启 GitHub Pages

1. 进入你 Fork 后的仓库 → **Settings** → **Pages**
2. Source 选择 **Deploy from a branch**
3. Branch 选择 `main`，目录选择 `/ (root)`
4. 点击 **Save**

稍等几分钟，你的看板就会上线：`https://<你的用户名>.github.io/FanqieAllRankTracker/`

### 第三步：配置 Secrets（可选，开启 AI 分析）

进入仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**，添加以下三个 Secret：

| Secret 名称 | 说明 | 示例 |
|---|---|---|
| `API_BASE_URL` | OpenAI 兼容 API 的地址 | `https://api.openai.com/v1` |
| `API_KEY` | API 密钥 | `sk-xxxxxxxxxxxxx` |
| `API_MODEL` | 模型名称 | `gpt-4o-mini` |

> **💡 提示：** 任何 OpenAI 兼容接口均可使用（如 Moonshot / DeepSeek / 自建服务等）。如果不配置这三个 Secret，系统将自动使用基于规则的摘要替代 AI 分析，**不影响核心功能**。

### 第四步：手动触发首次运行

1. 进入仓库 → **Actions** → 左侧选择 **Daily Fanqie Rank Scraper**
2. 点击右上角 **Run workflow** → **Run workflow**
3. 等待 Workflow 运行完成（约 3–5 分钟）

运行成功后，`data/` 目录下会自动生成数据文件，打开 GitHub Pages 链接即可看到看板。

### 第五步：坐等自动更新

GitHub Actions 已配置为 **每天 UTC 00:00（北京时间 08:00）** 自动运行。之后无需任何手动操作，数据和看板会每天自动更新。

看板右上角的 **风向标** 可进入 `trend.html`，先查看当下火热综合赛道（如古风言情）、具体热门分类和高频题材，再按具体类型查看近 7 / 14 / 30 日或全部周期的趋势分析。全站热点会优先使用 AI 总结，未配置 API 或生成失败时使用规则统计文案兜底。

---

## 🔌 最新数据接口

构建脚本会同步生成 GitHub Pages 可直接访问的静态 JSON 接口：

| 类型 | 路径 | 说明 |
|---|---|---|
| 类型索引 | `api/lastest.json` | 返回所有可用类型及对应 URL |
| 全量数据 | `api/lastest/all.json` | `type=all`，返回全部分类、趋势和书籍 |
| 单类型数据 | `api/lastest/<类型>.json` | 返回指定类型的数据，例如 `api/lastest/古风世情.json` |

示例：

```bash
curl https://<你的用户名>.github.io/FanqieAllRankTracker/api/lastest/all.json
curl https://<你的用户名>.github.io/FanqieAllRankTracker/api/lastest/古风世情.json
```

---

## 🔧 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/<你的用户名>/FanqieAllRankTracker.git
cd FanqieAllRankTracker

# 2. 创建虚拟环境（推荐）
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. 安装依赖
pip install -r requirements.txt
playwright install chromium

# 4. 运行爬虫（四个榜单各分类抓取 Top 30）
python scrape_fanqie_ranks.py

# 5. 构建看板数据（可选，带 AI 分析需设置环境变量）
pip install openai
export API_BASE_URL="https://your-api-endpoint/v1"
export API_KEY="your-api-key"
export API_MODEL="your-model-name"
python scripts/build_latest.py

# 6. 本地预览前端
python -m http.server 8000
# 打开 http://localhost:8000
```

---

## 📁 项目结构

```
FanqieAllRankTracker/
├── .github/workflows/
│   └── scrape.yml              # GitHub Actions 自动化工作流
├── css/
│   └── style.css               # 暗色编辑风格主题样式
├── js/
│   └── app.js                  # 前端渲染逻辑（瀑布流 + 打字机动画）
├── scripts/
│   └── build_latest.py         # 趋势对比 + AI 分析构建脚本
├── data/
│   ├── fanqie_male_read_ranks_YYYYMMDD.json    # 男频阅读榜每日原始快照
│   ├── fanqie_female_read_ranks_YYYYMMDD.json   # 女频阅读榜每日原始快照
│   ├── fanqie_male_new_ranks_YYYYMMDD.json      # 男频新书榜每日原始快照
│   ├── fanqie_female_new_ranks_YYYYMMDD.json    # 女频新书榜每日原始快照
│   ├── latest_ranks.json       # 最新聚合数据（看板数据源）
│   ├── market_summary.json     # 全站热点 AI/规则总结
│   └── trends/
│       └── YYYY-MM-DD.json     # 趋势归档
├── api/
│   └── lastest/                # 最新数据静态接口（all + 按类型拆分）
├── index.html                  # 仪表盘入口页
├── trend.html                  # 类型风向标趋势分析页
├── scrape_fanqie_ranks.py      # 番茄小说爬虫（Playwright）
├── requirements.txt            # Python 依赖
└── README.md                   # 本文件
```

---

## ⚙️ 工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                   GitHub Actions (每日 08:00)                │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Playwright   │───▶│  build_latest │───▶│  git commit  │  │
│  │  爬取四榜数据  │    │  趋势对比      │    │  自动提交     │  │
│  │  男频阅读/新书 │    │  + AI 分析     │    │  到 main     │  │
│  │  女频阅读/新书 │    │              │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                    GitHub Pages 自动部署
                    用户访问在线看板 🌐
```

---

## 📝 常见问题

<details>
<summary><b>Q: Workflow 运行失败怎么办？</b></summary>

检查 Actions 日志中的错误信息。常见原因：
- 番茄小说页面结构变更 → 需要更新爬虫选择器
- Playwright 安装超时 → 尝试重新运行

</details>

<details>
<summary><b>Q: 不配置 AI Secret 也能用吗？</b></summary>

可以！系统会自动 fallback 到基于规则的摘要（如"新增3本上榜；《XX》排名上升+5位"）。只是没有 AI 自然语言分析而已。

</details>

---

## 📜 License

MIT

---

<p align="center">
  <sub>Made with ☕ and 🤖 — 数据每日自动更新，无需手动维护</sub>
</p>
