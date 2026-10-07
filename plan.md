# SteamDirStats — Plan

A WinDirStat-style desktop app that shows, as a treemap, how much disk space each installed Steam game takes, across all Steam libraries.

## Scope

- **Target OS:** Windows only (10/11).
- **Tech stack:** Python + **pywebview** (native window rendering HTML/JS/CSS via Edge WebView2); UI built with **Vue 3 + Vite**.
- **Distribution:** single portable `SteamDirStats.exe` built with PyInstaller (no installer; settings stored next to the exe).
- **Dev environment:** Windows Python from python.org, driven from Git Bash (no WSL needed).

## Architecture

```
steam_scan.py   Pure Python, no UI: locate Steam, parse VDF/ACF, measure sizes, return data
app.py          Glue: creates the pywebview window, exposes the API, settings, window state
ui/             Vue 3 + Vite project (package.json, src/, vite.config.js)
ui/dist/        Production build output, loaded by pywebview and bundled by PyInstaller
```

- **Dev:** run `npm run dev` in `ui/`, then `python app.py --dev` points pywebview at the Vite dev server (`http://localhost:5173`) for hot reload.
- **Release:** `npm run build` produces static files in `ui/dist/`; pywebview loads `ui/dist/index.html`. End users never need Node.

- **JS → Python:** `await window.pywebview.api.<method>(...)` (returns a Promise, JSON-serialised automatically).
- **Python → JS:** `window.evaluate_js(...)` for push updates (e.g. scan progress).
- The UI only depends on a small API (`scan()`, `open_folder()`, …), so the backend could later be swapped (e.g. Tauri) without rewriting the UI.

## General features

User-facing features, in plain terms. Implementation details are in the functional requirements below.

1. **Combined default view.** On launch, the treemap shows every installed game from all libraries together in one view, sized by disk space.
2. **One colour per library.** Each library gets its own distinct colour, so the space taken by each library is visible at a glance. A legend maps each colour to its library (path/drive and total size).
3. **Grouped or mixed layout (toggle).** Default is **grouped**: each library's games form one contiguous block, so the block's area shows that library's share. A toggle switches to **mixed**: all games laid out by size regardless of library, which makes the biggest games easier to compare. Tile areas are exact in both layouts. The choice is remembered in settings.

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
- Squarified treemap. Default view: all games from all libraries combined, grouped by library with a toggle for mixed (see General features 1–3); drill down game → category (→ Workshop item).
- Colour: by library in the combined view (fixed colour per library, stable across rescans); by category (game / Workshop / shader cache) inside a game. Hover tooltip with name, size, library, path, appid.
- Legend + a sortable table view as an alternative to the treemap.
- Actions on a game:
  - **Open folder** (Explorer, via Python `os.startfile`).
  - **Uninstall** via `steam://uninstall/<appid>`.
- Rescan button; fast/accurate toggle.

### 7b. GUI implementation (Vue 3 + Vite)
- **Shared state:** a single store (Pinia, or a plain `reactive()` module) holds scan results, current drill-down path, selection, and scan progress. All views read from it, so selecting a tile highlights the table row and vice versa.
- **Components (initial):**
  - `Toolbar.vue`: rescan, fast/accurate toggle, grouped/mixed layout toggle, settings.
  - `Breadcrumb.vue`: All libraries → library → game → Workshop.
  - `Treemap.vue`: layout via `d3-hierarchy` (squarified), rendered on **Canvas** (handles thousands of Workshop tiles; allows WinDirStat-style cushion shading later). Hover tooltip, click to select, double-click to drill down.
  - `GameTable.vue`: plain `<table>` with sortable columns (name, size, category breakdown, library). Virtualisation only if needed (TanStack Table as an option).
  - `StatusBar.vue`: totals, scan progress.
  - Dialogs (`SettingsDialog.vue`, uninstall confirmation, about) built on native `<dialog>` / `showModal()`.
- **Native HTML/CSS first:** `<dialog>`, the `popover` attribute for menus, CSS grid for layout (toolbar / resizable treemap–table split / status bar). No UI component library initially.
- **Python bridge:** wrap `window.pywebview.api` calls in one `api.js` module; wait for the `pywebviewready` event before the first call. Progress pushed from Python via `evaluate_js` updates the store.

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

Prerequisites: Python 3.12+ and Node.js LTS on Windows; Git Bash as the shell.

```bash
# one-time setup
python -m venv .venv
source .venv/Scripts/activate          # Git Bash on Windows
pip install pywebview pyinstaller
(cd ui && npm install)

# development (two terminals)
cd ui && npm run dev                   # Vite dev server with hot reload
python app.py --dev                    # pywebview window pointed at the dev server

# release exe
(cd ui && npm run build)               # -> ui/dist/
pyinstaller --onefile --windowed --add-data "ui/dist;ui/dist" --icon app.ico app.py
```

## Milestones

1. `steam_scan.py`: locate Steam, parse libraries and manifests, fast mode; CLI output for testing against a real install.
2. Vue 3 + Vite scaffold in `ui/`, pywebview window (dev + dist modes), basic Canvas treemap (library → game) and game table sharing one store.
3. Category split (game / Workshop / shader cache) and accurate mode with progress.
4. Workshop drill-down with item name lookup + cache.
5. Actions (open folder, uninstall), table view, portable settings + window state persistence.
6. PyInstaller build.
