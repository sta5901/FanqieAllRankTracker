# 🏆 番茄全榜风向标 · Fanqie All Rank Tracker

> 🙏 **本项目基于 [FanqieRankTracker](https://github.com/ZTNIAN/FanqieRankTracker) 修改二次开发，感谢原作者的开源贡献！**
>
> 原项目仅支持追踪番茄小说**女频新书榜**，本项目在其基础上扩展为同时追踪**男频/女频的阅读榜与新书榜**共四个榜单，并对页面进行了优化改进。

---

## ✨ 功能概览

| 功能 | 说明 |
|------|------|
| 🕷️ 自动爬取 | 每日定时抓取番茄小说**四个榜单**（男/女 × 阅读/新书）各分类 Top 30 |
| 📊 趋势对比 | 自动对比相邻两天数据：新上榜 / 掉榜 / 排名变化 / 阅读量增长 |
| 🤖 AI 风向分析 | 接入 OpenAI 兼容 API，按分类生成市场趋势速评；未配置时自动规则兜底 |
| 📈 五图看板 | 分类柱状图、Top20 书籍柱状图、趋势折线图、热力图、四榜雷达图 |
| 🧭 类型风向标 | 聚合多日趋势数据，AI 总结综合赛道、热门分类、高频题材 |
| 🔍 书籍详情 | 支持跨榜搜索，点击书籍查看其在各榜单的排名变化轨迹 |
| 🖥️ 精美界面 | 暗色编辑风格仪表盘，四榜 Tab 切换，打字机动画 + 瀑布流卡片 |
| 📱 移动适配 | 完整的移动端适配，侧边栏抽屉式菜单 |
| ⚡ 全自动化 | GitHub Actions + GitHub Pages，零服务器运维 |

---

## 🔄 与原项目的区别

| 对比项 | [原项目 FanqieRankTracker](https://github.com/ZTNIAN/FanqieRankTracker) | 本项目 FanqieAllRankTracker |
|--------|------|------|
| 追踪榜单 | 女频新书榜（1个） | 男频阅读榜 / 女频阅读榜 / 男频新书榜 / 女频新书榜（4个） |
| 榜单覆盖 | 仅女频新书 | 男频 + 女频，阅读 + 新书全覆盖 |
| 页面 | 原版看板 | 优化改进的看板 + 图表页 + 详情页 |
| 核心逻辑 | ✅ 原创核心 | 基于原项目核心扩展 |

---

## 🚀 快速开始

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

> **💡 提示：** 任何 OpenAI 兼容接口均可使用（如 Moonshot / DeepSeek / 自建服务等）。如果不配置，系统将自动使用规则摘要替代 AI 分析，**不影响核心功能**。

### 第四步：手动触发首次运行

1. 进入仓库 → **Actions** → 左侧选择 **Daily Fanqie Rank Scraper**
2. 点击右上角 **Run workflow** → **Run workflow**
3. 等待 Workflow 运行完成（约 3–5 分钟）

运行成功后，`data/` 目录下会自动生成数据文件，打开 GitHub Pages 链接即可看到看板。

### 第五步：坐等自动更新

GitHub Actions 已配置为 **每天 UTC 00:00（北京时间 08:00）** 自动运行。

---

## 📂 页面说明

| 页面 | 路径 | 说明 |
|------|------|------|
| 仪表盘 | `index.html` | 四榜 Tab 切换，瀑布流书籍卡片，打字机动画 |
| 图表看板 | `stats.html` | 五张统计图表：分类柱状图、Top20 柱状图、趋势折线图、热力图、四榜雷达 |
| 类型风向标 | `trend.html` | 按分类聚合多日趋势，支持 7/14/30 天和全周期切换 |
| 书籍详情 | `book.html` | 跨榜搜索书籍，查看其在各榜单的排名变化轨迹 |

---

## 📁 项目结构

```
FanqieAllRankTracker/
├── .github/workflows/
│   └── scrape.yml              # GitHub Actions 自动化工作流
├── css/
│   └── style.css               # 暗色编辑风格主题样式
├── js/
│   ├── app.js                  # 主仪表盘渲染逻辑
│   ├── trend.js                # 类型风向标渲染逻辑
│   ├── stats.js                # 图表看板渲染逻辑（ECharts）
│   └── book.js                 # 书籍详情页逻辑
├── scripts/
│   ├── build_latest.py         # 核心构建脚本（四榜 + AI 分析）
│   └── keywords_lib.py          # 关键词词库（男女频分开）
├── data/
│   ├── fanqie_{list_key}_ranks_YYYYMMDD.json   # 四榜每日原始快照
│   ├── latest_{list_key}.json                 # 四榜最新汇总数据
│   ├── market_summary_{list_key}.json          # 四榜全站热点总结
│   ├── stats_{list_key}.json                   # 四榜统计概览
│   ├── dates.json                              # 全榜日期索引
│   └── trends/{list_key}/YYYY-MM-DD.json       # 四榜趋势归档（按榜单分目录）
├── api/latest/{list_key}/                      # 静态数据接口
│   ├── all.json                                # 全量数据
│   └── index.json                              # 分类索引
├── index.html                  # 仪表盘入口页
├── stats.html                  # 图表看板页
├── trend.html                  # 类型风向标页
├── book.html                   # 书籍详情页
├── scrape_fanqie_ranks.py      # 单榜爬虫（Playwright，可指定 --list）
├── scrape_all.py               # 多榜入口脚本（循环爬取四个榜单）
├── requirements.txt            # Python 依赖
└── README.md                   # 本文件
```

---

## 🔌 数据接口

构建脚本会同步生成 GitHub Pages 可直接访问的静态 JSON 接口：

```
api/latest/{list_key}/all.json    # 指定榜单全量数据
api/latest/{list_key}/index.json   # 指定榜单分类索引
```

示例：

```bash
# 女频新书榜全量数据
curl https://<用户名>.github.io/FanqieAllRankTracker/api/latest/female_new/all.json

# 男频阅读榜全量数据
curl https://<用户名>.github.io/FanqieAllRankTracker/api/latest/male_read/all.json
```

支持的 `list_key`：`female_new` / `female_read` / `male_new` / `male_read`

---

## 🔧 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/<你的用户名>/FanqieAllRankTracker.git
cd FanqieAllRankTracker

# 2. 创建虚拟环境
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt
playwright install chromium

# 4. 爬取数据（四个榜单循环爬取）
python scrape_all.py

# 4a. 或者只爬单个榜单
python scrape_fanqie_ranks.py --list female_new

# 5. 构建看板数据（不带 AI）
python scripts/build_latest.py

# 5a. 带 AI 分析（需设置环境变量）
set API_BASE_URL=https://your-api-endpoint/v1
set API_KEY=your-api-key
set API_MODEL=your-model-name
python scripts/build_latest.py

# 5b. 强制重新生成 AI 总结
python scripts/build_latest.py --force

# 6. 本地预览前端
python -m http.server 8000
# 打开 http://localhost:8000
```

---

## ⚙️ 工作流程

```
┌────────────────────────────────────────────────────────────────────┐
│                   GitHub Actions（每日北京时间 08:00）               │
│                                                                    │
│  ┌─────────────────┐                                               │
│  │  check_data.py  │  检查数据目录是否已有今日数据（增量运行）          │
│  └────────┬────────┘                                               │
│           │ 有数据则跳过，无数据则继续                                  │
│           ▼                                                         │
│  ┌─────────────────┐    ┌──────────────────────┐                   │
│  │  Playwright      │───▶│  scrape_all.py       │                   │
│  │  爬取四榜 Top30  │    │  循环四榜 + 断点续传  │                   │
│  └─────────────────┘    └──────────┬───────────┘                   │
│                                     │                                │
│                                     ▼                                │
│                        ┌──────────────────────┐                     │
│                        │  build_latest.py      │                     │
│                        │  趋势对比 + AI 分析   │                     │
│                        │  生成 latest/stats/   │                     │
│                        │  market_summary/trends│                     │
│                        └──────────┬───────────┘                     │
│                                    │                                 │
│                                    ▼                                 │
│                        ┌──────────────────────┐                     │
│                        │  git pull --rebase   │                     │
│                        │  git add + commit    │                     │
│                        │  git push            │                     │
│                        └──────────┬───────────┘                     │
│                                    │                                 │
│                                    ▼                                 │
│                        GitHub Pages 自动部署 🌐                       │
└────────────────────────────────────────────────────────────────────┘
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

可以！系统会自动 fallback 到基于规则的摘要（如"新上榜3本；《XX》排名上升5位"），只是没有 AI 自然语言分析。

</details>

<details>
<summary><b>Q: 支持哪些榜单？</b></summary>

本项目追踪四个榜单：
- `female_new` — 女频新书榜
- `female_read` — 女频阅读榜
- `male_new` — 男频新书榜
- `male_read` — 男频阅读榜

</details>

---

## 📜 License

MIT

---

<p align="center">
  <sub>Made with ☕ and 🤖 — 数据每日自动更新，无需手动维护</sub>
</p>
