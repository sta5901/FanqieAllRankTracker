"""
构建层 · 四榜版（build_latest.py）

每个榜单独立构建：
  data/fanqie_{list_key}_ranks_*.json  → 快照
  data/latest_{list_key}.json          → 最新汇总（含 AI 趋势）
  data/market_summary_{list_key}.json  → 全站热点
  data/stats_{list_key}.json           → 统计概览
  data/trends/{list_key}/YYYY-MM-DD.json  → 趋势存档
  data/dates.json                      → 全榜日期索引（含 lists 字段）
  api/lastest/{list_key}/all.json      → 静态 API

使用方式：
    python scripts/build_latest.py                    # 全榜构建
    python scripts/build_latest.py --list female_new  # 单榜构建
    python scripts/build_latest.py --force            # 强制重新生成 AI 总结
"""
import os
import re
import json
import glob
import sys
import argparse
from urllib.parse import quote
from datetime import datetime

# ─────────────────────────────────────────────────────────────────────────────
# 四榜配置（与 scrape_fanqie_ranks.py 保持同步）
# ─────────────────────────────────────────────────────────────────────────────
LISTS = {
    "female_new": {
        "name": "女频新书榜",
        "file_key": "female_new",
        "is_male": False,
        "icon": "ti-heart",
        "color": "#EC4899",
    },
    "female_read": {
        "name": "女频阅读榜",
        "file_key": "female_read",
        "is_male": False,
        "icon": "ti-heartbeat",
        "color": "#F472B6",
    },
    "male_new": {
        "name": "男频新书榜",
        "file_key": "male_new",
        "is_male": True,
        "icon": "ti-user",
        "color": "#3B82F6",
    },
    "male_read": {
        "name": "男频阅读榜",
        "file_key": "male_read",
        "is_male": True,
        "icon": "ti-users",
        "color": "#60A5FA",
    },
}

LIST_ORDER = ["female_new", "female_read", "male_new", "male_read"]

# ─────────────────────────────────────────────────────────────────────────────
# 男女频分类分组（用于全站热点聚合）
# ─────────────────────────────────────────────────────────────────────────────
FEMALE_GENRE_GROUPS = [
    {"name": "古风言情", "categories": ["古风世情", "古言脑洞", "宫斗宅斗", "种田"]},
    {"name": "现代言情", "categories": ["现言脑洞", "豪门总裁", "职场婚恋", "青春甜宠"]},
    {"name": "幻想言情", "categories": ["玄幻言情", "科幻末世", "悬疑脑洞", "女频悬疑"]},
    {"name": "快穿衍生", "categories": ["快穿", "女频衍生"]},
    {"name": "年代民国", "categories": ["年代", "民国言情"]},
    {"name": "娱乐星光", "categories": ["星光璀璨"]},
    {"name": "游戏体育", "categories": ["游戏体育"]},
]

MALE_GENRE_GROUPS = [
    {"name": "都市异能", "categories": ["都市脑洞", "都市日常", "都市种田", "都市高武", "都市修真"]},
    {"name": "玄幻奇幻", "categories": ["传统玄幻", "东方仙侠", "玄幻脑洞", "西方奇幻"]},
    {"name": "历史军事", "categories": ["历史古代", "历史脑洞", "抗战谍战", "军旅生涯"]},
    {"name": "科幻末日", "categories": ["科幻末世", "末世危机"]},
    {"name": "游戏竞技", "categories": ["游戏体育", "游戏主播"]},
    {"name": "男频衍生", "categories": ["男频衍生", "动漫衍生"]},
]


def get_genre_groups(list_key: str) -> list:
    return MALE_GENRE_GROUPS if LISTS.get(list_key, {}).get("is_male") else FEMALE_GENRE_GROUPS


MARKET_KEYWORDS = [
    "重生", "穿书", "快穿", "系统", "空间", "团宠", "萌宝", "幼崽",
    "女配", "炮灰", "反派", "权臣", "宅斗", "宫斗", "和离", "替嫁",
    "逃荒", "种田", "美食", "经商", "年代", "七零", "八零", "军婚",
    "豪门", "总裁", "真假千金", "先婚后爱", "追妻", "甜宠", "双洁",
    "强制爱", "无CP", "末世", "废土", "天灾", "囤货", "异能",
    "国运", "星际", "修仙", "玄学", "无限流", "悬疑", "直播", "综艺",
    "娱乐圈", "校园", "暗恋", "青梅竹马", "民国", "兽世", "远古", "基建",
    "战神", "赘婿", "兵王", "神医", "修罗", "鉴宝", "风水", "赌石",
]

BATCH_SIZE = 3
MARKET_PERIODS = [("7", 7), ("14", 14), ("30", 30), ("all", None)]

# ─────────────────────────────────────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────────────────────────────────────
def parse_reads(reads_str: str) -> float:
    if not reads_str or reads_str == "未知":
        return 0
    s = reads_str.strip().replace(",", "")
    try:
        if "万" in s:
            return float(s.replace("万", "")) * 10000
        return float(s)
    except ValueError:
        return 0


def format_reads_change(diff: float) -> str:
    if abs(diff) >= 10000:
        return f"{'+' if diff > 0 else ''}{diff / 10000:.1f}万"
    return f"{'+' if diff > 0 else ''}{int(diff)}"


