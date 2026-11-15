"""The app's own preferences, stored portably in settings.json.

Where the file lives is appdir's problem (next to the exe when that folder is
writable, %APPDATA% otherwise); this module only reads and writes it. See
plan.md section 9.

Values are whatever the UI puts there. The defaults below are the ones the Vue
store falls back to, kept in step with ui/src/stores/settings-store.ts.
"""

from __future__ import annotations

import json
import os
from typing import Any

from steamdirstats.appdir import data_file

FILENAME = "settings.json"

DEFAULTS: dict[str, Any] = {
    "layout": "grouped",  # "grouped" or "mixed"
    "accurate": False,  # walk the folders instead of trusting the manifests
}


def path() -> str:
    return data_file(FILENAME)


def load() -> dict[str, Any]:
    """Everything we have stored, with the defaults filled in.

    A missing, unreadable or corrupt file is not worth an error: the app is
    perfectly usable with the defaults.
    """
    values = dict(DEFAULTS)
    try:
        with open(path(), encoding="utf-8") as handle:
            stored = json.load(handle)
    except (OSError, ValueError):
        return values
    if isinstance(stored, dict):
        values.update(stored)
    return values


def save(values: dict[str, Any]) -> dict[str, Any]:
    """Merge `values` into the stored settings and write them back.

    Merging rather than replacing: the window placement (section 8) writes its
    own keys, and the UI must not wipe them by saving a toggle.
    """
    merged = load()
    merged.update(values)
    try:
        with open(path(), "w", encoding="utf-8") as handle:
            json.dump(merged, handle, indent=2)
    except OSError:
        # Read-only folder: the values still apply for this session.
        pass
    return merged
