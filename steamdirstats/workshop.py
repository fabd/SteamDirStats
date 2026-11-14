"""Read installed Workshop content from a library's appworkshop_<appid>.acf files.

Workshop content lives in the same library as the game it belongs to, under
`steamapps/workshop/`, and the game's own `SizeOnDisk` does not include it.
The manifests hold numeric item IDs, not names; some item folders do carry a
name of their own (see `local_title`), but the general case needs the web API
in `workshop_names.py`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from . import vdf
from .models import WorkshopItem


@dataclass
class WorkshopApp:
    """The Workshop content installed for one game."""

    appid: int
    size: int = 0
    items: list[WorkshopItem] = field(default_factory=list)


def read_library_workshop(library_path: str) -> dict[int, WorkshopApp]:
    """Return {appid: WorkshopApp} for every appworkshop manifest in a library."""
    workshop_dir = os.path.join(library_path, "steamapps", "workshop")
    try:
        entries = list(os.scandir(workshop_dir))
    except OSError:
        return {}

    apps = {}
    for entry in entries:
        name = entry.name.lower()
        if name.startswith("appworkshop_") and name.endswith(".acf"):
            app = read_manifest(entry.path, workshop_dir)
            if app:
                apps[app.appid] = app
    return apps


def read_manifest(manifest_path: str, workshop_dir: str) -> WorkshopApp | None:
    """Parse one appworkshop file. Returns None if it is unreadable or invalid."""
    try:
        state = vdf.load(manifest_path).get("appworkshop")
    except OSError:
        return None
    if not isinstance(state, dict):
        return None

    appid = _to_int(state.get("appid"))
    if appid is None:
        return None

    installed = state.get("workshopitemsinstalled")
    items = []
    if isinstance(installed, dict):
        for itemid, details in installed.items():
            item = _read_item(itemid, details, workshop_dir, appid)
            if item:
                items.append(item)
    items.sort(key=lambda i: (-i.size, i.itemid))

    # SizeOnDisk is the whole app's Workshop folder; on a healthy manifest it
    # equals the sum of the item sizes, so either one works as the total.
    size = _to_int(state.get("sizeondisk"))
    if size is None:
        size = sum(item.size for item in items)
    return WorkshopApp(appid=appid, size=size, items=items)


def _read_item(itemid, details, workshop_dir: str, appid: int) -> WorkshopItem | None:
    item_id = _to_int(itemid)
    if item_id is None or not isinstance(details, dict):
        return None
    return WorkshopItem(
        itemid=item_id,
        size=_to_int(details.get("size")) or 0,
        path=os.path.join(workshop_dir, "content", str(appid), str(item_id)),
        time_updated=_to_int(details.get("timeupdated")),
    )


def local_title(item_path: str) -> str | None:
    """The title stored in an item folder, if the item has one.

    Items published with the Source 2 tools (Half-Life: Alyx, SteamVR Home, ...)
    keep a `publish_data.txt` next to their files holding the title as it was
    published. It is the only local source of item names, and it covers items
    the public web API will not describe, such as unlisted ones.
    """
    try:
        data = vdf.load(os.path.join(item_path, "publish_data.txt")).get("publish_data")
    except OSError:
        return None
    if not isinstance(data, dict):
        return None
    title = data.get("title")
    return title if isinstance(title, str) and title else None


def _to_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
