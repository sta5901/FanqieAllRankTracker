"""
T-1.3 · 四榜顺序爬取入口

使用方式：
    python scrape_all.py              # 爬取全部四榜（顺序执行）
    python scrape_all.py female_new   # 只爬取指定榜单
    python scrape_all.py --dry-run    # 打印计划，不实际爬取

环境变量：
    SCRAPE_INTERVAL   榜单间等待秒数（默认 10）
"""
import os
import sys
import time
import argparse
from datetime import datetime

# 优先使用 rich 输出，无则回退
try:
    from rich.console import Console
    from rich.table import Table
    from rich.progress import track
    from rich import print as rprint
    _RICH = True
    _console = Console()
except ImportError:
    _RICH = False
    _console = None

from scrape_fanqie_ranks import LISTS, run_single_list


LIST_ORDER = ["female_new", "female_read", "male_new", "male_read"]
LIST_INTERVAL = int(os.environ.get("SCRAPE_INTERVAL", "10"))


def _rich_table() -> "Table":
    """打印四榜配置表（rich）。"""
    table = Table(title="番茄小说 · 四榜爬取计划", show_lines=True)
    table.add_column("Key", style="cyan bold", width=14)
    table.add_column("榜单", style="magenta", width=10)
    table.add_column("路由", style="dim")
    table.add_column("输出文件前缀", style="green")
    table.add_column("状态", width=8)
    return table


def print_plan(keys: list):
    """打印本次执行计划。"""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if _RICH:
        table = _rich_table()
        for key in keys:
            cfg = LISTS[key]
            file_key = cfg["file_key"]
            date_str = datetime.now().strftime("%Y%m%d")
            output = f"fanqie_{file_key}_ranks_{date_str}.json"
            table.add_row(key, cfg["name"], cfg["base_url"].split("/")[-1], output, "[dim]等待执行[/dim]")
        _console.print(f"\n[bold yellow]番茄小说 · 四榜爬取[/bold yellow]  {ts}\n")
        _console.print(table)
        _console.print()
    else:
        print(f"\n{'='*60}")
        print(f"  番茄小说 · 四榜爬取  {ts}")
        print(f"{'='*60}")
        for key in keys:
            cfg = LISTS[key]
            print(f"  [{key:12s}] {cfg['name']} → {cfg['base_url']}")
        print()


def run_all(keys: list, dry_run: bool = False, limit: int = 30, sleep_sec: int = 5):
    """顺序执行所有榜单爬取。"""
    if dry_run:
        print_plan(keys)
        print("[DRY-RUN] 以上为本次执行计划，未实际爬取。")
        return

    print_plan(keys)

    results = {}
    ts_start = datetime.now().strftime("%H:%M:%S")

    for i, key in enumerate(keys):
        cfg = LISTS[key]
        list_name = cfg["name"]
        marker = f"[{i+1}/{len(keys)}]"

        if _RICH:
            _console.print(f"\n[bold yellow]{marker}[/bold yellow] [bold white]开始爬取 {list_name}...[/bold white]")
        else:
            print(f"\n{'─'*50}")
            print(f"{marker} 开始爬取 {list_name}...")
            print(f"{'─'*50}")

        try:
            t0 = time.time()
            run_single_list(key, limit=limit, sleep_sec=sleep_sec)
            elapsed = time.time() - t0

            results[key] = {"status": "success", "elapsed": elapsed}
            if _RICH:
                _console.print(f"[bold green]{marker}[/bold green] [green]{list_name} 完成[/green] · 耗时 {elapsed:.1f}s")
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [✓] {list_name} 完成 · 耗时 {elapsed:.1f}s")

        except Exception as e:
            results[key] = {"status": "error", "error": str(e)}
            if _RICH:
                _console.print(f"[bold red]{marker}[/bold red] [red]{list_name} 失败: {e}[/red]")
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [✗] {list_name} 失败: {e}")

        # 榜单间等待（最后一榜不等待）
        if i < len(keys) - 1:
            next_key = LIST_ORDER[i + 1]
            next_name = LISTS[next_key]["name"]
            if _RICH:
                _console.print(f"[dim]下一榜: {next_name}，等待 {LIST_INTERVAL}s...[/dim]")
            else:
                print(f"下一榜: {next_name}，等待 {LIST_INTERVAL}s...")
            time.sleep(LIST_INTERVAL)

    # 汇总报告
    ts_end = datetime.now().strftime("%H:%M:%S")
    success = [k for k, v in results.items() if v["status"] == "success"]
    failed = [k for k, v in results.items() if v["status"] == "error"]

    if _RICH:
        _console.print(f"\n[bold]执行完毕[/bold]  {ts_start} → {ts_end}")
        if success:
            _console.print(f"[green]成功 {len(success)}/{len(keys)}:[/green] " + ", ".join(success))
        if failed:
            _console.print(f"[red]失败 {len(failed)}/{len(keys)}:[/red] " + ", ".join(failed))
        else:
            _console.print("[bold green]全部榜单爬取成功！[/bold green]")
    else:
        print(f"\n{'='*60}")
        print(f"执行完毕  {ts_start} → {ts_end}")
        print(f"成功 {len(success)}/{len(keys)}: {', '.join(success)}")
        if failed:
            print(f"失败 {len(failed)}/{len(keys)}: {', '.join(failed)}")
        else:
            print("全部榜单爬取成功！")


def main():
    parser = argparse.ArgumentParser(
        description="番茄小说四榜顺序爬取入口",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python scrape_all.py              # 爬取全部四榜
  python scrape_all.py female_new    # 只爬取单个榜单
  python scrape_all.py --dry-run     # 打印计划不执行
  SCRAPE_INTERVAL=5 python scrape_all.py  # 自定义间隔
        """
    )
    parser.add_argument(
        "single_list",
        nargs="?",
        choices=LIST_ORDER,
        default=None,
        help="可选：只爬取指定榜单"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="打印计划，不实际爬取"
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
        help="同榜单分类间等待秒数（默认 5）"
    )
    args = parser.parse_args()

    keys = [args.single_list] if args.single_list else LIST_ORDER
    run_all(keys, dry_run=args.dry_run, limit=args.limit, sleep_sec=args.sleep)


if __name__ == "__main__":
    main()
