# SteamDirStats — Plan

A WinDirStat-style desktop app that shows, as a treemap, how much disk space each installed Steam game takes, across all Steam libraries.

## Scope

- **Target OS:** Windows only (10/11).
- **Tech stack:** Python + **pywebview** (native window rendering HTML/JS/CSS via Edge WebView2); UI built with **Vue 3 + Vite**.
- **Distribution:** single portable `SteamDirStats.exe` built with PyInstaller (no installer; settings stored next to the exe).
- **Dev environment:** Windows Python from python.org, driven from Git Bash (no WSL needed).

## Architecture

```
steamdirstats/  Pure Python package, no UI: locate Steam, parse VDF/ACF, measure sizes, return data
  vdf.py          tolerant text VDF/ACF parser
  appinfo.py      appid → name from the binary appcache/appinfo.vdf (placeholder names)
  locate.py       find the Steam folder (registry, default paths)
  libraries.py    read libraryfolders.vdf (current + legacy formats)
  games.py        read appmanifest_*.acf per library
  models.py       Game / Library / SteamData dataclasses (+ to_dict for JSON)
  scanner.py      scan(): the single entry point used by the CLI and the UI
  workshop.py     read appworkshop_*.acf per library (Workshop totals and items)
  workshop_names.py  Workshop item names from the Steam web API, cached on disk
  appdir.py       where our own files live (app folder, %APPDATA% fallback)
  __main__.py     CLI for testing: python -m steamdirstats [--json] [--no-items] [--steam-path]
tests/          unittest suite using fake Steam folders
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
4. **Right-click menu on a game.** Right-clicking a game tile opens a small context menu with:
   - **Inspect**: opens the drill-down view for that game (feature 5).
   - **Open folder**: opens the game's install folder in Explorer.
   - **Uninstall…**: opens `steam://uninstall/<appid>` directly, with no confirmation dialog of our own. Steam comes to the front (starting first if needed) and shows its own uninstall dialog, where the user can still cancel. The user then clicks **Refresh** (feature 6) to update sizes.
5. **Drill-down view.** *Inspect* replaces the whole treemap with a treemap of that one game, split by category (game files, Workshop), coloured by category, with Workshop items as individual tiles inside the Workshop area. The table shows the same breakdown. Navigate back with the breadcrumb (`All libraries › <Game>`) or **Backspace/Esc**. Double-clicking a game tile is a shortcut for *Inspect*.
6. **Refresh button.** A large Refresh button in the top-right corner of the window rescans all libraries (e.g. after uninstalling a game in Steam). It uses the current fast/accurate mode and always resets the view to the startup view (all libraries combined), clearing any drill-down and selection. This keeps the view valid when the inspected game was just uninstalled.

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
- Some manifests hold a placeholder name (`appid_823910`) because Steam did not know the name when it wrote the manifest. Steam shows the name from its own cache instead, so fall back to `<Steam>/appcache/appinfo.vdf` (binary KeyValues, `common/name`), then to `installdir`.

### 4. Size categories per game

Each game's total is split into categories:

| Category   | Location (per library)               | Fast mode source                                                                                  |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Game files | `common/<installdir>/`               | `appmanifest_<appid>.acf` → `SizeOnDisk`                                                          |
| Workshop   | `workshop/content/<appid>/<itemid>/` | `workshop/appworkshop_<appid>.acf` → `SizeOnDisk` and per-item `size` in `WorkshopItemsInstalled` |

- The game's `SizeOnDisk` excludes Workshop content, so the two add cleanly. On SteamVR: 5.4 GB of game files + 30.3 GB of Workshop = the 35.76 GB Steam's Storage Manager reports.
- Workshop content lives in the same library as its game.
- **Out of scope:** shader cache (`shadercache/<appid>/`) and pending downloads (`downloading/<appid>/`, `temp/<appid>/`). Measured here, the whole shader cache was 1.6 GB across three libraries, too small to be worth a category; Steam does not count it per game either.

### 5. Two scan modes

- **Fast:** manifests only (near-instant). The default.
- **Accurate:** walk the real folders (manifest sizes can be stale and omit related data). Game folders and Workshop item folders are both measured. Progress is reported per game through a callback (`measure.ScanProgress`), which the CLI prints to stderr and the UI will push to the status bar.
- Measured on the dev machine: 1.1 s for 54 games and 496 GB, because only directory metadata is read. Accurate came out ~2 GB above fast, the bulk of it one game whose manifest was stale (Tomb Raider, +1.6 GB).
- **Shared install folders.** Some appids share one folder: Skyrim Special Edition (489830) and its Creation Kit (1946180) are both `common/Skyrim Special Edition`. Measuring per game would count those 15 GB twice, so each folder is walked once and split between its games in the proportion their manifests claimed. Steam does the same thing in effect: it gives the Creation Kit only its own 154 MB.
- A folder that cannot be read (missing, permissions, mid-update) keeps its manifest size rather than dropping to zero. Junctions and symlinks are not followed.

### 6. Workshop details