def load_snapshot(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, payload: dict):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def parse_change(change: str) -> int:
    try:
        return int(str(change or "0").replace("+", ""))
    except ValueError:
        return 0


def api_type_filename(type_name: str) -> str:
    name = (type_name or "").strip()
    name = re.sub(r"[\\/]+", "_", name)
    name = re.sub(r"[^\w\u4e00-\u9fff\s-]", "_", name)
    name = re.sub(r"\s+", "_", name).strip("._")
    return name or "unknown"


def is_rule_summary(summary: str) -> bool:
    if not summary:
        return True
    if summary == "首日数据，暂无趋势对比。":
        return True
    if len(summary) < 150 and "；" in summary and "\n" not in summary:
        return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# 趋势对比
# ─────────────────────────────────────────────────────────────────────────────
def compare_categories(today_cats: list, prev_cats: list) -> dict:
    prev_index = {}
    for cat in prev_cats:
        url_map = {}
        for i, book in enumerate(cat.get("books", [])):
            url_map[book["url"]] = {
                "rank": i + 1,
                "reads": book.get("reads", "未知"),
                "title": book.get("title", "未知"),
                "intro": book.get("intro", "暂无简介"),
            }
        prev_index[cat["name"]] = url_map

    trends = {}
    for cat in today_cats:
        cat_name = cat["name"]
        prev_urls = prev_index.get(cat_name, {})
        today_books = cat.get("books", [])

        new_books, dropped_books = [], []
        risers, fallers, reads_growth = [], [], []
        today_urls = set()

        for i, book in enumerate(today_books):
            url = book["url"]
            today_urls.add(url)
            today_rank = i + 1
            title = book.get("title", "未知")

            if url in prev_urls:
                prev_info = prev_urls[url]
                rank_change = prev_info["rank"] - today_rank
                if rank_change > 0:
                    risers.append({"title": title, "change": f"+{rank_change}"})
                elif rank_change < 0:
                    fallers.append({"title": title, "change": str(rank_change)})
                today_reads = parse_reads(book.get("reads", ""))
                prev_reads = parse_reads(prev_info["reads"])
                if today_reads > 0 and prev_reads > 0:
                    diff = today_reads - prev_reads
                    if diff != 0:
                        reads_growth.append({"title": title, "growth": format_reads_change(diff)})
            else:
                new_books.append(title)

        for url, info in prev_urls.items():
            if url not in today_urls:
                dropped_books.append({
                    "title": info["title"],
                    "intro": info.get("intro", "暂无简介")[:100],
                })

        risers.sort(key=lambda x: int(x["change"].replace("+", "")), reverse=True)
        fallers.sort(key=lambda x: int(x["change"]))
        reads_growth.sort(key=lambda x: parse_reads(x["growth"].replace("+", "")), reverse=True)

        trends[cat_name] = {
            "new_count": len(new_books),
            "dropped_count": len(dropped_books),
            "new_books": new_books[:5],
            "dropped_books": dropped_books[:5],
            "top_risers": risers[:3],
            "top_fallers": fallers[:3],
            "reads_growth": reads_growth[:3],
            "summary": "",
        }
    return trends


def generate_trend_summary_text(cat_name: str, trend: dict) -> str:
    parts = []
    if trend["new_count"] > 0:
        parts.append(f"新增{trend['new_count']}本上榜")
    if trend["dropped_count"] > 0:
        dropped_titles = [
            d["title"] if isinstance(d, dict) else d
            for d in trend.get("dropped_books", [])
        ]
        if dropped_titles:
            parts.append(f"{trend['dropped_count']}本掉出（{'、'.join('《' + t + '》' for t in dropped_titles)}）")
        else:
            parts.append(f"{trend['dropped_count']}本掉出")
    if trend["top_risers"]:
        r = trend["top_risers"][0]
        parts.append(f"《{r['title']}》排名上升{r['change']}位")
    if trend["reads_growth"]:
        g = trend["reads_growth"][0]
        parts.append(f"《{g['title']}》阅读量{g['growth']}")
    if not parts:
        parts.append("榜单无明显变动")
    return "；".join(parts) + "。"


# ─────────────────────────────────────────────────────────────────────────────
# AI Prompt（按榜单类型定制）
# ─────────────────────────────────────────────────────────────────────────────
def _build_book_intros(cat: dict, limit: int = 20) -> str:
    lines = []
    for i, book in enumerate(cat.get("books", [])[:limit]):
        lines.append(
            f"{i+1}. 《{book['title']}》- {book.get('author', '未知')}\n"
            f"   在读：{book.get('reads', '未知')}\n"
            f"   简介：{book.get('intro', '无')[:200]}"
        )
    return "\n".join(lines)


def _format_trend_batch(new_books, dropped, risers, fallers) -> dict:
    def _dropped_text(dropped):
        if not dropped:
            return "无"
        lines = []
        for d in dropped:
            lines.append(
                f"《{d['title']}》（{d.get('intro', '暂无简介')[:50]}）"
                if isinstance(d, dict) else f"《{d}》"
            )
        return "、".join(lines) or "无"

    return {
        "new_text": "、".join(f"《{t}》" for t in new_books) if new_books else "无",
        "dropped_text": _dropped_text(dropped),
        "risers_text": "、".join(f"《{r['title']}》{r['change']}" for r in risers) if risers else "无",
        "fallers_text": "、".join(f"《{f['title']}》{f['change']}" for f in fallers) if fallers else "无",
    }


