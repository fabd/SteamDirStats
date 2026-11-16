"""Read the list of Steam library folders from libraryfolders.vdf."""

from __future__ import annotations

import os
import shutil

from . import vdf
from .models import Library


def library_folders_file(steam_path: str) -> str | None:
    for rel in ("steamapps/libraryfolders.vdf", "config/libraryfolders.vdf"):
        path = os.path.join(steam_path, *rel.split("/"))
        if os.path.isfile(path):
            return path
    return None


def read_libraries(steam_path: str) -> list[Library]:
    """Return every library, the main Steam folder first.

    Handles both libraryfolders.vdf formats:
      - current: "0" { "path" "D:\\SteamLibrary" "label" "" ... }
      - legacy (before 2021): "1" "D:\\SteamLibrary"
    The legacy format does not list the main Steam folder, so it is always added.
    """
    entries: list[tuple[str, str]] = [(steam_path, "")]

    vdf_path = library_folders_file(steam_path)
    if vdf_path:
        try:
            data = vdf.load(vdf_path)
        except OSError:
            data = {}
        root = data.get("libraryfolders", {})
        for key, value in root.items():
            if not key.isdigit():
                continue  # e.g. "contentstatsid", "timenextstatsreport"
            if isinstance(value, dict):
                path = value.get("path")
                label = value.get("label", "")
            else:
                path, label = value, ""
            if path:
                entries.append((path, label))

    libraries: list[Library] = []
    seen: set[str] = set()
    for path, label in entries:
        path = os.path.normpath(path)
        key = os.path.normcase(path)
        if key in seen:
            continue
        seen.add(key)
        libraries.append(_make_library(path, label))
    return libraries


def _make_library(path: str, label: str) -> Library:
    available = os.path.isdir(os.path.join(path, "steamapps"))
    total = free = None
    if available:
        try:
            usage = shutil.disk_usage(path)
            total, free = usage.total, usage.free
        except OSError:
            pass
    return Library(path=path, label=label, available=available, disk_total=total, disk_free=free)
