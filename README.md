# SteamDirStats

A WinDirStat-style view of the disk space used by installed Steam games, across all Steam libraries. See [plan.md](plan.md) for the full plan.

## Phase one: command-line scanner

Requires Python 3.10+ on Windows. No third-party packages.

```bash
python -m steamdirstats                     # auto-detect Steam, list games by library
python -m steamdirstats --json              # same data as JSON
python -m steamdirstats --steam-path "D:/Steam"
python -m unittest                          # run the tests
```

From other Python code:

```python
from steamdirstats import scan

data = scan()
for library in data.libraries:
    print(library.path, library.size_on_disk)
    for game in library.games:
        print("  ", game.name, game.size_on_disk)
```
