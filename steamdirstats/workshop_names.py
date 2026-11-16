"""Resolve Workshop item names through Steam's public web API, with a cache.

Item names are not stored on disk, only numeric IDs, so the only way to show
them is to ask Steam: ISteamRemoteStorage/GetPublishedFileDetails, which needs
no API key. Answers are cached in the app folder, so the names are fetched once
and later scans are offline and instant.

Items the API will not describe (unlisted, private, or removed) can still have
a name in their own folder, which is where Steam gets the names it shows for
them, so that is tried last.

Nothing here raises: a machine with no network, or an item with no name
anywhere, simply ends up without a name, and WorkshopItem falls back to showing
the ID plus a link to the Steam Community page.
"""

from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Callable, Iterable

from .appdir import data_file
from .models import WorkshopItem
from .workshop import local_title

API_URL = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/"
CACHE_FILE = "workshop-names.json"
CACHE_VERSION = 1

BATCH_SIZE = 100  # IDs per request
TIMEOUT = 10.0  # seconds per request
MAX_FAILURES = 2  # consecutive request failures before giving up
MISS_TTL = 7 * 24 * 3600  # retry items the API did not know after a week

# Progress callback: (items resolved so far, items to resolve)
Progress = Callable[[int, int], None]


@dataclass
class NameStats:
    """What one resolve_names() call did, for a line in the report."""

    cached: int = 0  # names that were already in the cache
    fetched: int = 0  # names the API gave us
    local: int = 0  # names read from the item's own folder
    unavailable: int = 0  # items with no name anywhere
    failed: int = 0  # items we could not ask about (no network, API error)

    @property
    def requested(self) -> int:
        return self.fetched + self.local + self.unavailable + self.failed


def resolve_names(
    items: Iterable[WorkshopItem],
    offline: bool = False,
    progress: Progress | None = None,
    cache_path: str | None = None,
) -> NameStats:
    """Fill in `name` on every item: from the cache, the API, then the item folder.

    `offline` skips the API; the cache and the item folders still work. The same
    item can be installed in several libraries, so items are grouped by ID and
    each ID is asked about once.
    """
    by_id: dict[int, list[WorkshopItem]] = {}
    for item in items:
        by_id.setdefault(item.itemid, []).append(item)

    cache = NameCache(cache_path)
    cached, missing = set(), []
    for itemid, group in by_id.items():
        known, name = cache.get(itemid)
        if known and name:
            cached.add(itemid)
            _set_name(group, name)
        elif not known:
            missing.append(itemid)

    fetched: set[int] = set()
    unanswered = set(missing)  # no answer from the API: offline, or out of reach
    if missing and not offline:
        _fetch_missing(missing, by_id, cache, fetched, unanswered, progress)
        cache.save()

    # Items the API will not describe can still name themselves on disk.
    local = set()
    for itemid, group in by_id.items():
        if group[0].name:
            continue
        name = local_title(group[0].path)
        if name:
            _set_name(group, name)
            local.add(itemid)

    stats = NameStats(
        cached=len(cached),
        fetched=len(fetched),
        local=len(local),
        failed=len(unanswered - local),
    )
    stats.unavailable = len(by_id) - stats.cached - stats.fetched - stats.local - stats.failed
    return stats


def _fetch_missing(
    missing: list[int],
    by_id: dict[int, list[WorkshopItem]],
    cache: NameCache,
    fetched: set[int],
    unanswered: set[int],
    progress: Progress | None,
) -> None:
    """Ask the API about the items the cache does not cover, a batch per request."""
    failures = 0
    done = 0
    if progress:
        progress(0, len(missing))
    for batch in _batches(missing, BATCH_SIZE):
        names = _fetch_names(batch)
        if names is None:
            failures += 1
            if failures >= MAX_FAILURES:
                # Something is wrong with the network; do not sit through the rest.
                break
            continue
        failures = 0
        for itemid in batch:
            name = names.get(itemid)
            cache.set(itemid, name)
            unanswered.discard(itemid)
            if name:
                fetched.add(itemid)
                _set_name(by_id[itemid], name)
        done += len(batch)
        if progress:
            progress(done, len(missing))


def _set_name(items: list[WorkshopItem], name: str) -> None:
    for item in items:
        item.name = name


def _batches(values: list[int], size: int) -> Iterable[list[int]]:
    """Split the IDs into one list per request."""
    for start in range(0, len(values), size):
        yield values[start : start + size]


def _fetch_names(itemids: list[int]) -> dict[int, str | None] | None:
    """Ask the API about one batch. Returns None if the request itself failed.

    An item in the answer with no title (deleted, private, or the wrong kind of
    published file) maps to None: a definite "no name", which we cache.
    """
    payload = {"itemcount": len(itemids)}
    for index, itemid in enumerate(itemids):
        payload[f"publishedfileids[{index}]"] = itemid
    request = urllib.request.Request(
        API_URL,
        data=urllib.parse.urlencode(payload).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            answer = json.load(response)
    except Exception:  # network, HTTP, timeout, malformed JSON
        return None

    details = answer.get("response", {}).get("publishedfiledetails")
    if not isinstance(details, list):
        return None

    names: dict[int, str | None] = {itemid: None for itemid in itemids}
    for detail in details:
        if not isinstance(detail, dict):
            continue
        try:
            itemid = int(detail.get("publishedfileid"))
        except (TypeError, ValueError):
            continue
        title = detail.get("title")
        names[itemid] = title if isinstance(title, str) and title else None
    return names


class NameCache:
    """`{itemid: name}` on disk, remembering misses too so we stop asking."""

    def __init__(self, path: str | None = None):
        self.path = path or data_file(CACHE_FILE)
        self.entries = self._load()
        self.dirty = False

    def get(self, itemid: int) -> tuple[bool, str | None]:
        """Return (is the answer known, the name) for an item."""
        entry = self.entries.get(str(itemid))
        if not isinstance(entry, dict):
            return False, None
        name = entry.get("name")
        if name:
            return True, str(name)
        # A miss: ask again once it is stale, in case the item came back.
        fetched = entry.get("fetched")
        if isinstance(fetched, (int, float)) and time.time() - fetched < MISS_TTL:
            return True, None
        return False, None

    def set(self, itemid: int, name: str | None) -> None:
        self.entries[str(itemid)] = {"name": name, "fetched": int(time.time())}
        self.dirty = True

    def save(self) -> bool:
        """Write the cache. Returns False if it could not be written."""
        if not self.dirty:
            return True
        document = {"version": CACHE_VERSION, "items": self.entries}
        try:
            temp = self.path + ".tmp"
            with open(temp, "w", encoding="utf-8") as handle:
                json.dump(document, handle, indent=1, ensure_ascii=False)
            os.replace(temp, self.path)
        except OSError:
            return False
        self.dirty = False
        return True

    def _load(self) -> dict:
        try:
            with open(self.path, encoding="utf-8") as handle:
                document = json.load(handle)
        except (OSError, ValueError):
            return {}
        if not isinstance(document, dict) or document.get("version") != CACHE_VERSION:
            return {}
        items = document.get("items")
        return items if isinstance(items, dict) else {}
