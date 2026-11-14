# SteamDirStats — Progress checklist

See [plan.md](plan.md) for details on each item.

## Milestones

- [x] Phase one (branch `feature/phase-one`)
  Data modules only, no UI or pywebview. `steamdirstats` package: locate Steam, parse libraries and manifests, fast mode; installed games grouped by library; CLI output for testing against a real install.
- [ ] Phase two.
  Vue 3 + Vite scaffold in `ui/`, pywebview window (dev + dist modes), basic Canvas treemap (library → game) and game table sharing one store.
- [ ] Category split (game files / Workshop) and accurate mode with progress.
  Data side done in phase one (`workshop.py`, `measure.py`, `--accurate`); the UI half is pending.
- [ ] Workshop drill-down with item name lookup + cache.
  Names and cache done in phase one (`workshop_names.py`, `appdir.py`); the drill-down UI is pending.
- [ ] Features
  - [ ] Actions (open folder, uninstall)
  - [ ] table view
  - [ ] portable settings + window state persistence
- [ ] PyInstaller build.

## Phase one: data modules + command line

Reusable `steamdirstats` package that gathers all the data the UI will display. No UI, no pywebview; output on the command line for testing.

- [x] Core scanner
  - [x] Tolerant VDF/ACF parser (`vdf.py`)
  - [x] Locate Steam (`locate.py`)
    - [x] Registry `HKCU\Software\Valve\Steam\SteamPath`, then HKLM
    - [x] Fallback to default install folders
    - [x] `--steam-path` override
  - [x] Read all libraries from `libraryfolders.vdf` (`libraries.py`)
    - [x] Current and legacy (pre-2021) formats
    - [x] Main Steam folder always included, duplicates removed
    - [x] Missing library (e.g. unplugged drive) flagged as unavailable
    - [x] Disk total / free space per library
  - [x] Read installed games from `appmanifest_*.acf` (`games.py`)
    - [x] Name, appid, install folder, `SizeOnDisk`, state flags, last updated
    - [x] Skip unreadable or invalid manifests
    - [x] Flag games that are not fully installed
    - [x] Real name for placeholder manifest names (`appid_<n>`) from `appcache/appinfo.vdf` (`appinfo.py`)
  - [x] Games grouped by library, largest first (`scanner.scan()`)
  - [x] Data classes with `to_dict()` for JSON (`models.py`)
- [x] Command line
  - [x] Text report grouped by library, with totals
  - [x] `--json` output
  - [x] UTF-8 output in Git Bash
  - [x] Workshop total per game, with one line per item (`--no-items` to hide)
  - [x] Workshop item names, with `--offline`, `--item-urls` and a lookup summary line
- [x] Tests
  - [x] Unit tests with fake Steam folders (`python -m unittest`)
  - [x] Run against a real Steam install on Windows (`python -m steamdirstats`, text + `--json`)
  - [x] Compare the totals with Steam's Storage Manager (manual check)
- [x] Size categories per game
  - [x] Game files (`common/<installdir>`) — manifest `SizeOnDisk`
  - [x] Workshop total from `workshop/appworkshop_<appid>.acf` (`workshop.py`)
  - [x] Game total = game files + Workshop, used for library and global totals
  - [x] IGNORE Shader cache (`shadercache/<appid>`)
  - [x] IGNORE Pending downloads (`downloading/<appid>`, `temp/<appid>`)
- [x] Scan modes
  - [x] Fast mode: sizes from manifests
  - [x] Accurate mode: walk the real folders for every category (`measure.py`)
    - [x] Folders shared by two appids (Skyrim SE + Creation Kit) counted once
    - [x] Unreadable folder keeps its manifest size; junctions not followed
  - [x] Progress reporting (callback the UI can hook into later)
  - [x] `--accurate` CLI option
- [x] Workshop details
  - [x] Per-item ID and size from `WorkshopItemsInstalled`
  - [x] Per-item size from disk in accurate mode
  - [x] Resolve item names via `ISteamRemoteStorage/GetPublishedFileDetails` (`workshop_names.py`)
    - [x] Batched requests, any failure leaves the name empty instead of raising
    - [x] Status line while requesting; progress callback for the UI
  - [x] Cache item names in `workshop-names.json` in the app folder (`appdir.py`)
    - [x] Look up only the items the cache is missing; `--offline` uses the cache only
    - [x] Remember misses (deleted items) and retry them after a week
  - [x] Name from the item's own `publish_data.txt` when the API will not describe it
  - [x] Fallback to item ID + Steam Community link (`--item-urls`)