def build_ai_prompt(cat_name: str, cat: dict, trend: dict, list_key: str) -> str:
    """单分类 AI 总结 prompt，支持按榜单类型定制。"""
    intros = _build_book_intros(cat)
    cfg = _format_trend_batch(
        trend.get("new_books", []),
        trend.get("dropped_books", []),
        trend.get("top_risers", []),
        trend.get("top_fallers", []),
    )
    list_name = LISTS.get(list_key, {}).get("name", list_key)

    # 榜单特征词
    if "read" in list_key:   # 阅读榜特征
        trait_note = "注意：阅读榜反映的是长期读者选择，强调「持续在读」「完本吸引力」「口碑积累」。分析时应多关注读者粘性指标。"
    else:                     # 新书榜特征
        trait_note = "注意：新书榜反映的是近期题材风向，强调「新上榜」「题材创新」「新人崛起」。分析时应多关注设定创新和开局钩子。"

    return f"""你是一位网文行业分析师。请根据以下数据，为番茄小说「{cat_name}」生成结构化分析。

## 榜单背景
榜单类型：{list_name}（{trait_note}）

## 当前榜单 Top 20
{intros}

## 榜单变动
- 新上榜：{cfg['new_text']}
- 掉出榜单：{cfg['dropped_text']}
- 排名上升：{cfg['risers_text']}
- 排名下降：{cfg['fallers_text']}

## 输出要求（严格按以下 Markdown 格式，语言简洁专业）

**题材趋势**
用1-2句话总结当前分类的主流题材和高频元素，点明哪些设定扎堆出现。

**读者偏好**
用1句话概括读者口味方向，以及金手指类型偏好。

**新上榜作品**
列出新上榜书名，每本一句话点评其题材亮点或差异化卖点。

**掉出榜单**
列出掉出书名及其题材方向，简要分析可能掉出的原因。

**值得关注**
挑1-2本有差异化潜力的作品，说明理由。

要求：每个板块2-3句话，总字数250字以内。"""


def build_batch_ai_prompt(batch: list, list_key: str) -> str:
    """批量 AI 总结 prompt。"""
    sections = []
    for cat_name, cat, trend in batch:
        intros = _build_book_intros(cat)
        cfg = _format_trend_batch(
            trend.get("new_books", []),
            trend.get("dropped_books", []),
            trend.get("top_risers", []),
            trend.get("top_fallers", []),
        )
        sections.append(
            f"### 分类：{cat_name}\n\n"
            f"**当前榜单 Top 20：**\n{intros}\n\n"
            f"**榜单变动：**\n"
            f"- 新上榜：{cfg['new_text']}\n"
            f"- 掉出榜单：{cfg['dropped_text']}\n"
            f"- 排名上升：{cfg['risers_text']}\n"
            f"- 排名下降：{cfg['fallers_text']}"
        )

    all_sections = "\n\n---\n\n".join(sections)
    cat_names = [b[0] for b in batch]
    list_name = LISTS.get(list_key, {}).get("name", list_key)

    if "read" in list_key:
        trait_note = "注意：阅读榜反映长期读者选择，强调「持续在读」「完本吸引力」「口碑积累」。"
    else:
        trait_note = "注意：新书榜反映近期题材风向，强调「新上榜」「题材创新」「新人崛起」。"

    output_examples = "\n\n".join(
        f"===BEGIN: {name}===\n"
        f"**题材趋势** ...\n"
        f"**读者偏好** ...\n"
        f"**新上榜作品** ...\n"
        f"**掉出榜单** ...\n"
        f"**值得关注** ...\n"
        f"===END: {name}==="
        for name in cat_names
    )

    return (
        f"你是一位网文行业分析师。请根据以下数据，为番茄小说{list_name}的多个分类生成结构化分析。\n"
        f"（{trait_note}）\n\n"
        f"{all_sections}\n\n"
        f"## 输出要求\n\n"
        f"请严格按照以下格式，为每个分类分别输出分析。"
        f"每个分类的分析必须包裹在对应的标记中：\n\n"
        f"{output_examples}\n\n"
        f"每个板块2-3句话，每个分类总字数250字以内。"
        f"必须为每个分类都输出完整分析，不可省略任何分类。"
    )


def parse_batch_response(response_text: str, cat_names: list) -> dict:
    results = {}
    for name in cat_names:
        pattern = rf"===BEGIN:\s*{re.escape(name)}\s*===(.*?)===END:\s*{re.escape(name)}\s*==="
        match = re.search(pattern, response_text, re.DOTALL)
        if match:
            summary = match.group(1).strip()
            if summary:
                results[name] = summary
    return results