- Drill down into a game's Workshop area to see individual items.
- Item names are not stored locally (only numeric IDs). Resolve names via Steam's public `ISteamRemoteStorage/GetPublishedFileDetails` web API (no key required) and cache them in `workshop-names.json` next to the settings (§9); fall back to the ID plus a link to `https://steamcommunity.com/sharedfiles/filedetails/?id=<itemid>`.
- Items the API will not describe (unlisted or private, `result` 9) can still name themselves on disk: items published with the Source 2 tools keep a `publish_data.txt` in their folder holding the title. It is tried last, because a title edited after publishing is only up to date in the API's answer. This is where Steam's own names for such items come from.
- Names are looked up automatically for any item the cache does not cover: 100 IDs per POST, 10 s timeout, and the lookup gives up after two failed requests so a machine with no network is not held up. Items the API does not know (deleted or private, `result` 9) are cached as misses and retried after a week. `--offline` skips the network and uses the cache only.
- Known limitation: mods installed outside the Workshop (Nexus, manual, mod managers) count as "Game files"; games that copy Workshop items elsewhere (e.g. Documents) are not detected.
- Some names are unavailable via Steam's public `ISteamRemoteStorage/GetPublishedFileDetails` web API. We COULD scrape the community page title for the misses only. The name is in `<title>` (or the og:title meta) on exactly the URL we already build as the fallback link. It's a handful of requests, cached like the rest. Caveat: the 429s in the transcript came from rapid unauthenticated requests; one request at a time with a browser User-Agent and a small delay is the way, and a failure just leaves the ID. IGNORE FOR NOW.

### 7. Treemap UI

- Squarified treemap. Default view: all games from all libraries combined, grouped by library with a toggle for mixed (see General features 1–3); drill down game → category (→ Workshop item).
- Colour: by library in the combined view (fixed colour per library, stable across rescans); by category (game files / Workshop) inside a game. Hover tooltip with name, size, library, path, appid.
- Legend + a sortable table view as an alternative to the treemap.
- Actions on a game:
  - **Open folder** (Explorer, via Python `os.startfile`).
  - **Uninstall** via `steam://uninstall/<appid>`.
- Refresh button (top right, feature 6); fast/accurate toggle.

### 7b. GUI implementation (Vue 3 + Vite)

- **Shared state:** a single store (Pinia, or a plain `reactive()` module) holds scan results, current drill-down path, selection, and scan progress. All views read from it, so selecting a tile highlights the table row and vice versa.
- **Components (initial):**
  - `Toolbar.vue`: fast/accurate toggle, grouped/mixed layout toggle, settings; large **Refresh** button aligned top right.
  - `Breadcrumb.vue`: All libraries › game (› Workshop); each segment is clickable to go back.
  - `Treemap.vue`: layout via `d3-hierarchy` (squarified), rendered on **Canvas** (handles thousands of Workshop tiles; allows WinDirStat-style cushion shading later). Hover tooltip, click to select, right-click for the context menu, double-click to drill down.
  - `ContextMenu.vue`: right-click menu (Inspect, Open folder, Uninstall…), built on the `popover` attribute and positioned at the cursor; also closes on Esc / outside click.
  - `GameTable.vue`: plain `<table>` with sortable columns (name, size, category breakdown, library). Virtualisation only if needed (TanStack Table as an option).
  - `StatusBar.vue`: totals, scan progress.
  - Dialogs (`SettingsDialog.vue`, about) built on native `<dialog>` / `showModal()`.
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
- The Workshop item-name cache (`workshop-names.json`) follows the same location.

### 10. Per-account data (which Steam account to use)

Installed games and their sizes are shared by all accounts on the PC, but some data is stored per Steam account under `<Steam>/userdata/<accountid>/` (e.g. playtime and last played in `config/localconfig.vdf`).

- **Use the account that signed in most recently**, with no account picker in the UI. Read `<Steam>/config/loginusers.vdf`: each entry is keyed by SteamID64; pick the one with `"MostRecent" "1"`, falling back to the highest `Timestamp`. On the dev machine `MostRecent` is absent entirely, so the timestamp fallback is the normal path, not an edge case.
- Convert SteamID64 to the `userdata` folder name: `accountid = steamid64 - 76561197960265728`. Ignore `userdata/0` (the offline/anonymous folder).
- If no account or no `userdata` folder is found, skip per-account data; size scanning still works.
- Playtime is always collected (one small file, silent on failure) from `userdata/<accountid>/config/localconfig.vdf` → `Software/Valve/Steam/apps/<appid>`: `Playtime` and `Playtime2wks` in **minutes**, `LastPlayed` as a Unix timestamp. Old entries use `0` or `86400` (1970-01-02) to mean "never played"; anything before 2003 is treated as no date.
- This is the local cache Steam writes as it runs, so it can lag the server by a few minutes. Display matches Steam: hours rounded **up** to one decimal (35443 min = 590.72 h, which Steam shows as 590.8), and a date like `Nov 12`, with the year added outside the current year.

## Known caveats

- Non-Steam shortcuts are not in the manifests (out of scope).
- Workshop content left behind by an uninstalled game (an `appworkshop_<appid>.acf` with no matching `appmanifest`) belongs to no game, so it is not counted. On the dev machine this was 3.4 MB in total, so it is not worth a report of its own.
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