- [x] Per-account data (`accounts.py`)
  - [x] Pick the most recently signed-in account from `config/loginusers.vdf`
    - [x] `MostRecent` when present, else the highest `Timestamp` (often the only one there)
  - [x] Convert SteamID64 to the `userdata` account ID
  - [x] Playtime, playtime last 2 weeks, last played from `localconfig.vdf`
    - [x] Placeholder dates (`0`, `86400`) read as "never played"
  - [x] Skip gracefully when no account is found
- [x] CLI report completeness
  - [x] Game files / Workshop categories per game
  - [x] Workshop items with names, sizes and ranking
  - [x] Playtime and last played, formatted like Steam (`590.8 h, Nov 12`)

## Phase two: desktop app (pywebview + Vue 3)

- [ ] Project setup
  - [ ] Vue 3 + Vite scaffold in `ui/`
  - [ ] `app.py`: pywebview window
    - [ ] `--dev` mode pointing at the Vite dev server (hot reload)
    - [ ] Release mode loading `ui/dist/index.html`
  - [ ] Python API exposed to JS (`scan`, `open_folder`, `uninstall`, settings)
  - [ ] `api.js` wrapper, waits for `pywebviewready`
  - [ ] Scan progress pushed to the UI via `evaluate_js`
  - [ ] Shared store (scan data, drill-down path, selection, progress)
- [ ] Layout
  - [ ] Toolbar: fast/accurate toggle, grouped/mixed toggle, settings
  - [ ] Large Refresh button, top right
  - [ ] Breadcrumb (`All libraries › <Game>`), clickable segments
  - [ ] Resizable treemap / table split
  - [ ] Status bar: totals, scan progress
- [ ] Treemap (`Treemap.vue`)
  - [ ] Squarified layout via `d3-hierarchy`, rendered on Canvas
  - [ ] Combined default view: all games from all libraries
  - [ ] One colour per library, stable across rescans
  - [ ] Legend: library colour, path, total size
  - [ ] Grouped layout by default, toggle to mixed (remembered in settings)
  - [ ] Hover tooltip: name, size, library, path, appid
  - [ ] Click to select (syncs with the table)
- [ ] Context menu (`ContextMenu.vue`)
  - [ ] Opens on right-click at the cursor; closes on Esc / outside click
  - [ ] Inspect
  - [ ] Open folder (Explorer)
  - [ ] Uninstall… via `steam://uninstall/<appid>` (no confirmation of our own)
- [ ] Drill-down view
  - [ ] Inspect replaces the treemap with the selected game
  - [ ] Split by category, coloured by category
  - [ ] Workshop items as individual tiles, with names
  - [ ] Double-click a game tile as a shortcut for Inspect
  - [ ] Back via breadcrumb, Backspace or Esc
- [ ] Refresh
  - [ ] Rescans with the current fast/accurate mode
  - [ ] Resets to the combined view, clears drill-down and selection
- [ ] Data table (`GameTable.vue`)
  - [ ] Sortable columns: name, size, category breakdown, library
  - [ ] Playtime and last played columns
  - [ ] Shows the drill-down breakdown when inspecting a game
  - [ ] Selection synced with the treemap
- [ ] Dialogs
  - [ ] Settings (`<dialog>`)
  - [ ] About
- [ ] Settings and window state
  - [ ] Portable `settings.json` next to the exe (`sys.executable` when frozen, project folder in dev)
  - [ ] Fallback to `%APPDATA%\SteamDirStats\` when the app folder is not writable
  - [ ] Workshop name cache stored alongside settings (`appdir.data_file`, done in phase one)
  - [ ] Save / restore window placement with `GetWindowPlacement` / `SetWindowPlacement`
  - [ ] Check behaviour with display scaling (125% / 150%)
- [ ] Packaging
  - [ ] `npm run build` → `ui/dist/`
  - [ ] PyInstaller `--onefile --windowed` build with `ui/dist` and icon
  - [ ] App icon
  - [ ] Test the exe on a clean Windows PC (no Python / Node)
  - [ ] Check antivirus false positives; consider `--onedir` or signing