# ─────────────────────────────────────────────────────────────────────────────
# AI 总结生成
# ─────────────────────────────────────────────────────────────────────────────
def generate_ai_summaries(
    categories, trends, api_key, base_url, model,
    list_key, force=False, existing_trends=None,
    trend_path=None, trend_date="", prev_date=""
) -> dict:
    try:
        from openai import OpenAI
    except ImportError:
        print("  [WARN] openai 库未安装，跳过 AI 总结。pip install openai")
        return trends

    client = OpenAI(api_key=api_key, base_url=base_url, timeout=45.0)
    existing_trends = existing_trends or {}


def _is_content_filter_error(e):
    """检测 LLM 内容审查错误（400 contentFilter），这类错误重试无效，应直接跳过。"""
    msg = str(e)
    return ("contentFilter" in msg
            or "敏感内容" in msg
            or "不安全" in msg
            or "1301" in msg)

    pending, skipped = [], 0
    for cat in categories:
        cat_name = cat["name"]
        if cat_name not in trends:
            continue
        if not force:
            existing_summary = existing_trends.get(cat_name, {}).get("summary", "")
            if existing_summary and not is_rule_summary(existing_summary):
                trends[cat_name]["summary"] = existing_summary
                skipped += 1
                continue
        pending.append((cat_name, cat, trends[cat_name]))

    if skipped > 0:
        print(f"  [SKIP] 跳过 {skipped} 个已有 AI 总结的分类")

    if not pending:
        print("  [OK] 所有分类已有 AI 总结，无需生成")
        return trends

    batches = [pending[i:i + BATCH_SIZE] for i in range(0, len(pending), BATCH_SIZE)]
    print(f"  [BATCH] 共 {len(pending)} 个分类，分 {len(batches)} 批处理")
    failed_cats = []

    for batch_idx, batch in enumerate(batches):
        batch_names = [b[0] for b in batch]
        print(f"\n  [BATCH {batch_idx+1}/{len(batches)}] {', '.join(batch_names)}")
        prompt = build_batch_ai_prompt(batch, list_key)

        max_retries, batch_success = 2, False
        for attempt in range(1, max_retries + 1):
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=500 * len(batch),
                    temperature=0.7,
                )
                content = response.choices[0].message.content
                if not content or not content.strip():
                    raise ValueError("API 返回空内容")

                parsed = parse_batch_response(content, batch_names)
                for name, summary in parsed.items():
                    trends[name]["summary"] = summary
                    print(f"    [OK] {name}")

                for name in batch_names:
                    if name not in parsed:
                        print(f"    [WARN] 未解析到: {name}（将单独重试）")
                        failed_cats.append(next(b for b in batch if b[0] == name))

                _save_trends_incremental(trend_path, trend_date, prev_date, trends)
                batch_success = True
                break
            except Exception as e:
                if _is_content_filter_error(e):
                    print(f"    [SKIP] 内容审查拦截，跳过本批次: {e}")
                    batch_success = False
                    break
                print(f"    [RETRY {attempt}/{max_retries}] {e}")
                if attempt < max_retries:
                    import time as _time
                    _time.sleep(5 * attempt)

        if not batch_success:
            print(f"    [FAIL] 批量生成失败，将逐个重试")
            failed_cats.extend(batch)

    # 逐个重试降级策略
    if failed_cats:
        print(f"\n  [RETRY] 逐个重试 {len(failed_cats)} 个失败分类...")
        for cat_name, cat, trend in failed_cats:
            prompt = build_ai_prompt(cat_name, cat, trend, list_key)
            for attempt in range(1, 3):
                try:
                    response = client.chat.completions.create(
                        model=model,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=500,
                        temperature=0.7,
                    )
                    content = response.choices[0].message.content
                    if not content or not content.strip():
                        raise ValueError("API 返回空内容")
                    trends[cat_name]["summary"] = content.strip()
                    print(f"    [OK] {cat_name}")
                    _save_trends_incremental(trend_path, trend_date, prev_date, trends)
                    break
                except Exception as e:
                    if _is_content_filter_error(e):
                        print(f"    [SKIP] 内容审查拦截: {cat_name}")
                        break
                    print(f"    [RETRY {attempt}] {cat_name}: {e}")
                    if attempt < 2:
                        import time as _time
                        _time.sleep(5 * attempt)
            else:
                old = existing_trends.get(cat_name, {}).get("summary", "")
                if old and not is_rule_summary(old):
                    trends[cat_name]["summary"] = old
                    print(f"    [FALLBACK] 保留旧 AI 总结: {cat_name}")
                else:
                    trends[cat_name]["summary"] = generate_trend_summary_text(cat_name, trend)
                    print(f"    [RULE] 使用规则摘要: {cat_name}")

    return trends


def _save_trends_incremental(trend_path, date, prev_date, trends):
    if not trend_path:
        return
    write_json(trend_path, {"date": date, "prev_date": prev_date, "trends": trends})


# ─────────────────────────────────────────────────────────────────────────────
# 全站热点统计
# ─────────────────────────────────────────────────────────────────────────────
def load_trend_rows(trends_dir: str) -> list:
    rows = []
    for path in sorted(glob.glob(os.path.join(trends_dir, "*.json"))):
        try:
            data = load_snapshot(path)
            rows.append({
                "date": data.get("date", ""),
                "prev_date": data.get("prev_date", ""),
                "trends": data.get("trends", {}),
            })
        except Exception:
            pass
    return sorted([r for r in rows if r["date"]], key=lambda x: x["date"])


