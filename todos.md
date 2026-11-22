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
  - [x] Check display scaling at 125% / 150%
  - [x] Check the `%APPDATA%` fallback with the exe in a read-only folder
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
  - [x] add a maximize button between minimize and close: it toggles, and the
    icon switches to the restore one while maximized (a resize listener, as
    there is no maximized event, so double-clicking the drag region reports
    the same way); `core:window:allow-toggle-maximize` in the capability file
  - [x] window minimize & close buttons use SVG icons
    - [x] merge the buttons next to the current Fast / Grouped / Refresh buttons
    - [x] Minimize icon looks like FontAwesome chevron down icon
    - [x] Close icon is a red cross (like fontawesome times icon)
  - [x] `allow-minimize` and `allow-start-dragging` added to the capability
    file; close goes through `close()`, so the placement is still saved
  - [x] Checked in the running app: rounded corners and border intact, the
    buttons render and minimize works
- [x] Sortable table columns (name, size, Workshop, playtime, last played, library)
  - [x] The sort lives in `sd-game-table.vue`, not the store: the treemap
    builds its layout from `libraries` and the status bar only counts, so
    nothing else sees it, and `games` stays the canonical largest-first list
  - [x] Clicking the sorted column flips it; a new column starts descending
    for the numeric ones (Size, Workshop, Playtime) and ascending for Game
    and Library
  - [x] **Workshop** sorts games by their total Workshop size. Workshop item
    rows are children, not peers: they stay with their game and are always
    largest first, whatever the game rows are sorted by
  - [x] Names and library labels compare with an `Intl.Collator` set to
    `numeric`, so Portal 2 follows Portal rather than Portal 12; the library
    sorts on the label the cell shows, not the path
  - [x] Unplayed games (no playtime, no last-played) and games without mods
    cluster at 0; total_size descending breaks the tie, so the big entries
    stay at the top of their cluster and the order is stable
  - [x] Each header is a button filling its cell, with `aria-sort` and a
    chevron that is always in the markup — invisible until the column is
    sorted — so the header row does not reflow when the sort moves
  - [x] Not persisted: every run starts at size descending, like the split
  - [x] Checked in the running app
- [x] Resizable treemap / table split
  - [x] `sd-splitter.vue`: a 7px handle on its own grid row, pointer capture
    so the drag survives the canvas and the table, arrow keys to nudge it and
    a double-click to reset
  - [x] `app.vue` holds the geometry: the split is a fraction, written inline
    as `minmax(0, Nfr) auto minmax(0, 1-Nfr)`, so the panes keep their
    proportions when the window is resized
  - [x] Both panes keep a 90px minimum; a window too short for two of them
    drops the clamp rather than pinning the handle
  - [x] Not persisted: the split is `app.vue`'s own state and every run
    starts at the default 60/40
  - [x] The legend wraps to as many rows as the libraries need
    (`.sd-App-map` is `minmax(0, 1fr) auto`, so the treemap gives way to it
    instead of the legend being clipped)
- [x] Dialog: about (`<dialog>`)
  - [x] `sd-about-dialog.vue` on native `<dialog>` + `showModal()`, so the
    backdrop, the top layer and Esc are the browser's
  - [x] An info button in the title bar, left of the window buttons; the
    dialog itself lives in `app.vue`, not in the toolbar, because that row is
    the drag region and `deep` walks up from the click, so a dialog nested in
    it would drag the window
  - [x] The close button reuses the title bar's own red cross, classes and all
  - [x] The name carries a blue/cyan gradient that cycles through it
    (`background-clip: text`, held still under `prefers-reduced-motion`)
  - [x] The version comes from `tauri.conf.json` through a Vite `define`
    (`__APP_VERSION__`), so the dialog shows what the exe carries
  - [x] **Github** hands the URL to the shell (`openUrl`), with
    `https://github.com/fabd/SteamDirStats` added to the opener's url scope;
    in a plain browser it opens a tab instead
- [ ] Packaging
  - [x] `npx tauri build` → portable `SteamDirStats.exe`
  - [x] app icon (placeholder icon made by Claude... looks fine)
  - [ ] Run the exe on a clean Windows PC (no Node / Rust); note the WebView2 requirement
  - [ ] Check antivirus / SmartScreen behaviour; consider signing

## Polishing

- [x] Context menu also works on right click on game row in the table
  - [x] `sd-context-menu.vue` takes a target — a game, or one of a game's
    Workshop items — instead of a game, so one component serves both kinds of
    row and the treemap's tiles
  - [x] The table mounts its own instance, as a sibling of the `<table>`: a
    `<div>` cannot live inside one, and the menu is a fixed-position popover in
    the top layer, so it needs no box of its own and the scroller cannot clip
    or move it
  - [x] Add "View Store page" to the context menu (`steam://store/<appid>`,
    already inside the opener's url scope, so no capability change)
  - [x] if it is a workshop item show "View on Steam Workshop" instead of
    "View Store page", and "Browse local files" opens the item's own folder;
    no uninstall entry, as Steam has no per-item protocol action
  - [x] The item row keeps its inline "View on Steam Workshop" link: there is
    room for it, and a link is more discoverable than a context menu
  - [x] Checked in the running app
  - [x] check context menu at bottom of table (shows on top of the treemap, no issue)
- [x] display the library in tooltip the same way as in the table, with a small coloured swatch
  - [x] do not show the full install path in the tooltip (user can simply use the "Browse local files" option to reveal it)
- [x] tooltip clips at bottom of view, keep it in view
  - [x] the tooltip flips above the cursor when it would run past the bottom
    edge, and is clamped inside the treemap either way; its height is measured
    after each render (`updated()`), as the box grows a line for a game with
    Workshop items
- [ ] visuals
  - [x] fix the expand/collapse icon next to workshop size in game row
  - [x] expanded workshop item for selected game have a darker shade of background colour
  - [x] add icons to the context menu. the item labels remain aligned, so there
    is extra padding on the left, which is space for an icon
    - [x] Paths live in a shared `ui/src/lib/icons.ts`: a record of
      `{ viewBox, path }`, one single-path entry per icon, lifted from
      FontAwesome Free (solid, plus the Steam brand mark). Inline SVG, like the
      toolbar's own icons — no sprite, no icon font, no runtime dependency
    - [x] Steam icon for the "View on Steam Workshop" and "View Store page" links
    - [x] garbage icon for uninstall
    - [x] uninstall in dark red text
    - [x] no icon for "Browse local files" and "View Workshop Items"
  - [ ] nice dark theme colours, inspired by Steam client
  - [ ] the resizable handle bg color, draggable icon/texture?
- [ ] prevent columns resizing when expanding workshop items
- [ ] typography?
- [ ] Github
  - [ ] README screenshot
  - [ ] Release with EXE

## Fixes


- [ ] double check E:/steam/steam 267 GB reported by Explorer, 294 GB shown in app
