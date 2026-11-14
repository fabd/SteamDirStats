"""Command-line output for testing the scanner: python -m steamdirstats"""

from __future__ import annotations

import argparse
import datetime
import json
import math
import sys

from .locate import SteamNotFoundError
from .models import Game, SteamData
from .scanner import scan


def format_size(num_bytes: int | None) -> str:
    """Binary units, labelled like Windows Explorer (1 GB = 1024^3 bytes)."""
    if num_bytes is None:
        return "?"
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.2f} TB"


def format_playtime(minutes: int | None) -> str | None:
    """Playtime the way Steam shows it: "45 min", "590.8 h".

    Steam rounds the hours up to one decimal (35443 minutes is 590.72 hours,
    which Steam displays as 590.8), so round the same way to match it.
    """
    if not minutes:
        return None
    if minutes < 60:
        return f"{minutes} min"
    return f"{math.ceil(minutes / 6) / 10:.1f} h"


def format_last_played(timestamp: int | None) -> str | None:
    """A date like Steam's: "Nov 12", with the year added for older dates."""
    if not timestamp:
        return None
    try:
        when = datetime.datetime.fromtimestamp(timestamp)
    except (OverflowError, OSError, ValueError):
        return None
    if when.year == datetime.date.today().year:
        return when.strftime("%b %d").replace(" 0", " ")
    return when.strftime("%b %d, %Y").replace(" 0", " ")


def format_play_note(game: Game) -> str:
    """The "[590.8 h, Nov 12]" part of a game line, empty when never played."""
    parts = [p for p in (format_playtime(game.playtime), format_last_played(game.last_played)) if p]
    return f"  [{', '.join(parts)}]" if parts else ""


def plural(count: int, word: str) -> str:
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def print_report(data: SteamData, show_items: bool = True, show_urls: bool = False) -> None:
    print(f"Steam: {data.steam_path}")
    if data.accurate:
        print("Sizes: measured on disk (accurate mode)")
    if data.account:
        print(f"Account: {data.account.display_name}  ({data.account.accountid})")
    for lib in data.libraries:
        print()
        header = f"Library: {lib.path}"
        if lib.label:
            header += f'  "{lib.label}"'
        if not lib.available:
            print(f"{header}  (not found, skipped)")
            continue
        print(f"{header}  ({plural(len(lib.games), 'game')}, {format_size(lib.size_on_disk)})")
        if lib.disk_total:
            print(f"  Disk: {format_size(lib.disk_free)} free of {format_size(lib.disk_total)}")
        for g in lib.games:
            note = "" if g.fully_installed else "  [not fully installed]"
            if g.workshop_size:
                note = f"  ( WORKSHOP {format_size(g.workshop_size)} ){note}"
            note += format_play_note(g)
            print(f"  {format_size(g.total_size):>10}  {g.name}  ({g.appid}){note}")
            if show_items:
                print_workshop_items(g, show_urls)

    available = [lib for lib in data.libraries if lib.available]
    workshop = f" (Workshop: {format_size(data.workshop_size)})" if data.workshop_size else ""
    print()
    print(
        f"Total: {plural(len(data.games), 'game')}, {format_size(data.size_on_disk)} "
        f"in {len(available)} {'library' if len(available) == 1 else 'libraries'}{workshop}"
    )
    print_name_stats(data.name_stats)


def print_workshop_items(game: Game, show_urls: bool = False) -> None:
    """One indented line per Workshop item, largest first."""
    for number, item in enumerate(game.workshop_items, start=1):
        line = f"     {number:>3}. {format_size(item.size):>9}  {item.display_name}"
        if item.name is None:
            line += "  [name unavailable]"
        if show_urls:
            line += f"  {item.url}"
        print(line)


def print_name_stats(stats) -> None:
    """One line about the Workshop name lookup, when there was anything to say."""
    if not stats:
        return
    parts = []
    if stats.cached:
        parts.append(f"{stats.cached} from cache")
    if stats.fetched:
        parts.append(f"{stats.fetched} fetched")
    if stats.local:
        parts.append(f"{stats.local} from item folders")
    if stats.unavailable:
        parts.append(f"{stats.unavailable} unavailable")
    if stats.failed:
        parts.append(f"{stats.failed} not looked up")
    if parts:
        print(f"Workshop names: {', '.join(parts)}")


def report_scan_progress(done: int, total: int, name: str) -> None:
    """Overwrite one line on stderr while the folders are being measured."""
    if done >= total:
        print("\r" + " " * 78 + "\r", end="", file=sys.stderr, flush=True)
        return
    line = f"Measuring {done + 1}/{total} on disk: {name}"
    print(f"\r{line[:76]:<78}", end="", file=sys.stderr, flush=True)


def report_progress(done: int, total: int) -> None:
    """Called while the Workshop names are being fetched."""
    if done == 0:
        print(
            f"Requesting {total} Workshop item names from the public Steam API...",
            file=sys.stderr,
            flush=True,
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="steamdirstats", description="List installed Steam games by library.")
    parser.add_argument("--steam-path", help="Steam folder (default: auto-detect)")
    parser.add_argument("--json", action="store_true", help="output JSON instead of a text report")
    parser.add_argument(
        "--no-items", action="store_true", help="hide the per-item Workshop lines"
    )
    parser.add_argument(
        "--item-urls", action="store_true", help="show the Steam Community link per Workshop item"
    )
    parser.add_argument(
        "--accurate",
        action="store_true",
        help="measure the folders on disk instead of trusting the manifest sizes",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="do not call the Steam web API; use cached Workshop names only",
    )
    args = parser.parse_args(argv)

    # Game names can contain any Unicode; Git Bash pipes default to a legacy code page.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    try:
        data = scan(
            args.steam_path,
            workshop_names=True,
            offline=args.offline,
            progress=report_progress,
            accurate=args.accurate,
            scan_progress=report_scan_progress,
        )
    except SteamNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(data.to_dict(), indent=2, ensure_ascii=False))
    else:
        print_report(data, show_items=not args.no_items, show_urls=args.item_urls)
    return 0


if __name__ == "__main__":
    sys.exit(main())
