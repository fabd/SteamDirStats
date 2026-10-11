"""Entry point for gathering Steam data. This is what the CLI and the UI call."""

from __future__ import annotations

from .games import read_games
from .libraries import read_libraries
from .locate import find_steam_path
from .models import SteamData


def scan(steam_path: str | None = None) -> SteamData:
    """Find Steam, list its libraries and the games installed in each.

    Fast mode: sizes come from the manifests' SizeOnDisk (no folder walking).
    Raises locate.SteamNotFoundError if Steam cannot be found.
    """
    path = find_steam_path(steam_path)
    libraries = read_libraries(path)
    for library in libraries:
        library.games = read_games(library)
    return SteamData(steam_path=path, libraries=libraries)
