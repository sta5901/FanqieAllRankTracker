"""
T-0.1 · 男频页面 DOM 验证脚本
目的：确认四个榜单的页面结构一致，分类提取 JS 选择器无需调整。
输出：每个榜单的分类数量、分类名称列表。

运行：
    python scripts/verify_lists.py
"""
import os
import sys
from pathlib import Path

# 确保可以 import playwright
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("请先安装 playwright: pip install playwright && playwright install chromium")
    sys.exit(1)


# 四个榜单配置
LISTS = {
    "male_read": {
        "name": "男频阅读榜",
        "url": "https://fanqienovel.com/rank/1_2_1141",
        "href_pattern": "/rank/1_2_",
    },
    "male_new": {
        "name": "男频新书榜",
        "url": "https://fanqienovel.com/rank/1_1_1141",
        "href_pattern": "/rank/1_1_",
    },
    "female_read": {
        "name": "女频阅读榜",
        "url": "https://fanqienovel.com/rank/0_2_1139",
        "href_pattern": "/rank/0_2_",
    },
    "female_new": {
        "name": "女频新书榜",
        "url": "https://fanqienovel.com/rank/0_1_1139",
        "href_pattern": "/rank/0_1_",
    },
}


def verify_list(key: str, cfg: dict) -> dict:
    """验证单个榜单页面结构，返回分类信息。"""
    url = cfg["url"]
    href_pattern = cfg["href_pattern"]
    name = cfg["name"]

    print(f"\n{'='*60}")
    print(f"验证：{name} ({key})")
    print(f"URL: {url}")
    print(f"{'='*60}")

    result = {"key": key, "name": name, "url": url, "categories": [], "error": None}

    with sync_playwright() as p:
        if os.environ.get("GITHUB_ACTIONS"):
            browser = p.chromium.launch(headless=True)
        else:
            browser = p.chromium.launch(headless=True, channel="chrome")

        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        try:
            print(f"  → 正在访问页面...")
            page.goto(url, wait_until="load", timeout=15000)
            page.wait_for_selector('a[href^="/page/"]', timeout=8000)
            print(f"  ✓ 页面加载成功")

            # 提取分类链接（与现有爬虫逻辑完全一致）
            extract_js = f"""
            () => {{
                return Array.from(document.querySelectorAll('a'))
                    .filter(a => a.href.includes('{href_pattern}'))
                    .map(a => ({{
                        name: a.innerText.trim(),
                        href: a.getAttribute('href')
                    }}));
            }}
            """
            categories = page.evaluate(extract_js)

            # 去重（同一个分类可能在页面中出现多次）
            seen = set()
            unique = []
            for cat in categories:
                if cat["name"] and cat["name"] not in seen and cat["href"]:
                    seen.add(cat["name"])
                    unique.append(cat)

            unique.sort(key=lambda x: x["name"])

            print(f"  ✓ 提取到 {len(unique)} 个分类")
            for cat in unique:
                print(f"    - {cat['name']}  →  {cat['href']}")

            result["categories"] = unique

            # 验证：点击第一个分类后，书籍卡片是否可提取
            if unique:
                first_cat = unique[0]
                print(f"\n  → 测试点击第一个分类: {first_cat['name']}")
                try:
                    page.locator(f'a[href="{first_cat["href"]}"]').click()
                    page.wait_for_timeout(2500)
                    page.wait_for_selector('a[href^="/page/"]', timeout=5000)
                    print(f"  ✓ 分类切换成功")

                    # 滚动加载
                    for _ in range(3):
                        page.evaluate("window.scrollBy(0, window.innerHeight)")
                        page.wait_for_timeout(1000)

                    # 提取书籍数量
                    book_count_js = """
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
                        return bookMap.size;
                    }
                    """
                    book_count = page.evaluate(book_count_js)
                    print(f"  ✓ 提取到 {book_count} 本书（Top 30 内）")
                    result["book_count"] = book_count
                except Exception as e:
                    print(f"  ⚠  分类点击测试失败: {e}")
                    result["click_error"] = str(e)

        except Exception as e:
            print(f"  ✗ 页面加载失败: {e}")
            result["error"] = str(e)

        finally:
            browser.close()

    return result


def main():
    print("=" * 60)
    print("番茄小说 · 四榜页面结构验证")
    print("=" * 60)

    output_dir = Path(__file__).parent.parent / "docs" / "verification"
    output_dir.mkdir(exist_ok=True, parents=True)

    all_results = {}
    for key, cfg in LISTS.items():
        result = verify_list(key, cfg)
        all_results[key] = result

    # 汇总报告
    print("\n")
    print("=" * 60)
    print("验证汇总")
    print("=" * 60)
    for key, result in all_results.items():
        status = "✗" if result["error"] else "✓"
        cat_count = len(result.get("categories", []))
        book_count = result.get("book_count", "?")
        print(f"  {status} {result['name']}: {cat_count} 个分类, 测试抓书 {book_count} 本")
        if result["error"]:
            print(f"      错误: {result['error']}")

    # 保存报告
    import json

    report_path = output_dir / "verify_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n报告已保存: {report_path}")

    # 检查是否有错误
    errors = [k for k, v in all_results.items() if v["error"]]
    if errors:
        print(f"\n⚠  以下榜单验证失败: {errors}")
        sys.exit(1)
    else:
        print("\n✅ 所有榜单验证通过！")


if __name__ == "__main__":
    main()
