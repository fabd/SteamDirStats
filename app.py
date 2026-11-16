"""SteamDirStats desktop app: a pywebview window around the Vue UI.

This module is glue only. All the scanning lives in the `steamdirstats`
package, so the UI could be put on another backend without touching it.

    python app.py --dev     window pointed at the Vite dev server (hot reload)
    python app.py           window loading the built ui/dist/index.html
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any

import webview

import settings
from steamdirstats.scanner import scan

DEV_SERVER_URL = "http://localhost:5173"

# Where devtools settings and localStorage are kept between `--dev` runs (gitignored)
DEV_PROFILE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), ".webview-dev-profile"
)

WINDOW_TITLE = "SteamDirStats"
WINDOW_SIZE = (1200, 800)
WINDOW_MIN_SIZE = (800, 500)

# The scan progress callback fires once per game, which is far more often than
# a status line can be read. Push at most this often (plus the first and last).
PROGRESS_INTERVAL_S = 0.1


def resource_path(*parts: str) -> str:
    """Full path to a file we ship, such as the built UI.

    Not the same as appdir.app_folder(): PyInstaller --onefile unpacks the
    bundled files into a temporary folder (sys._MEIPASS) that is deleted on
    exit, while our settings must stay next to the exe. Keep the two apart.
    """
    base = getattr(sys, "_MEIPASS", None) or os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, *parts)


class Api:
    """What the UI can call, as `window.pywebview.api.<method>()`.

    The method names are the contract with ui/src/api/bridge.ts; keep the two
    in step. Exceptions raised here reach the UI as a rejected promise, which
    the store turns into the message in the status bar.
    """

    def __init__(self, steam_path: str | None = None) -> None:
        self._steam_path = steam_path
        # Underscored: pywebview exposes public attributes to the page too.
        self._window: webview.Window | None = None
        self._last_progress = 0.0

    def scan(self, options: dict[str, Any] | None = None) -> dict[str, Any]:
        """Scan Steam and return the data as JSON-ready dicts.

        pywebview runs each API call on its own thread, so an accurate scan
        does not freeze the window; progress goes to the UI as it runs.
        """
        options = options or {}
        self._last_progress = 0.0
        data = scan(
            steam_path=self._steam_path,
            accurate=bool(options.get("accurate")),
            workshop_names=bool(options.get("workshop_names")),
            offline=bool(options.get("offline")),
            scan_progress=self._on_scan_progress,
            progress=self._on_name_progress,
        )
        return data.to_dict()

    def open_folder(self, path: str) -> bool:
        """Show a folder in Explorer. False when it is no longer there."""
        if not path or not os.path.isdir(path):
            return False
        os.startfile(path)  # the path comes from our own scan, not from the page
        return True

    def uninstall(self, appid: int) -> bool:
        """Hand the uninstall to Steam, which shows its own dialog.

        We deliberately do not confirm first (plan.md feature 4): Steam asks,
        and the user can still cancel there.
        """
        os.startfile(f"steam://uninstall/{int(appid)}")
        return True

    def workshop_page(self, itemid: int) -> bool:
        """Open a Workshop item's page in Steam, where Unsubscribe lives.

        Steam has no protocol action that unsubscribes from a single item
        (plan.md §7c), so we take the user to the page that does. The URL is
        built here from the item id: the page never hands os.startfile a URL.
        """
        os.startfile(f"steam://url/CommunityFilePage/{int(itemid)}")
        return True

    def get_settings(self) -> dict[str, Any]:
        return settings.load()

    def set_settings(self, values: dict[str, Any]) -> dict[str, Any]:
        return settings.save(values or {})

    def _on_name_progress(self, done: int, total: int) -> None:
        """Push Workshop name-lookup progress (workshop_names.Progress).

        It shares the status bar with the accurate scan's progress: the two
        never run at the same time, the names being looked up last.
        """
        self._on_scan_progress(done, total, "Workshop item names")

    def _on_scan_progress(self, done: int, total: int, name: str) -> None:
        """Push accurate-scan progress to the UI (measure.ScanProgress)."""
        if self._window is None:
            return
        now = time.monotonic()
        last = done == total
        if not last and now - self._last_progress < PROGRESS_INTERVAL_S:
            return
        self._last_progress = now
        # json.dumps: game names hold quotes, backslashes and non-ASCII.
        self._window.evaluate_js(
            f"window.sdScanProgress && window.sdScanProgress("
            f"{int(done)}, {int(total)}, {json.dumps(name)})"
        )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SteamDirStats desktop app")
    parser.add_argument(
        "--dev",
        action="store_true",
        help=f"load the Vite dev server ({DEV_SERVER_URL}) and enable devtools",
    )
    parser.add_argument("--steam-path", help="Steam folder (default: auto-detect)")
    return parser.parse_args(argv)


def ui_url(dev: bool) -> str:
    """Where the window loads its HTML from."""
    if dev:
        return DEV_SERVER_URL
    index = resource_path("ui", "dist", "index.html")
    if not os.path.exists(index):
        raise SystemExit(f"UI not built: {index} is missing. Run `npm run build` in ui/.")
    return index


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    api = Api(steam_path=args.steam_path)
    width, height = WINDOW_SIZE
    
    # Set directly rather than through a setter: any public method on Api is
    # also callable from the page.
    api._window = webview.create_window(
        WINDOW_TITLE,
        ui_url(args.dev),
        js_api=api,
        width=width,
        height=height,
        min_size=WINDOW_MIN_SIZE,
        # Matches the UI's dark surface, so there is no white flash on startup.
        background_color="#1e2126",
    )

    # debug enables devtools without popping them open with the window (use F12)
    webview.settings["OPEN_DEVTOOLS_IN_DEBUG"] = False

    # Devtools keep their layout and preferences in the WebView2 profile, which
    # pywebview deletes after each run unless private mode is off. Keep a profile
    # in development so devtools stay as they were left; release runs stay
    # private, so nothing of the user's browsing is left behind.
    private_mode = not args.dev

    # gui is explicit so a missing WebView2 runtime fails loudly
    webview.start(
        gui="edgechromium",
        debug=args.dev,
        private_mode=private_mode,
        storage_path=None if private_mode else DEV_PROFILE_PATH,
    )


if __name__ == "__main__":
    main()
