"""Find the Steam installation folder on Windows."""

from __future__ import annotations

import os
import sys

DEFAULT_PATHS = [
    r"C:\Program Files (x86)\Steam",
    r"C:\Program Files\Steam",
]

# (hive name, key, value) in the order they are tried.
_REGISTRY_LOCATIONS = [
    ("HKEY_CURRENT_USER", r"Software\Valve\Steam", "SteamPath"),
    ("HKEY_LOCAL_MACHINE", r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
    ("HKEY_LOCAL_MACHINE", r"SOFTWARE\Valve\Steam", "InstallPath"),
]


class SteamNotFoundError(Exception):
    pass


def is_steam_dir(path: str) -> bool:
    return os.path.isdir(os.path.join(path, "steamapps"))


def find_steam_path(override: str | None = None) -> str:
    """Return the Steam folder, or raise SteamNotFoundError.

    If `override` is given it is used as-is (after validation).
    Otherwise: Windows registry, then the default install folders.
    """
    if override:
        path = os.path.normpath(override)
        if not is_steam_dir(path):
            raise SteamNotFoundError(f"Not a Steam folder (no steamapps inside): {path}")
        return path

    for path in _registry_paths() + DEFAULT_PATHS:
        path = os.path.normpath(path)
        if is_steam_dir(path):
            return path

    raise SteamNotFoundError("Could not find Steam. Use --steam-path to point to it.")


def _registry_paths() -> list[str]:
    if sys.platform != "win32":
        return []
    import winreg

    paths = []
    for hive_name, key, value in _REGISTRY_LOCATIONS:
        try:
            with winreg.OpenKey(getattr(winreg, hive_name), key) as k:
                path, _ = winreg.QueryValueEx(k, value)
        except OSError:
            continue
        if path:
            paths.append(path)  # SteamPath uses forward slashes; normpath fixes it
    return paths
