"""Entry point for gathering Steam data. This is what the CLI and the UI call."""

from __future__ import annotations

from .appinfo import read_names
from .games import read_games
from .libraries import read_libraries
from .locate import find_steam_path
from .models import SteamData
from .workshop import read_library_workshop


def scan(steam_path: str | None = None) -> SteamData:
    """Find Steam, list its libraries and the games installed in each.

    Fast mode: sizes come from the manifests' SizeOnDisk (no folder walking).
    Each game's size is its game files plus its Workshop content.
    Raises locate.SteamNotFoundError if Steam cannot be found.
    """
    path = find_steam_path(steam_path)
    libraries = read_libraries(path)
    app_names = read_names(path)
    for library in libraries:
        workshop = read_library_workshop(library.path) if library.available else {}
        library.games = read_games(library, app_names, workshop)
    return SteamData(steam_path=path, libraries=libraries)
