"""Entry point for gathering Steam data. This is what the CLI and the UI call."""

from __future__ import annotations

from .accounts import find_account, read_play_stats
from .appinfo import read_names
from .games import read_games
from .libraries import read_libraries
from .locate import find_steam_path
from .models import SteamData
from .workshop import read_library_workshop
from .workshop_names import NameStats, Progress, resolve_names


def scan(
    steam_path: str | None = None,
    workshop_names: bool = False,
    offline: bool = False,
    progress: Progress | None = None,
) -> SteamData:
    """Find Steam, list its libraries and the games installed in each.

    Fast mode: sizes come from the manifests' SizeOnDisk (no folder walking).
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

    data = SteamData(steam_path=path, libraries=libraries, account=find_account(path))
    _attach_play_stats(data)
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
