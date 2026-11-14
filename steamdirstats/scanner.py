"""Entry point for gathering Steam data. This is what the CLI and the UI call."""

from __future__ import annotations

import os

from .accounts import find_account, read_play_stats
from .appinfo import read_names
from .games import read_games
from .libraries import read_libraries
from .locate import find_steam_path
from .measure import ScanProgress, folder_size
from .models import Game, SteamData
from .workshop import read_library_workshop
from .workshop_names import NameStats, Progress, resolve_names


def scan(
    steam_path: str | None = None,
    workshop_names: bool = False,
    offline: bool = False,
    progress: Progress | None = None,
    accurate: bool = False,
    scan_progress: ScanProgress | None = None,
) -> SteamData:
    """Find Steam, list its libraries and the games installed in each.

    Fast mode (the default): sizes come from the manifests' SizeOnDisk, which
    is near-instant. With `accurate`, every game and Workshop item folder is
    walked instead, and `scan_progress` is called as each game is measured.
    Each game's size is its game files plus its Workshop content.
    Raises locate.SteamNotFoundError if Steam cannot be found.

    With `workshop_names`, Workshop item names are looked up from the cache and,
    unless `offline`, from Steam's web API for the items the cache is missing.
    The result is in `SteamData.name_stats`.

    Playtime comes from the account that signed in most recently; games with
    no record for that account keep None.
    """
    path = find_steam_path(steam_path)
    libraries = read_libraries(path)
    app_names = read_names(path)
    for library in libraries:
        workshop = read_library_workshop(library.path) if library.available else {}
        library.games = read_games(library, app_names, workshop)

    data = SteamData(
        steam_path=path, libraries=libraries, account=find_account(path), accurate=accurate
    )
    _attach_play_stats(data)
    if accurate:
        _measure_on_disk(data, scan_progress)
    if workshop_names:
        items = [item for game in data.games for item in game.workshop_items]
        data.name_stats = resolve_names(items, offline=offline, progress=progress)
    return data


def _attach_play_stats(data: SteamData) -> None:
    """Copy the account's playtime records onto the games we found."""
    if data.account is None:
        return
    stats = read_play_stats(data.account)
    for game in data.games:
        entry = stats.get(game.appid)
        if entry:
            game.playtime = entry.playtime
            game.playtime_2weeks = entry.playtime_2weeks
            game.last_played = entry.last_played


def _measure_on_disk(data: SteamData, progress: ScanProgress | None) -> None:
    """Replace the manifest sizes with what the folders really hold."""
    games = data.games
    total = len(games)
    measured: dict[str, int | None] = {}
    shared: dict[str, list[Game]] = {}

    for done, game in enumerate(games):
        if progress:
            progress(done, total, game.name)
        key = os.path.normcase(os.path.abspath(game.install_path))
        if key not in measured:
            measured[key] = folder_size(game.install_path)
        shared.setdefault(key, []).append(game)
        _measure_workshop(game)

    for key, group in shared.items():
        size = measured[key]
        # A folder we cannot read keeps its manifest size rather than dropping
        # to zero: that is more likely our problem than a game taking no space.
        if size is not None:
            _share_size(group, size)

    if progress:
        progress(total, total, "")


def _share_size(games: list[Game], size: int) -> None:
    """Give `size` to the games installed in that one folder.

    Some apps share an install folder with another: Skyrim Special Edition and
    its Creation Kit are both in `common/Skyrim Special Edition`. Measuring it
    per game would count those 15 GB twice, so the folder is measured once and
    split in the same proportion as the manifests claimed, which keeps the
    totals right and each game close to the size Steam shows for it.
    """
    if len(games) == 1:
        games[0].size_on_disk = size
        return

    claimed = sum(g.size_on_disk for g in games)
    left = size
    for game in games[:-1]:
        share = size * game.size_on_disk // claimed if claimed else size // len(games)
        game.size_on_disk = share
        left -= share
    games[-1].size_on_disk = left  # the remainder, so the parts add up exactly


def _measure_workshop(game: Game) -> None:
    """Measure the game's Workshop item folders."""
    measured = False
    for item in game.workshop_items:
        size = folder_size(item.path)
        if size is not None:
            item.size = size
            measured = True
    if measured:
        game.workshop_items.sort(key=lambda i: (-i.size, i.itemid))
        # Item folders left behind by an unsubscribed item are not in the
        # manifest and belong to no item, so they stay uncounted (see plan.md).
        game.workshop_size = sum(item.size for item in game.workshop_items)
