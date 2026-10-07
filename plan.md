# SteamDirStats — Plan

A WinDirStat-style desktop app that shows, as a treemap, how much disk space each installed Steam game takes, across all Steam libraries.

## Scope

- **Target OS:** Windows only (10/11).
- **Tech stack:** Python + **pywebview** (native window rendering HTML/JS/CSS via Edge WebView2).
- **Distribution:** single portable `SteamDirStats.exe` built with PyInstaller (no installer; settings stored next to the exe).
- **Dev environment:** Windows Python from python.org, driven from Git Bash (no WSL needed).

## Architecture

```
steam_scan.py   Pure Python, no UI: locate Steam, parse VDF/ACF, measure sizes, return data
app.py          ~30 lines of glue: creates the pywebview window, exposes the API, window state
ui/             index.html + JS + CSS: treemap, tooltips, controls
```

- **JS → Python:** `await window.pywebview.api.<method>(...)` (returns a Promise, JSON-serialised automatically).
- **Python → JS:** `window.evaluate_js(...)` for push updates (e.g. scan progress).
- The UI only depends on a small API (`scan()`, `open_folder()`, …), so the backend could later be swapped (e.g. Tauri) without rewriting the UI.

## Functional requirements

### 1. Locate Steam
- Registry `HKCU\Software\Valve\Steam\SteamPath`.
- Fallback: `C:\Program Files (x86)\Steam`.

### 2. Find all libraries
- Parse `<Steam>/steamapps/libraryfolders.vdf` → every library `path` (plus its `apps` map of appid → size).
- Library paths contain escaped backslashes (`D:\\SteamLibrary`).
- Use a tolerant VDF parser (format has varied over the years).

### 3. Find each installed game
- Each library's `steamapps/appmanifest_<appid>.acf` → `name`, `installdir` (under `steamapps/common/`), `SizeOnDisk` (bytes).

### 4. Size categories per game
Each game's total is split into categories:

| Category | Location (per library) | Fast mode source |
|---|---|---|
| Game files | `common/<installdir>/` | `appmanifest_<appid>.acf` → `SizeOnDisk` |
| Workshop | `workshop/content/<appid>/<itemid>/` | `workshop/appworkshop_<appid>.acf` → `SizeOnDisk` and per-item `size` in `WorkshopItemsInstalled` |
| Shader cache | `shadercache/<appid>/` | disk scan only |
| Pending (optional) | `downloading/<appid>/`, `temp/<appid>/` | disk scan only |

- The game's `SizeOnDisk` excludes Workshop content, so the two add cleanly.
- Workshop content lives in the same library as its game.

### 5. Two scan modes
- **Fast:** manifests only (near-instant).
- **Accurate:** walk the real folders (manifest sizes can be stale and omit related data). Show progress in the UI.

### 6. Workshop details
- Drill down into a game's Workshop area to see individual items.
- Item names are not stored locally (only numeric IDs). Resolve names via Steam's public `ISteamRemoteStorage/GetPublishedFileDetails` web API (no key required) and cache them; fall back to the ID plus a link to `https://steamcommunity.com/sharedfiles/filedetails/?id=<itemid>`.
- Known limitation: mods installed outside the Workshop (Nexus, manual, mod managers) count as "Game files"; games that copy Workshop items elsewhere (e.g. Documents) are not detected.

### 7. Treemap UI
- Squarified treemap, grouped by library/drive → game → category (→ Workshop item).
- Colour by category; hover tooltip with name, size, path, appid.
- Legend + a sortable table view as an alternative to the treemap.
- Actions on a game:
  - **Open folder** (Explorer, via Python `os.startfile`).
  - **Uninstall** via `steam://uninstall/<appid>`.
- Rescan button; fast/accurate toggle.

### 8. Window state persistence
- Remember window position, size, and maximized state between runs.
- Use the Win32 `GetWindowPlacement` / `SetWindowPlacement` (via `ctypes`, using the window handle): handles the restored size while maximized, ignores minimized state, and pulls off-screen windows (unplugged monitor) back onto a visible screen.
- Store in `settings.json` (see §9) along with other preferences (e.g. last scan mode).
- Verify behaviour with display scaling (125%/150%).

### 9. Portable settings location
The app is portable: settings live next to the executable by default.
- **App folder:**
  - Packaged exe: the folder of `sys.executable`. With PyInstaller `--onefile`, `__file__` points to a temporary unpack folder that is deleted on exit, so it must not be used.
  - Development (`python app.py`): the project folder (folder of `app.py`).
  - Detect packaged mode with `getattr(sys, "frozen", False)`.
- **Resolution order:**
  1. If `settings.json` already exists in the app folder, use it.
  2. Else, if the app folder is writable, create it there.
  3. Otherwise (e.g. exe placed in `C:\Program Files\`) fall back to `%APPDATA%\SteamDirStats\settings.json`.
- The Workshop item-name cache follows the same location.

## Known caveats

- Non-Steam shortcuts are not in the manifests (out of scope).
- Exact on-disk size (cluster size, NTFS compression, hard links) only matters for high accuracy; logical file sizes are fine for v1.
- Unsigned PyInstaller exes can trigger antivirus false positives; `--onedir` or code signing mitigates.

## Build & run

```bash
python -m venv .venv
source .venv/Scripts/activate          # Git Bash on Windows
pip install pywebview pyinstaller
python app.py                          # development
pyinstaller --onefile --windowed --add-data "ui;ui" --icon app.ico app.py   # release exe
```

## Milestones

1. `steam_scan.py`: locate Steam, parse libraries and manifests, fast mode; CLI output for testing against a real install.
2. pywebview window with a basic treemap (library → game).
3. Category split (game / Workshop / shader cache) and accurate mode with progress.
4. Workshop drill-down with item name lookup + cache.
5. Actions (open folder, uninstall), table view, portable settings + window state persistence.
6. PyInstaller build.