def summarize_market_rows(rows: list) -> dict:
    totals = {
        "new_count": 0, "dropped_count": 0, "riser_count": 0,
        "faller_count": 0, "read_count": 0, "read_growth_total": 0, "active_days": 0,
    }
    for row in rows:
        trend = row.get("trend") or {}
        riser_count = len(trend.get("top_risers", []))
        faller_count = len(trend.get("top_fallers", []))
        read_count = len(trend.get("reads_growth", []))
        read_growth_total = sum(
            parse_reads(item.get("growth", ""))
            for item in trend.get("reads_growth", [])
        )
        totals["new_count"] += int(trend.get("new_count", 0) or 0)
        totals["dropped_count"] += int(trend.get("dropped_count", 0) or 0)
        totals["riser_count"] += riser_count
        totals["faller_count"] += faller_count
        totals["read_count"] += read_count
        totals["read_growth_total"] += read_growth_total
        if (trend.get("new_count", 0) or trend.get("dropped_count", 0)
                or riser_count or faller_count or read_count):
            totals["active_days"] += 1
    return totals


def collect_market_hot_types(categories: list, rows_window: list) -> list:
    result = []
    for name in categories:
        rows = [
            {"trend": row.get("trends", {}).get(name)}
            for row in rows_window
            if row.get("trends", {}).get(name)
        ]
        totals = summarize_market_rows(rows)
        score = round(totals["read_growth_total"])
        if score <= 0:
            continue
        result.append({
            "name": name,
            "score": score,
            "new_count": totals["new_count"],
            "dropped_count": totals["dropped_count"],
            "read_count": totals["read_count"],
            "read_growth_total": totals["read_growth_total"],
            "active_days": totals["active_days"],
        })
    return sorted(result, key=lambda x: (x["read_growth_total"], x["read_count"]), reverse=True)


def collect_market_hot_genres(list_key: str, hot_types: list) -> list:
    genre_groups = get_genre_groups(list_key)
    type_map = {item["name"]: item for item in hot_types}
    genres = []
    for group in genre_groups:
        matched = []
        for name in group["categories"]:
            matched.append(type_map.get(name, {
                "name": name, "score": 0, "new_count": 0,
                "dropped_count": 0, "read_count": 0,
                "read_growth_total": 0, "active_days": 0,
            }))
        read_growth_total = sum(item["read_growth_total"] for item in matched)
        if read_growth_total <= 0:
            continue
        lead = sorted(matched, key=lambda x: (x["read_growth_total"], x["read_count"]), reverse=True)[0]
        genres.append({
            "name": group["name"],
            "score": round(read_growth_total),
            "new_count": sum(item["new_count"] for item in matched),
            "dropped_count": sum(item["dropped_count"] for item in matched),
            "read_count": sum(item["read_count"] for item in matched),
            "read_growth_total": read_growth_total,
            "active_days": sum(item["active_days"] for item in matched),
            "lead_category": lead["name"],
            "categories": [item["name"] for item in matched],
        })
    return sorted(genres, key=lambda x: (x["read_growth_total"], x["read_count"]), reverse=True)


def collect_market_hot_themes(output: dict, rows_window: list, categories: list) -> list:
    score_map = {
        name: {"name": name, "count": 0, "categories": set()}
        for name in MARKET_KEYWORDS
    }
    latest_book_map = {}
    for cat in output.get("categories", []):
        for book in cat.get("books", []):
            if book.get("title"):
                latest_book_map[book["title"]] = book

    for row in rows_window:
        for cat_name in categories:
            trend = row.get("trends", {}).get(cat_name)
            if not trend:
                continue
            for title in trend.get("new_books", []):
                book = latest_book_map.get(title, {})
                text = f"{title} {book.get('intro', '')}"
                for keyword in MARKET_KEYWORDS:
                    if keyword in text:
                        item = score_map[keyword]
                        item["count"] += 1
                        item["categories"].add(cat_name)

    return sorted(
        [
            {"name": item["name"], "count": item["count"], "category_count": len(item["categories"])}
            for item in score_map.values() if item["count"] > 0
        ],
        key=lambda x: (x["count"], x["category_count"]), reverse=True
    )


def format_market_reads(value: float) -> str:
    if abs(value) >= 10000:
        return f"{value / 10000:.1f}万"
    return str(round(value))


def build_rule_market_summary(period_label: str, hot_genres: list, hot_types: list, hot_themes: list) -> str:
    top_genres = "、".join(item["name"] for item in hot_genres[:2])
    top_types = "、".join(item["name"] for item in hot_types[:3])
    top_themes = "、".join(item["name"] for item in hot_themes[:6])
    if not top_genres and not top_types:
        return f"{period_label}暂无足够数据判断全站热点。"
    return (
        f"{period_label}里，{top_genres or top_types} 的阅读增长更强，"
        f"具体分类以 {top_types} 的新增在读更集中；"
        f"新书题材上 {top_themes} 更高频，"
        f"说明读者仍偏好强设定、强情绪钩子和明确爽点。"
    )


