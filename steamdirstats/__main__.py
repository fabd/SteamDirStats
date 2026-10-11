"""Command-line output for testing the scanner: python -m steamdirstats"""

from __future__ import annotations

import argparse
import json
import sys

from .locate import SteamNotFoundError
from .models import SteamData
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


def plural(count: int, word: str) -> str:
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def print_report(data: SteamData) -> None:
    print(f"Steam: {data.steam_path}")
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
            print(f"  {format_size(g.size_on_disk):>10}  {g.name}  ({g.appid}){note}")

    available = [lib for lib in data.libraries if lib.available]
    print()
    print(
        f"Total: {plural(len(data.games), 'game')}, {format_size(data.size_on_disk)} "
        f"in {len(available)} {'library' if len(available) == 1 else 'libraries'}"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="steamdirstats", description="List installed Steam games by library.")
    parser.add_argument("--steam-path", help="Steam folder (default: auto-detect)")
    parser.add_argument("--json", action="store_true", help="output JSON instead of a text report")
    args = parser.parse_args(argv)

    # Game names can contain any Unicode; Git Bash pipes default to a legacy code page.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    try:
        data = scan(args.steam_path)
    except SteamNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(data.to_dict(), indent=2, ensure_ascii=False))
    else:
        print_report(data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
