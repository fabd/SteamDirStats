"""Read installed games from a library's appmanifest_<appid>.acf files."""

from __future__ import annotations

import os

from . import vdf
from .models import Game, Library
from .workshop import WorkshopApp


def read_games(
    library: Library,
    app_names: dict[int, str] | None = None,
    workshop: dict[int, WorkshopApp] | None = None,
) -> list[Game]:
    """Return the games installed in `library`, largest first.

    `app_names` maps appid to name (from Steam's appinfo cache) and is used for
    manifests that only hold a placeholder name. `workshop` maps appid to the
    Workshop content installed for it in this library.
    """
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
            game = read_manifest(entry.path, steamapps, app_names)
            if game:
                _attach_workshop(game, workshop)
                games.append(game)

    games.sort(key=lambda g: (-g.total_size, g.name.lower()))
    return games


def read_manifest(
    manifest_path: str, steamapps: str, app_names: dict[int, str] | None = None
) -> Game | None:
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
        name=_game_name(appid, state.get("name"), install_dir, app_names),
        install_dir=install_dir,
        install_path=os.path.join(steamapps, "common", install_dir) if install_dir else "",
        size_on_disk=_to_int(state.get("sizeondisk")) or 0,
        state_flags=_to_int(state.get("stateflags")) or 0,
        last_updated=_to_int(state.get("lastupdated")),
    )


def _attach_workshop(game: Game, workshop: dict[int, WorkshopApp] | None) -> None:
    app = (workshop or {}).get(game.appid)
    if app:
        game.workshop_size = app.size
        game.workshop_items = app.items


def _game_name(
    appid: int, manifest_name, install_dir: str, app_names: dict[int, str] | None
) -> str:
    """Pick the best name available for a game.

    Steam writes a placeholder (`appid_823910`) when it installs a game whose
    name it does not know yet, and shows the real name from its appinfo cache
    instead; do the same, then fall back to the install folder.
    """
    name = manifest_name if isinstance(manifest_name, str) else ""
    if not name or name == f"appid_{appid}":
        name = (app_names or {}).get(appid) or install_dir or f"App {appid}"
    return name


def _to_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