def build_market_summary_payload(output: dict, trends_dir: str, list_key: str) -> dict:
    categories = [cat.get("name", "") for cat in output.get("categories", [])]
    trend_rows = load_trend_rows(trends_dir)
    periods = {}

    for key, days in MARKET_PERIODS:
        rows_window = trend_rows if days is None else trend_rows[-days:]
        period_label = "全部样本" if days is None else f"近 {days} 日"
        hot_types = collect_market_hot_types(categories, rows_window)
        hot_genres = collect_market_hot_genres(list_key, hot_types)
        hot_themes = collect_market_hot_themes(output, rows_window, categories)
        fallback_summary = build_rule_market_summary(period_label, hot_genres, hot_types, hot_themes)
        periods[key] = {
            "period": period_label,
            "source": "rule",
            "summary": fallback_summary,
            "fallback_summary": fallback_summary,
            "hot_genres": hot_genres[:5],
            "hot_types": hot_types[:6],
            "hot_themes": hot_themes[:14],
        }

    return {
        "date": output.get("date", ""),
        "prev_date": output.get("prev_date", ""),
        "periods": periods,
    }


def build_market_ai_prompt(payload: dict, list_key: str) -> str:
    list_name = LISTS.get(list_key, {}).get("name", list_key)
    sections = []
    for key, data in payload.get("periods", {}).items():
        genres = "、".join(
            f"{item['name']}(新增在读{format_market_reads(item.get('read_growth_total', 0))}, "
            f"增长作品{item.get('read_count', 0)})"
            for item in data.get("hot_genres", [])[:5]
        )
        types = "、".join(
            f"{item['name']}(新增在读{format_market_reads(item.get('read_growth_total', 0))}, "
            f"增长作品{item.get('read_count', 0)})"
            for item in data.get("hot_types", [])[:6]
        )
        themes = "、".join(
            f"{item['name']}(新书{item['count']}本)"
            for item in data.get("hot_themes", [])[:10]
        )
        sections.append(
            f"周期 {key} / {data['period']}:\n"
            f"- 综合赛道: {genres or '无'}\n"
            f"- 具体分类: {types or '无'}\n"
            f"- 高频题材: {themes or '无'}\n"
            f"- 规则兜底: {data['fallback_summary']}"
        )

    return f"""你是一位网文市场编辑，请根据番茄{list_name}的统计结果，为每个周期生成一段全站热点判断。

{chr(10).join(sections)}

要求：
1. 只基于给定统计，不要编造未出现的类型或题材。
2. 每个周期输出 1 段中文，80-140 字。
3. 综合赛道和具体分类必须按「新增在读/阅读增长」解读。
4. 高频题材必须按「新上榜作品数量」解读。
5. 点明综合赛道、具体分类、新书题材关键词，以及一句编辑判断。
6. 输出严格 JSON，不要 Markdown，不要解释，格式如下：
{{
  "7": "总结文本",
  "14": "总结文本",
  "30": "总结文本",
  "all": "总结文本"
}}"""


def parse_json_object(text: str) -> dict:
    text = (text or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def enrich_market_summary_with_ai(payload: dict, api_key: str, base_url: str, model: str, list_key: str) -> dict:
    try:
        from openai import OpenAI
    except ImportError:
        return payload

    try:
        client = OpenAI(api_key=api_key, base_url=base_url, timeout=45.0)
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": build_market_ai_prompt(payload, list_key)}],
            max_tokens=900,
            temperature=0.5,
        )
        parsed = parse_json_object(response.choices[0].message.content)
        for key, summary in parsed.items():
            if key in payload["periods"] and isinstance(summary, str) and summary.strip():
                payload["periods"][key]["summary"] = summary.strip()
                payload["periods"][key]["source"] = "ai"
        print("  [OK] 全站热点 AI 总结已生成")
    except Exception as e:
        print(f"  [WARN] 全站热点 AI 总结失败: {e}")

    return payload


# ─────────────────────────────────────────────────────────────────────────────
# Stats JSON 生成
# ─────────────────────────────────────────────────────────────────────────────
def build_stats_payload(output: dict, list_key: str) -> dict:
    """生成 stats_{listKey}.json 概览数据。"""
    categories = output.get("categories", [])
    category_reads = []
    top_books = []
    total_books = 0

    for cat in categories:
        cat_reads = 0
        cat_book_count = 0
        for book in cat.get("books", []):
            reads = parse_reads(book.get("reads", "未知"))
            cat_reads += reads
            cat_book_count += 1
            top_books.append({
                "title": book.get("title", ""),
                "author": book.get("author", ""),
                "category": cat["name"],
                "reads": reads,
                "reads_str": book.get("reads", "未知"),
                "url": book.get("url", ""),
            })
        total_books += cat_book_count
        if cat_reads > 0:
            category_reads.append({
                "category": cat["name"],
                "total_reads": round(cat_reads),
                "reads_str": format_market_reads(cat_reads),
                "book_count": cat_book_count,
            })

    category_reads.sort(key=lambda x: x["total_reads"], reverse=True)
    top_books.sort(key=lambda x: x["reads"], reverse=True)

    return {
        "date": output.get("date", ""),
        "list_key": list_key,
        "list_name": LISTS.get(list_key, {}).get("name", ""),
        "category_reads": category_reads,
        "top_books": top_books[:20],
        "total_categories": len(categories),
        "total_books": total_books,
        "trend_7d": [],   # 由 trend.js 加载 data/trends_stats_{list_key}_7d.json 填充
    }


