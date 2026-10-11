"""Read installed games from a library's appmanifest_<appid>.acf files."""

from __future__ import annotations

import os

from . import vdf
from .models import Game, Library


def read_games(library: Library) -> list[Game]:
    """Return the games installed in `library`, largest first."""
    if not library.available:
        return []

    steamapps = os.path.join(library.path, "steamapps")
    games = []
    try:
        entries = list(os.scandir(steamapps))
    except OSError:
        return []
    for entry in entries:
        name = entry.name.lower()
        if name.startswith("appmanifest_") and name.endswith(".acf"):
            game = read_manifest(entry.path, steamapps)
            if game:
                games.append(game)

    games.sort(key=lambda g: (-g.size_on_disk, g.name.lower()))
    return games


def read_manifest(manifest_path: str, steamapps: str) -> Game | None:
    """Parse one appmanifest file. Returns None if it is unreadable or invalid."""
    try:
        state = vdf.load(manifest_path).get("appstate")
    except OSError:
        return None
    if not isinstance(state, dict):
        return None

    appid = _to_int(state.get("appid"))
    if appid is None:
        return None

    install_dir = state.get("installdir", "")
    return Game(
        appid=appid,
        name=state.get("name") or install_dir or f"App {appid}",
        install_dir=install_dir,
        install_path=os.path.join(steamapps, "common", install_dir) if install_dir else "",
        size_on_disk=_to_int(state.get("sizeondisk")) or 0,
        state_flags=_to_int(state.get("stateflags")) or 0,
        last_updated=_to_int(state.get("lastupdated")),
    )


def _to_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
