r"""Per-account Steam data: which account to use, and its playtime records.

Installed games are shared by every account on the PC, but playtime and
"last played" are stored per account under `<Steam>/userdata/<accountid>/`.
We use the account that signed in most recently (see plan.md section 10);
there is no account picker.

Nothing here is essential: when no account or no record is found, the sizes
are still complete and the playtime fields simply stay None.
"""

from __future__ import annotations

import os

from . import vdf
from .models import Account, PlayStats

# userdata folder name = SteamID64 - this offset (Valve's "individual" base).
#  (1 << 56) | (1 << 52) | (1 << 32)  ==  76561197960265728
STEAMID64_BASE = 76561197960265728

# Steam launched in 2003, so a LastPlayed before that is a placeholder, not a
# date: old entries carry "0" or "86400" (1970-01-02) for "never played".
EARLIEST_PLAUSIBLE_PLAYTIME = 1041379200  # 2003-01-01 UTC


def find_account(steam_path: str) -> Account | None:
    """The account that signed in most recently, or None if there is none.

    Reads `config/loginusers.vdf`. Steam marks the current account with
    "MostRecent" "1", but that key is missing on some installs, so the highest
    "Timestamp" is the fallback. The account is only returned if its userdata
    folder actually exists.
    """
    try:
        users = vdf.load(os.path.join(steam_path, "config", "loginusers.vdf")).get("users")
    except OSError:
        return None
    if not isinstance(users, dict):
        return None

    best = None
    best_key = (0, 0)
    for steamid, details in users.items():
        if not isinstance(details, dict):
            continue
        steamid64 = _to_int(steamid)
        if steamid64 is None or steamid64 <= STEAMID64_BASE:
            continue
        key = (
            1 if str(details.get("mostrecent", "")) == "1" else 0,
            _to_int(details.get("timestamp")) or 0,
        )
        if best is None or key > best_key:
            best, best_key = (steamid64, details), key

    if best is None:
        return None

    steamid64, details = best
    accountid = steamid64 - STEAMID64_BASE
    userdata_path = os.path.join(steam_path, "userdata", str(accountid))
    if not os.path.isdir(userdata_path):
        return None

    return Account(
        steamid64=steamid64,
        accountid=accountid,
        account_name=_to_str(details.get("accountname")),
        persona_name=_to_str(details.get("personaname")),
        userdata_path=userdata_path,
    )


def read_play_stats(account: Account) -> dict[int, PlayStats]:
    """Return {appid: PlayStats} from the account's localconfig.vdf.

    Returns an empty dict if the file is missing or unreadable; Steam rewrites
    it as it runs, so it can briefly be unavailable.
    """
    path = os.path.join(account.userdata_path, "config", "localconfig.vdf")
    try:
        config = vdf.load(path)
    except OSError:
        return {}

    apps = _dig(config, "userlocalconfigstore", "software", "valve", "steam", "apps")
    if not isinstance(apps, dict):
        return {}

    stats = {}
    for appid, details in apps.items():
        app_id = _to_int(appid)
        if app_id is None or not isinstance(details, dict):
            continue
        entry = PlayStats(
            playtime=_to_int(details.get("playtime")),
            playtime_2weeks=_to_int(details.get("playtime2wks")),
            last_played=_last_played(details.get("lastplayed")),
        )
        # Entries that only hold cloud or launch settings say nothing about play.
        if entry.playtime or entry.playtime_2weeks or entry.last_played:
            stats[app_id] = entry
    return stats


def _last_played(value) -> int | None:
    timestamp = _to_int(value)
    if timestamp is None or timestamp < EARLIEST_PLAUSIBLE_PLAYTIME:
        return None
    return timestamp


def _dig(data, *keys):
    """Walk nested dicts, tolerating a missing level (the store key is optional)."""
    for key in keys:
        if not isinstance(data, dict):
            return None
        if key not in data:
            continue  # localconfig has been seen with and without the outer store key
        data = data[key]
    return data


def _to_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_str(value) -> str:
    return value if isinstance(value, str) else ""
