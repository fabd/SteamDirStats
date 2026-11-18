# SteamDirStats — Progress checklist

See [plan.md](plan.md) for details on each item.

## Milestones

- [x] Phase one — data modules + CLI (branch `feature/phase-one`, Python)
- [x] Phase two — Vue 3 + Vite UI on pywebview: treemap, table, legend, context menu, Workshop rows
- [x] Phase three — TypeScript rewrite on Tauri (branch `refactor/use-rust-tauri`)
  The scanner is now host-agnostic TypeScript in `core/`, run by both the app and `node tools/steamdirstats-cli.ts`; Rust is a five-command shell. Phases one and two are history: the Python package, its tests and `app.py` are gone, and live in git history up to `9aecbf1` if they are ever wanted.
- [ ] Release build: portable exe, real icon, tested on a clean Windows PC.

## Phase three: TypeScript rewrite on Tauri

- [x] Clean up the Python side
  - [x] Delete the `steamdirstats` package and `tests/`
  - [x] Delete `app.py`, `settings.py`, `requirements.txt`
  - [x] `.gitignore` / `.prettierignore`: Node and Rust artefacts, no Python ones
  - [x] README: Node + Rust setup, `npx tauri dev`, `node tools/steamdirstats-cli.ts`
  - [x] CLAUDE.md: `core/` rules (no `node:*`, no `@tauri-apps/*`, erasable syntax) and Rust conventions
  - [x] `tools/shot.mjs` kept, and checked against the WebView2 devtools port
  - [ ] Delete the leftovers git never tracked: `.venv/`, `.webview-dev-profile/`, `.tools/vdf_viewer.py`
- [x] Project layout and toolchain
  - [x] One `package.json` + `node_modules/` at the project root
  - [x] `vite.config.ts` at the root with `root: 'ui'`, `@` → `ui/src`, `@core` → `core`, `clearScreen: false`
  - [x] Three tsconfigs; `tsconfig.core.json` has no DOM and no `@types/node`, so a stray `window` in `core/` fails to compile (checked)
  - [x] Node 24.20 runs the `.ts` directly; `erasableSyntaxOnly` on for `core/` and `tools/`
  - [x] `@tauri-apps/api` + fs / http / opener plugins; `@tauri-apps/cli` as a dev dependency
  - [x] `src-tauri/` written by hand rather than `tauri init`: conf, capabilities, build.rs
  - [x] `tauri.conf.json`: `"visible": false`, dev server on 5173, `frontendDist: ../ui/dist`
- [x] Host interface and the two adapters
  - [x] `core/host.ts`: fs, http, registry, dirSizes, allowFolder, dataDir
  - [x] `core/hosts/node.ts`: `node:fs`, `reg query`, global fetch, its own walk (one `lstat` per file, issued a folder at a time)
  - [x] `core/hosts/tauri.ts`: fs + http plugins, `invoke()` for the five commands, `scan-progress` → callback
  - [x] Tests run on the real filesystem in a temp folder; only the network is faked
- [x] Port the scanner to `core/`
  - [x] `models.ts` (owns the JSON shape the UI reads), `paths.ts`, `format.ts`
  - [x] `vdf.ts`, `locate.ts`, `libraries.ts`, `games.ts`, `appinfo.ts` (binary KeyValues over a DataView)
  - [x] `workshop.ts`, `accounts.ts` (SteamID64 as BigInt), `measure.ts`, `workshop-names.ts`, `settings.ts`, `scanner.ts`
  - [x] 43 tests under `npm test`, over the same ground as the Python suite
  - [x] `--json` diffed against the Python CLI: identical but for `steamid64`, now a string (plan.md, Known caveats)
- [x] CLI (`tools/steamdirstats-cli.ts`)
  - [x] Text report identical to the Python one, byte for byte
  - [x] `--json`, `--accurate`, `--no-items`, `--item-urls`, `--offline`, `--steam-path`, `--help`
  - [x] Progress on stderr; `ui/fixture.json` regenerated from it
