"""Data classes returned by the scanner. Sizes are in bytes."""

from __future__ import annotations

from dataclasses import dataclass, field

# appmanifest StateFlags bit meaning the game is fully installed.
STATE_FULLY_INSTALLED = 4


@dataclass
class Game:
    appid: int
    name: str
    install_dir: str  # folder name under steamapps/common
    install_path: str  # full path to the game folder
    size_on_disk: int  # from the manifest's SizeOnDisk
    state_flags: int = 0
    last_updated: int | None = None  # Unix timestamp

    @property
    def fully_installed(self) -> bool:
        return bool(self.state_flags & STATE_FULLY_INSTALLED)

    def to_dict(self) -> dict:
        return {
            "appid": self.appid,
            "name": self.name,
            "install_dir": self.install_dir,
            "install_path": self.install_path,
            "size_on_disk": self.size_on_disk,
            "state_flags": self.state_flags,
            "fully_installed": self.fully_installed,
            "last_updated": self.last_updated,
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
        return sum(g.size_on_disk for g in self.games)

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "label": self.label,
            "available": self.available,
            "disk_total": self.disk_total,
            "disk_free": self.disk_free,
            "size_on_disk": self.size_on_disk,
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

    def to_dict(self) -> dict:
        return {
            "steam_path": self.steam_path,
            "size_on_disk": self.size_on_disk,
            "libraries": [lib.to_dict() for lib in self.libraries],
        }