# ─────────────────────────────────────────────────────────────────────────────
# Lastest API（per-list）
# ─────────────────────────────────────────────────────────────────────────────
def build_lastest_api(output: dict, base_dir: str, list_key: str):
    """生成静态 lastest API（per-list）。"""
    api_root = os.path.join(base_dir, "api")
    lastest_dir = os.path.join(api_root, "lastest", list_key)
    os.makedirs(lastest_dir, exist_ok=True)

    date = output.get("date", "")
    prev_date = output.get("prev_date", "")
    categories = output.get("categories", [])

    all_payload = {
        "type": "all",
        "date": date,
        "prev_date": prev_date,
        "categories": categories,
    }
    write_json(os.path.join(lastest_dir, "all.json"), all_payload)

    types = [{
        "type": "all",
        "url": f"api/lastest/{list_key}/all.json",
        "category_count": len(categories),
        "book_count": sum(len(cat.get("books", [])) for cat in categories),
    }]

    used_filenames = {"all"}
    for cat in categories:
        type_name = cat.get("name", "")
        filename = api_type_filename(type_name)
        base_filename = filename
        suffix = 2
        while filename in used_filenames:
            filename = f"{base_filename}_{suffix}"
            suffix += 1
        used_filenames.add(filename)

        write_json(
            os.path.join(lastest_dir, f"{filename}.json"),
            {"type": type_name, "date": date, "prev_date": prev_date, "category": cat, "categories": [cat]}
        )
        types.append({
            "type": type_name,
            "url": f"api/lastest/{list_key}/{quote(filename)}.json",
            "book_count": len(cat.get("books", [])),
        })

    write_json(os.path.join(lastest_dir, "index.json"), {
        "date": date, "prev_date": prev_date, "types": types
    })

    return lastest_dir


# ─────────────────────────────────────────────────────────────────────────────
# 构建单个榜单
# ─────────────────────────────────────────────────────────────────────────────
def build_single_list(
    list_key: str,
    base_dir: str,
    data_dir: str,
    api_base_url: str,
    api_key: str,
    api_model: str,
    force: bool = False,
    target_date: str = "",
):
    """构建单个榜单的 latest、trend、market_summary、stats 文件。"""
    file_key = LISTS[list_key]["file_key"]
    list_name = LISTS[list_key]["name"]
    trends_dir = os.path.join(data_dir, "trends", list_key)
    os.makedirs(trends_dir, exist_ok=True)

    # 快照文件
    snapshots = sorted(glob.glob(os.path.join(data_dir, f"fanqie_{file_key}_ranks_*.json")))
    if not snapshots:
        print(f"  [SKIP] {list_name}: 未找到快照文件（data/fanqie_{file_key}_ranks_*.json）")
        return False

    if target_date:
        target_path = os.path.join(data_dir, f"fanqie_{file_key}_ranks_{target_date.replace('-', '')}.json")
        if target_path not in snapshots:
            print(f"  [SKIP] {list_name}: 目标日期 {target_date} 无快照")
            return False
        latest_path = target_path
        target_idx = snapshots.index(target_path) if target_path in snapshots else -1
    else:
        latest_path = snapshots[-1]
        target_idx = len(snapshots) - 1

    latest_data = load_snapshot(latest_path)
    print(f"\n  [{list_name}] 快照: {os.path.basename(latest_path)} ({latest_data['date']})")

    # 前一天快照
    prev_data, prev_date = None, ""
    if target_idx > 0:
        prev_path = snapshots[target_idx - 1]
        prev_data = load_snapshot(prev_path)
        prev_date = prev_data.get("date", "")
        print(f"  [{list_name}] 对比: {os.path.basename(prev_path)} ({prev_date})")

    # 已有趋势数据
    existing_trends = {}
    trend_path = os.path.join(trends_dir, f"{latest_data['date']}.json")
    if os.path.exists(trend_path) and not force:
        try:
            existing = load_snapshot(trend_path)
            existing_trends = existing.get("trends", {})
            ai_count = sum(1 for t in existing_trends.values() if not is_rule_summary(t.get("summary", "")))
            rule_count = len(existing_trends) - ai_count
            print(f"  [{list_name}] 已有趋势: {ai_count} AI, {rule_count} 规则")
        except Exception:
            pass

    if force:
        print(f"  [{list_name}] 强制模式：重新生成所有 AI 总结")

    # 趋势对比
    if prev_data:
        trends = compare_categories(latest_data["categories"], prev_data["categories"])
    else:
        trends = {
            cat["name"]: {
                "new_count": 0, "dropped_count": 0,
                "new_books": [], "dropped_books": [],
                "top_risers": [], "top_fallers": [], "reads_growth": [],
                "summary": "首日数据，暂无趋势对比。",
            }
            for cat in latest_data["categories"]
        }

    # AI 总结
    if api_base_url and api_key and api_model:
        print(f"\n  [{list_name}] 使用 {api_model} 生成 AI 总结...")
        trends = generate_ai_summaries(
            latest_data["categories"], trends,
            api_key, api_base_url, api_model,
            list_key, force=force,
            existing_trends=existing_trends,
            trend_path=trend_path,
            trend_date=latest_data["date"],
            prev_date=prev_date,
        )
    else:
        missing = [k for k, v in {
            "API_BASE_URL": api_base_url, "API_KEY": api_key, "API_MODEL": api_model
        }.items() if not v]
        print(f"  [{list_name}] 未配置 AI（缺少: {', '.join(missing)}），使用规则摘要。")
        for cat_name, trend in trends.items():
            old = existing_trends.get(cat_name, {}).get("summary", "")
            if old and not is_rule_summary(old):
                trend["summary"] = old
            elif not trend.get("summary"):
                trend["summary"] = generate_trend_summary_text(cat_name, trend)

    # 组装 output
    output = {
        "date": latest_data["date"],
        "prev_date": prev_date,
        "categories": [
            {"name": cat["name"], "trend": trends.get(cat["name"], {}), "books": cat.get("books", [])}
            for cat in latest_data["categories"]
        ],
    }

    # 写入 latest_{list_key}.json
    latest_out = os.path.join(data_dir, f"latest_{list_key}.json")
    write_json(latest_out, output)
    print(f"  [OK] latest_{list_key}.json")

    # 写入 trends/{list_key}/YYYY-MM-DD.json
    write_json(trend_path, {"date": latest_data["date"], "prev_date": prev_date, "trends": trends})
    print(f"  [OK] trends/{list_key}/{latest_data['date']}.json")

    # 写入 market_summary_{list_key}.json
    market_payload = build_market_summary_payload(output, trends_dir, list_key)
    if api_base_url and api_key and api_model:
        market_payload = enrich_market_summary_with_ai(
            market_payload, api_key, api_base_url, api_model, list_key
        )
    market_path = os.path.join(data_dir, f"market_summary_{list_key}.json")
    write_json(market_path, market_payload)
    print(f"  [OK] market_summary_{list_key}.json")

    # 写入 stats_{list_key}.json
    stats_payload = build_stats_payload(output, list_key)
    stats_path = os.path.join(data_dir, f"stats_{list_key}.json")
    write_json(stats_path, stats_payload)
    print(f"  [OK] stats_{list_key}.json")

    # 写入 api/lastest/{list_key}/*.json
    api_dir = build_lastest_api(output, base_dir, list_key)
    print(f"  [OK] api/lastest/{list_key}/")

    return True


