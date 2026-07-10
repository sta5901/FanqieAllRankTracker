import os
import json
import time
import re
from datetime import datetime
from playwright.sync_api import sync_playwright

# ─────────────────────────────────────────────────────────────────────────────
# LISTS — 四榜配置（所有榜单共用同一套 CHAR_SEQUENCE 解码表）
# ─────────────────────────────────────────────────────────────────────────────
LISTS = {
    # key          中文名      榜单路由           file_key      color   icon
    "female_new": {
        "name": "女频新书榜",
        "base_url": "https://fanqienovel.com/rank/0_1_1139",
        "file_key": "female_new",
        "color": "#EC4899",
        "icon": "ti-heart",
    },
    "female_read": {
        "name": "女频阅读榜",
        "base_url": "https://fanqienovel.com/rank/0_2_1139",
        "file_key": "female_read",
        "color": "#F472B6",
        "icon": "ti-heartbeat",
    },
    "male_new": {
        "name": "男频新书榜",
        "base_url": "https://fanqienovel.com/rank/1_1_1141",
        "file_key": "male_new",
        "color": "#3B82F6",
        "icon": "ti-user",
    },
    "male_read": {
        "name": "男频阅读榜",
        "base_url": "https://fanqienovel.com/rank/1_2_1141",
        "file_key": "male_read",
        "color": "#60A5FA",
        "icon": "ti-users",
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# 番茄反爬字符解码表
# ─────────────────────────────────────────────────────────────────────────────
START_CODE = 58344  # 0xE3E8
CHAR_SEQUENCE = [
    "D", "在", "主", "特", "家", "军", "然", "表", "场", "4", "要", "只", "v", "和", "?", "6", "别", "还", "g", "现", "儿", "岁", "?", "?", "此", "象", "月", "3", "出", "战", "工", "相", "o", "男", "直", "失", "世", "F", "都", "平", "文", "什", "V", "O", "将", "真", "T", "那", "当", "?", "会", "立", "些", "u", "是", "十", "张", "学", "气", "大", "爱", "两", "命", "全", "后", "东", "性", "通", "被", "1", "它", "乐", "接", "而", "感", "车", "山", "公", "了", "常", "以", "何", "可", "话", "先", "p", "i", "叫", "轻", "M", "士", "w", "着", "变", "尔", "快", "l", "个", "说", "少", "色", "里", "安", "花", "远", "7", "难", "师", "放", "t", "报", "认", "面", "道", "S", "?", "克", "地", "度", "I", "好", "机", "U", "民", "写", "把", "万", "同", "水", "新", "没", "书", "电", "吃", "像", "斯", "5", "为", "y", "白", "几", "日", "教", "看", "但", "第", "加", "候", "作", "上", "拉", "住", "有", "法", "r", "事", "应", "位", "利", "你", "声", "身", "国", "问", "马", "女", "他", "Y", "比", "父", "x", "A", "H", "N", "s", "X", "边", "美", "对", "所", "金", "活", "回", "意", "到", "z", "从", "j", "知", "又", "内", "因", "点", "Q", "三", "定", "8", "R", "b", "正", "或", "夫", "向", "德", "听", "更", "?", "得", "告", "并", "本", "q", "过", "记", "L", "让", "打", "f", "人", "就", "者", "去", "原", "满", "体", "做", "经", "K", "走", "如", "孩", "c", "G", "给", "使", "物", "?", "最", "笑", "部", "?", "员", "等", "受", "k", "行", "一", "条", "果", "动", "光", "门", "头", "见", "往", "自", "解", "成", "处", "天", "能", "于", "名", "其", "发", "总", "母", "的", "死", "手", "入", "路", "进", "心", "来", "h", "时", "力", "多", "开", "已", "许", "d", "至", "由", "很", "界", "n", "小", "与", "Z", "想", "代", "么", "分", "生", "口", "再", "妈", "望", "次", "西", "风", "种", "带", "J", "?", "实", "情", "才", "这", "?", "E", "我", "神", "格", "长", "觉", "间", "年", "眼", "无", "不", "亲", "关", "结", "0", "友", "信", "下", "却", "重", "己", "老", "2", "音", "字", "m", "呢", "明", "之", "前", "高", "P", "B", "目", "太", "e", "9", "起", "稜", "她", "也", "W", "用", "方", "子", "英", "每", "理", "便", "四", "数", "期", "中", "C", "外", "样", "a", "海", "们", "任"
]


# ─────────────────────────────────────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────────────────────────────────────
def decode_text(text: str) -> str:
    """番茄小说反爬字符解码。"""
    if not text:
        return ""
    result = []
    for char in text:
        code = ord(char)
        idx = code - START_CODE
        if 0 <= idx < len(CHAR_SEQUENCE):
            result.append(CHAR_SEQUENCE[idx])
        else:
            result.append(char)
    return "".join(result)


def extract_keywords(title: str, intro: str = "", is_male: bool = False) -> list:
    """
    从书名和简介中提取关键词标签（P0 规则匹配）。
    is_male=True 时使用男频关键词库，否则使用女频关键词库。
    """
    # 通用关键词库
    COMMON_KEYWORDS = {
        "重生", "穿书", "快穿", "系统", "空间", "团宠", "萌宝", "幼崽",
        "女配", "炮灰", "反派", "权臣", "宅斗", "宫斗", "和离", "替嫁",
        "逃荒", "种田", "美食", "经商", "年代", "七零", "八零", "军婚",
        "豪门", "总裁", "真假千金", "先婚后爱", "追妻", "甜宠", "双洁",
        "强制爱", "无CP", "末世", "废土", "天灾", "囤货", "异能",
        "国运", "星际", "修仙", "玄学", "无限流", "悬疑", "直播", "综艺",
        "娱乐圈", "校园", "暗恋", "青梅竹马", "民国", "兽世", "远古", "基建",
    }

    # 女频专属关键词
    FEMALE_KEYWORDS = {
        "娇妻", "霸总", "千金", "影后", "医妃", "神医", "空间异能",
        "团宠崽崽", "马甲", "大佬", "病娇", "绿茶", "白月光", "黑莲花",
    }

    # 男频专属关键词
    MALE_KEYWORDS = {
        "战神", "赘婿", "兵王", "神医", "护国", "修罗", "无敌",
        "都市", "乡村", "修仙", "玄幻", "都市兵王", "透视",
        "热血", "逆袭", "复仇", "鉴宝", "风水", "赌石", "盗墓",
    }

    keywords_lib = COMMON_KEYWORDS | (MALE_KEYWORDS if is_male else FEMALE_KEYWORDS)
    text = (title + " " + (intro or "")).replace(" ", "")

    matched = []
    for kw in keywords_lib:
        if kw in text:
            matched.append(kw)

    # 冒号后半句提取（如"书名：副标题"）
    colon_match = re.search(r"[：:]([^\n：:]{2,20})", title)
    if colon_match:
        extra = colon_match.group(1).strip()
        if extra and len(extra) >= 2 and extra not in matched:
            matched.append(extra)

    return matched[:6]


# ─────────────────────────────────────────────────────────────────────────────
# 爬虫核心
# ─────────────────────────────────────────────────────────────────────────────
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def run_single_list(list_key: str, limit: int = 30, sleep_sec: int = 5):
    """
    爬取指定榜单。

    参数:
        list_key:  LISTS 字典中的 key（如 "female_new"）
        limit:     每个分类最多抓取书籍数量
        sleep_sec: 分类间等待秒数（防封禁）
    """
    if list_key not in LISTS:
        raise ValueError(f"Unknown list_key: {list_key}. Available: {list(LISTS.keys())}")

    cfg = LISTS[list_key]
    list_name = cfg["name"]
    file_key = cfg["file_key"]
    init_url = cfg["base_url"]

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    date_str = datetime.now().strftime("%Y%m%d")
    output_file = os.path.join(OUTPUT_DIR, f"fanqie_{file_key}_ranks_{date_str}.json")
    state_file = os.path.join(OUTPUT_DIR, f"task_state_{file_key}_{date_str}.json")

    # 判断是否男频
    is_male = "male" in list_key

    # ── 状态恢复逻辑 ──────────────────────────────────────────────────────────
    completed_cats = []
    all_categories = []

    if os.path.exists(state_file):
        with open(state_file, "r", encoding="utf-8") as f:
            try:
                state = json.load(f)
                completed_cats = state.get("completed", [])
            except Exception:
                pass

    if os.path.exists(output_file) and completed_cats:
        with open(output_file, "r", encoding="utf-8") as f:
            try:
                existing = json.load(f)
                all_categories = existing.get("categories", [])
            except Exception:
                pass
    # ────────────────────────────────────────────────────────────────────────

    ts = lambda: datetime.now().strftime("%H:%M:%S")

    with sync_playwright() as p:
        if os.environ.get("GITHUB_ACTIONS"):
            browser = p.chromium.launch(headless=True)
        else:
            browser = p.chromium.launch(headless=True, channel="chrome")

        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        print(f"[{ts()}] [■] {list_name} · 正在初始化：{init_url}")

        try:
            page.goto(init_url, wait_until="load", timeout=15000)
            page.wait_for_selector('a[href^="/page/"]', timeout=5000)
        except Exception as e:
            print(f"[{ts()}] [✗] 页面加载失败 {list_name}: {e}")
            browser.close()
            return

        # 动态解析左侧分类目录（从榜单路由中提取）
        # href_pattern: 匹配 /rank/{prefix1}_{prefix2}_ 开头的链接
        prefix_pattern = "/rank/" + "_".join(init_url.rstrip("/").split("/")[-1].split("_")[:2]) + "_"
        categories_js = f"""
        () => {{
            return Array.from(document.querySelectorAll('a'))
                .filter(a => a.href.includes('{prefix_pattern}'))
                .map(a => ({{
                    name: a.innerText.trim(),
                    href: a.getAttribute('href')
                }}));
        }}
        """
        categories = page.evaluate(categories_js)

        # 去重
        seen = set()
        unique_cats = []
        for cat in categories:
            if cat["name"] and cat["name"] not in seen:
                seen.add(cat["name"])
                unique_cats.append(cat)

        print(f"[{ts()}] [✓] {list_name} · 自适应提取到 {len(unique_cats)} 个分类，开始抓取...")

        for cat in unique_cats:
            cat_name = cat["name"]
            cat_href = cat["href"]

            if cat_name in completed_cats:
                print(f"[{ts()}] [→] {list_name} · 跳过已完成的分类：{cat_name}")
                continue

            print(f"[{ts()}] [▶] {list_name} · 模拟点击 → {cat_name}")

            try:
                page.locator(f'a[href="{cat_href}"]').click()
                time.sleep(2)
                page.wait_for_selector('a[href^="/page/"]', timeout=5000)
            except Exception as e:
                print(f"[{ts()}] [⚠] 分类切换失败 {cat_name}: {e}")

            # 滚动加载
            for _ in range(5):
                page.evaluate("window.scrollBy(0, window.innerHeight)")
                time.sleep(1.5)

            # 提取书籍卡片 DOM
            extract_js = """
            () => {
                const bookMap = new Map();
                const links = document.querySelectorAll('a[href^="/page/"]');
                links.forEach(link => {
                    let container = link.parentElement;
                    let depth = 0;
                    while (container && depth < 6) {
                        if (container.querySelector('img') && container.innerText.includes('在读')) {
                            const href = link.getAttribute('href');
                            if (!bookMap.has(href)) {
                                bookMap.set(href, container);
                            }
                            break;
                        }
                        container = container.parentElement;
                        depth++;
                    }
                });

                const results = [];
                for (const item of bookMap.values()) {
                    let imgNode = item.querySelector('img');
                    let cover = imgNode ? imgNode.getAttribute('src') : "";

                    let title = imgNode ? (imgNode.getAttribute('alt') || "").trim() : "";
                    if (!title || title.includes("榜单说明")) {
                        let textTitleNode = item.querySelector('h4, .title, h1')
                            || item.querySelector('a[href^="/page/"]');
                        if (textTitleNode) {
                            let text = textTitleNode.innerText.trim();
                            if (text && !/^\\d+$/.test(text)) title = text;
                        }
                    }
                    if (!title) title = "未知";

                    let authorNode = item.querySelector('.author, .author-name')
                        || item.querySelector('a[href^="/author-page/"]');
                    let author = authorNode ? authorNode.innerText.trim() : "未知";

                    let reads = "未知";
                    for (let line of item.innerText.split('\\n')) {
                        if (line.includes('在读')) { reads = line; break; }
                    }

                    let introNode = item.querySelector('.intro, .abstract, .desc');
                    let intro = introNode ? introNode.innerText.trim() : "暂无简介";

                    results.push({
                        title, author, reads, intro, cover,
                        url: item.querySelector('a[href^="/page/"]').getAttribute('href')
                    });
                }
                return results;
            }
            """

            try:
                books_data = page.evaluate(extract_js)
            except Exception as e:
                print(f"[{ts()}] [⚠] JS 抽取失败 {cat_name}: {e}")
                books_data = []

            category_books = []
            for b in books_data[:limit]:
                t = decode_text(b.get("title", ""))
                a = decode_text(b.get("author", ""))
                r_raw = decode_text(b.get("reads", ""))
                i = decode_text(b.get("intro", "")).replace("\\n", " ")
                c = b.get("cover", "")

                # 清理在读数字符串
                if "在读" in r_raw:
                    parts = r_raw.split("在读")
                    cleaned_r = parts[1].replace(":", "").replace("：", "").strip() if len(parts) > 1 else r_raw
                else:
                    cleaned_r = r_raw

                # 提取关键词
                keywords = extract_keywords(t, i, is_male=is_male)

                category_books.append({
                    "title": t,
                    "author": a,
                    "reads": cleaned_r,
                    "intro": i,
                    "cover": c,
                    "url": "https://fanqienovel.com" + b.get("url", ""),
                    "keywords": keywords,
                })

            all_categories.append({
                "name": cat_name,
                "books": category_books
            })

            # 增量写入快照
            snapshot = {
                "date": datetime.now().strftime("%Y-%m-%d"),
                "list_key": list_key,
                "list_name": list_name,
                "categories": all_categories
            }
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(snapshot, f, ensure_ascii=False, indent=2)

            # 更新断点状态
            completed_cats.append(cat_name)
            with open(state_file, "w", encoding="utf-8") as f:
                json.dump({"completed": completed_cats}, f, ensure_ascii=False)

            print(f"[{ts()}] [✓] {list_name} · {cat_name} · {len(category_books)} 本 · 存档完成")

            time.sleep(sleep_sec)

        browser.close()

    print(f"\n[{ts()}] [✓] {list_name} 任务完毕 → {output_file}")


# ─────────────────────────────────────────────────────────────────────────────
# 入口
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="番茄小说榜单爬虫")
    parser.add_argument(
        "--list",
        type=str,
        choices=list(LISTS.keys()),
        default="female_new",
        help="指定要爬取的榜单（默认 female_new）"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=30,
        help="每个分类最多抓取书籍数量（默认 30）"
    )
    parser.add_argument(
        "--sleep",
        type=int,
        default=5,
        help="分类间等待秒数（默认 5）"
    )
    args = parser.parse_args()

    print("=" * 55)
    print(f"  番茄小说 · {LISTS[args.list]['name']} 爬虫")
    print(f"  限 {args.limit} 本/分类，间隔 {args.sleep}s")
    print("=" * 55)

    run_single_list(args.list, limit=args.limit, sleep_sec=args.sleep)
