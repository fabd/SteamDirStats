# SteamDirStats

A WinDirStat-style view of the disk space used by installed Steam games, across all Steam libraries. See [plan.md](plan.md) for the full plan.

## Setting up

Requires Python 3.10+ and Node.js LTS on Windows. Commands are for Git Bash.

```bash
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
(cd ui && npm install)
```

`requirements.txt` holds `pywebview` (the native window) and `pyinstaller`
(only needed to build the exe). Nothing is installed globally; activate the
venv in each new shell, or call `.venv/Scripts/python.exe` directly.

## The desktop app

```bash
cd ui && npm run dev                 # terminal 1: Vite dev server on :5173
python app.py --dev                  # terminal 2: window pointed at it, devtools on

(cd ui && npm run build)             # build the UI once
python app.py                        # window loading ui/dist/index.html
```

`python app.py --steam-path "D:/Steam"` scans a given folder instead of
auto-detecting. Settings are written to `settings.json` next to the app.

To screenshot what the window is showing (the page, not the window frame),
in two terminals:

```bash
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" .venv/Scripts/python app.py
node tools/shot.mjs window.png       # waits for the window, then writes the PNG
```

Either order works: the script polls for up to 30 seconds. To stay in one
terminal, put the `&` at the end of the app's own line, not mid-command.

## Command-line scanner

The `steamdirstats` package needs no third-party packages, so it runs on a
plain Python too.

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
