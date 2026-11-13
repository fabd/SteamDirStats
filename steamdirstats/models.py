"""Data classes returned by the scanner. Sizes are in bytes."""

from __future__ import annotations

from dataclasses import dataclass, field

# appmanifest StateFlags bit meaning the game is fully installed.
STATE_FULLY_INSTALLED = 4


@dataclass
class WorkshopItem:
    """One subscribed Workshop item installed for a game."""

    itemid: int
    size: int
    path: str  # full path to the item folder
    time_updated: int | None = None  # Unix timestamp
    name: str | None = None  # not stored locally; resolved from the Steam web API

    @property
    def url(self) -> str:
        return f"https://steamcommunity.com/sharedfiles/filedetails/?id={self.itemid}"

    @property
    def display_name(self) -> str:
        return self.name or str(self.itemid)

    def to_dict(self) -> dict:
        return {
            "itemid": self.itemid,
            "size": self.size,
            "path": self.path,
            "time_updated": self.time_updated,
            "name": self.name,
            "url": self.url,
        }


@dataclass
class Game:
    appid: int
    name: str
    install_dir: str  # folder name under steamapps/common
    install_path: str  # full path to the game folder
    size_on_disk: int  # game files, from the manifest's SizeOnDisk
    state_flags: int = 0
    last_updated: int | None = None  # Unix timestamp
    workshop_size: int = 0  # Workshop content, which SizeOnDisk excludes
    workshop_items: list[WorkshopItem] = field(default_factory=list)

    @property
    def fully_installed(self) -> bool:
        return bool(self.state_flags & STATE_FULLY_INSTALLED)

    @property
    def total_size(self) -> int:
        """Game files plus Workshop content: what Steam's Storage Manager shows."""
        return self.size_on_disk + self.workshop_size

    def to_dict(self) -> dict:
        return {
            "appid": self.appid,
            "name": self.name,
            "install_dir": self.install_dir,
            "install_path": self.install_path,
            "size_on_disk": self.size_on_disk,
            "workshop_size": self.workshop_size,
            "total_size": self.total_size,
            "state_flags": self.state_flags,
            "fully_installed": self.fully_installed,
            "last_updated": self.last_updated,
            "workshop_items": [item.to_dict() for item in self.workshop_items],
        }


@dataclass
class Library:
    path: str
    label: str = ""
    available: bool = True  # False if the folder is missing (e.g. drive unplugged)
    disk_total: int | None = None
    disk_free: int | None = None
    games: list[Game] = field(default_factory=list)

    @property
    def size_on_disk(self) -> int:
        """Total for the library: game files plus Workshop content."""
        return sum(g.total_size for g in self.games)

    @property
    def workshop_size(self) -> int:
        return sum(g.workshop_size for g in self.games)

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "label": self.label,
            "available": self.available,
            "disk_total": self.disk_total,
            "disk_free": self.disk_free,
            "size_on_disk": self.size_on_disk,
            "workshop_size": self.workshop_size,
            "games": [g.to_dict() for g in self.games],
        }


@dataclass
class SteamData:
    steam_path: str
    libraries: list[Library] = field(default_factory=list)

    @property
    def games(self) -> list[Game]:
        return [g for lib in self.libraries for g in lib.games]

    @property
    def size_on_disk(self) -> int:
        return sum(lib.size_on_disk for lib in self.libraries)

    @property
    def workshop_size(self) -> int:
        return sum(lib.workshop_size for lib in self.libraries)

    def to_dict(self) -> dict:
        return {
            "steam_path": self.steam_path,
            "size_on_disk": self.size_on_disk,
            "workshop_size": self.workshop_size,
            "libraries": [lib.to_dict() for lib in self.libraries],
        }
