# SteamDirStats — Progress checklist

See [plan.md](plan.md) for details on each item.

## Milestones

- [x] Phase one (branch `feature/phase-one`)
  Data modules only, no UI or pywebview. `steamdirstats` package: locate Steam, parse libraries and manifests, fast mode; installed games grouped by library; CLI output for testing against a real install.
- [ ] Phase two.
  Vue 3 + Vite scaffold in `ui/`, pywebview window (dev + dist modes), basic Canvas treemap (library → game) and game table sharing one store.
- [ ] Category split (game files / Workshop) and accurate mode with progress.
  Data side done in phase one (`workshop.py`, `measure.py`, `--accurate`); the UI half is pending.
- [ ] Workshop items expandable in the table, with item name lookup + cache.
  Names and cache done in phase one (`workshop_names.py`, `appdir.py`); the table rows are pending.
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
  - [x] Vue 3 + Vite scaffold in `ui/` (Vue 3 + TS, Tailwind v4, `@` alias, `base: './'`)
  - [x] Dev fixture (`ui/fixture.json`, gitignored) so the UI runs in a plain browser
  - [x] Local `.venv` + `requirements.txt` (pywebview, pyinstaller); README setup steps
  - [x] `app.py`: pywebview window
    - [x] `--dev` mode pointing at the Vite dev server (hot reload, port 5173)
    - [x] Release mode loading `ui/dist/index.html`
  - [x] Python API exposed to JS (`scan`, `open_folder`, `uninstall`, settings)
    - [x] `settings.py`: portable `settings.json`, merged on write
    - [x] `open_folder` / `uninstall` wired up from the context menu
  - [x] `api/bridge.ts` wrapper, waits for `pywebviewready` (TS, not `api.js`)
  - [x] Scan progress pushed via `evaluate_js` (`window.sdScanProgress`, throttled)
  - [x] Shared store (scan data, selection, inspected game, progress)
- [ ] Layout
  - [x] Window grid: toolbar / content / status bar (`.sd-App`)
  - [ ] Toolbar: fast/accurate toggle, grouped/mixed toggle, settings
    - [x] Fast/accurate and grouped/mixed toggles (grouped/mixed drives the treemap)
  - [x] Large Refresh button, top right
  - [ ] Resizable treemap / table split
  - [x] Status bar: totals, scan progress
- [x] Treemap (`sd-treemap.vue`)
  - [x] Squarified layout via `d3-hierarchy`, rendered on Canvas
  - [x] Combined default view: all games from all libraries
  - [x] One colour per library, stable across rescans
  - [x] Legend: library colour, path, total size (`sd-legend.vue`)
  - [x] Grouped layout by default, toggle to mixed (remembered in settings)
  - [x] Hover tooltip: name, size, library, path, appid
  - [x] Click to select (syncs with the table)
- [x] Context menu (`sd-context-menu.vue`)
  - [x] Opens on right-click at the cursor; closes on Esc / outside click
    - [x] `popover="auto"`, kept in view at the window edges
  - [x] Open folder (Explorer)
  - [x] Uninstall… via `steam://uninstall/<appid>` (no confirmation of our own)
  - [x] View Workshop Items (expands the game in the table), only on games that have items
- [x] Remove the drill-down (design change, plan.md general feature 5)
  - [x] Drop **Inspect** from the context menu
  - [x] Drop `inspecting` / `inspect()` / `inspectedGame` from the store (no view read them)
  - [x] Double-click a game tile expands that game in the table instead
  - [x] Expanding from the treemap scrolls the game's row into view
  - [x] No breadcrumb component
- [ ] Refresh
  - [ ] Rescans with the current fast/accurate mode
  - [x] Resets to the combined view, clears the selection and collapses expanded games
- [ ] Data table (`sd-game-table.vue`)
  - [ ] Sortable columns: name, size, Workshop, playtime, last played, library
    - [x] Columns rendered (size-ordered; sorting not implemented)
  - [x] Playtime and last played columns
  - [x] Selection synced with the treemap
  - [x] Workshop item rows (plan.md general feature 5)
    - [x] `expanded: Set<number>` of appids in the store, cleared on refresh
    - [x] Expand/collapse control in the Workshop cell, only on games that have items
    - [x] Flat row list (game + item rows) in one computed property; items largest first
    - [x] Item row: indented name, size in the Workshop column, Size/Playtime/Last played empty
    - [x] Scan asks for `workshop_names`, so the rows have names like the CLI report
      - [x] Lookup progress pushed to the status bar (`progress=` in `app.py`)
    - [x] Item name falls back to the item id when none was resolved
    - [x] Clicking an item row selects its parent game
    - [x] Dark red **View on Steam Workshop** link in the Library column (plan.md §7c)
      - [x] `workshop_page(itemid)` in `app.py` → `steam://url/CommunityFilePage/<itemid>`
      - [x] `bridge.ts` wrapper; failures go to the status bar via `notify()`
    - [x] CSS in `styles/components/table.css` (`--item` row, toggle, danger link)
    - [ ] Check it in the running app (31 Workshop items on SteamVR in the fixture)
- [ ] Dialogs
  - [ ] Settings (`<dialog>`)
  - [ ] About
- [ ] Window chrome
  - [ ] custom title bar with minimize and close buttons
- [ ] Settings and window state
  - [ ] Portable `settings.json` next to the exe (`sys.executable` when frozen, project folder in dev)
  - [ ] Fallback to `%APPDATA%\SteamDirStats\` when the app folder is not writable
  - [ ] Workshop name cache stored alongside settings (`appdir.data_file`, done in phase one)
  - [ ] Save / restore window placement with `GetWindowPlacement` / `SetWindowPlacement`
  - [ ] Check behaviour with display scaling (125% / 150%)
- [ ] Packaging
  - [x] `npm run build` → `ui/dist/` (relative asset URLs, no fixture in the bundle)
  - [ ] PyInstaller `--onefile --windowed` build with `ui/dist` and icon
  - [ ] App icon
  - [ ] Test the exe on a clean Windows PC (no Python / Node)
  - [ ] Check antivirus false positives; consider `--onedir` or signing