- [x] Rust shell (`src-tauri/`, ~250 lines)
  - [x] `read_registry(hive, key, value)` — HKCU/HKLM strings only
  - [x] `allow_steam_folder(path)` — grants only a folder that really holds `steamapps`
  - [x] `dir_sizes(paths)` — `walkdir` on a blocking thread, `scan-progress` events, scope-checked, `null` for an unreadable folder
  - [x] `disk_usage(path)` — `GetDiskFreeSpaceExW` for the legend
  - [x] `data_dir()` — exe folder with the `%APPDATA%` fallback, writability probed by writing
  - [x] `capabilities/default.json`: no static fs scope, http scope `api.steampowered.com`, opener url scope `steam://*`
  - [x] Checked against a second drive (`D:\Steam`) and an unplugged library (`H:\SteamLibrary`)
- [x] Frontend
  - [x] `api/bridge.ts` reduced to host wiring + the three opener actions
  - [x] `api/types.ts` deleted; the UI imports `@core/models.ts`
  - [x] Progress via the `scan()` callback; `window.sdScanProgress` gone
  - [x] Settings read and written by `core/settings.ts` through the same host
  - [x] Fixture fallback still works in a plain browser
  - [x] `npm run typecheck` clean
- [x] Window and settings
  - [x] `ui/src/lib/window-state.ts`: restore, then `show()`; saved on close and on `pagehide`
  - [x] Off-screen placement falls back to centring
  - [x] Verified on a cold start: a hand-placed 1243×959 at 815,97 comes back exactly
  - [x] Needed `core:window:allow-set-focus` and `core:window:allow-center` in the capability file; without them the restore failed silently and the window opened where Tauri put it
  - [x] Needed `core:window:allow-destroy` too: attaching `onCloseRequested` hands the closing to the page, so without it the title bar's close button saved the placement and then did nothing
  - [x] Full cycle checked: move to 500,300 → close → placement saved, process exits 0 → relaunch restores 500,300 exactly
  - [x] `isOnScreen()` fails closed: monitors that cannot be enumerated (which happens while the window is hidden) keep the saved position rather than centring the window
  - [ ] Check display scaling at 125% / 150%
  - [ ] Check the `%APPDATA%` fallback with the exe in a read-only folder
- [x] Checked in the running app
  - [x] Real scan: 53 games, 3 libraries, 493.7 GB
  - [x] Workshop item names fetched through the http plugin and cached next to the exe
  - [x] Workshop rows expand with their names (31 items on SteamVR)
  - [x] Accurate refresh: per-game progress in the status bar, total 493.7 → 495.6 GB
  - [x] Toggling a setting writes `settings.json` next to the exe, merged with the window key

## Still to do (carried over from phase two)

- [x] Custom title bar with minimize and close buttons (plan.md 7e)
  - [x] `"decorations": false` with `"shadow": true`, so the window keeps the
    Windows frame; the toolbar row is the drag region
    (`data-tauri-drag-region="deep"`, which buttons block by themselves)
  - [x] window stays resizable: the shadow keeps the DWM frame, and tao
    hit-tests the top edge itself
  - [x] maintain the standard window border and rounded corners
  - [x] keep the app icon to the left, next to the window title — imported
    through the `@icons` alias, not a copy that would go stale
  - [x] no maximize button (double-click still maximizes, as Windows does)
  - [x] window minimize & close buttons use SVG icons
    - [x] merge the buttons next to the current Fast / Grouped / Refresh buttons
    - [x] Minimize icon looks like FontAwesome chevron down icon
    - [x] Close icon is a red cross (like fontawesome times icon)
  - [x] `allow-minimize` and `allow-start-dragging` added to the capability
    file; close goes through `close()`, so the placement is still saved
  - [x] Checked in the running app: rounded corners and border intact, the
    buttons render and minimize works
- [ ] Sortable table columns (name, size, Workshop, playtime, last played, library)
- [ ] Resizable treemap / table split
- [ ] Dialog: about (`<dialog>`)
  - [ ] TODO : which looks like .... 
- [ ] Packaging
  - [ ] `npx tauri build` → portable `SteamDirStats.exe`
  - [ ] Real app icon (the current one is a placeholder generated into `src-tauri/icons/`)
  - [ ] Run the exe on a clean Windows PC (no Node / Rust); note the WebView2 requirement
  - [ ] Check antivirus / SmartScreen behaviour; consider signing
