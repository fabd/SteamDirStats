r"""Where the app keeps its own files (settings, caches).

The app is portable: files live next to the executable when that folder is
writable, and in %APPDATA%\SteamDirStats otherwise (e.g. an exe dropped in
C:\Program Files). See plan.md section 9.
"""

from __future__ import annotations

import os
import sys

APP_NAME = "SteamDirStats"


def app_folder() -> str:
    """The folder the app was started from.

    Packaged with PyInstaller --onefile, `__file__` points at a temporary
    unpack folder that is deleted on exit, so use sys.executable instead.
    """
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def data_file(name: str) -> str:
    """Full path for one of our own files, next to the app if possible.

    An existing file next to the app wins, then the app folder if it is
    writable, then %APPDATA%.
    """
    local = os.path.join(app_folder(), name)
    if os.path.exists(local) or _writable(app_folder()):
        return local
    return os.path.join(_appdata_folder(), name)


def _writable(folder: str) -> bool:
    return os.path.isdir(folder) and os.access(folder, os.W_OK)


def _appdata_folder() -> str:
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    folder = os.path.join(base, APP_NAME)
    try:
        os.makedirs(folder, exist_ok=True)
    except OSError:
        pass
    return folder