def build_dates_index(base_dir: str, data_dir: str):
    """生成全榜日期索引（含 lists 字段）。"""
    dates_data = {"dates": [], "lists": {}}

    for list_key in LIST_ORDER:
        file_key = LISTS[list_key]["file_key"]
        snapshots = sorted(glob.glob(os.path.join(data_dir, f"fanqie_{file_key}_ranks_*.json")))
        list_dates = []
        for s in snapshots:
            m = re.search(r"(\d{4})(\d{2})(\d{2})", os.path.basename(s))
            if m:
                date = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
                list_dates.append(date)
        dates_data["lists"][list_key] = {
            "name": LISTS[list_key]["name"],
            "file_key": file_key,
            "dates": sorted(list_dates),
            "latest_date": sorted(list_dates)[-1] if list_dates else "",
        }

    all_dates = set()
    for list_info in dates_data["lists"].values():
        all_dates.update(list_info["dates"])
    dates_data["dates"] = sorted(all_dates)

    dates_path = os.path.join(data_dir, "dates.json")
    write_json(dates_path, dates_data)
    print(f"\n[OK] dates.json ({len(dates_data['dates'])} 个日期, {len(dates_data['lists'])} 个榜单)")
    return dates_data


# ─────────────────────────────────────────────────────────────────────────────
# 主入口
# ─────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="构建四榜 latest 文件")
    parser.add_argument("--list", type=str, choices=LIST_ORDER, default=None,
                        help="指定构建单个榜单（默认全部）")
    parser.add_argument("--force", action="store_true",
                        help="强制重新生成所有 AI 总结")
    parser.add_argument("--date", type=str, default="",
                        help="指定目标日期 (YYYY-MM-DD)，默认使用最新快照")
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "data")

    api_base_url = os.environ.get("API_BASE_URL", "")
    api_key = os.environ.get("API_KEY", "")
    api_model = os.environ.get("API_MODEL", "")

    print("=" * 55)
    print("  番茄小说 · 四榜构建脚本")
    print(f"  API: {api_model or '(未配置，使用规则摘要)'}")
    print("=" * 55)

    keys = [args.list] if args.list else LIST_ORDER
    success_count = 0

    for key in keys:
        ok = build_single_list(
            key, base_dir, data_dir,
            api_base_url, api_key, api_model,
            force=args.force, target_date=args.date,
        )
        if ok:
            success_count += 1

    # 生成全榜日期索引
    build_dates_index(base_dir, data_dir)

    print(f"\n{'='*55}")
    print(f"  构建完毕: {success_count}/{len(keys)} 个榜单")
    print("=" * 55)


if __name__ == "__main__":
    main()
