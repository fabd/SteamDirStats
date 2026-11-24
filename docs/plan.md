# SteamDirStats — Plan

A WinDirStat-style desktop app that shows, as a treemap, how much disk space each installed Steam game takes, across all Steam libraries.

## Stack

- **Target OS:** Windows only (10/11).
- Frontend: Vite + Vue + TypeScript
- Backend: Tauri (Rust + WebView)
- **Logic in TypeScript** (`core/`), shared by the app and the CLI; Rust only where TypeScript cannot do the job (see Architecture).
- **Distribution:** single portable `SteamDirStats.exe`
- **Dev environment:** Windows with Git Bash, node, Microsoft Visual Studio Build Tools, and Rust are installed

## Dev Setup

- Git for Windows (Git & Git Bash)
- Claude Code
- node \
  `winget install OpenJS.NodeJS.LTS`
- Prerequisites for Tauri (~7 GB)
  - **Microsoft C++ Build Tools**\
  `winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`
  - Rust \
    `winget install --id Rustlang.Rustup`

## Dev & Release Builds

- **Dev:** `npx tauri dev` starts the Vite dev server and opens the app window pointed at it, with hot reload. `npm run dev` alone runs the UI in a browser with no backend, against the fixture.
- **Release:** `npx tauri build` builds the UI, compiles the Rust shell and embeds `ui/dist/` in the executable. End users never need Node or a toolchain.
- **TypeScript everywhere, one package:** a single `package.json` and `node_modules/` at the project root, so `core/` is inside Vite's workspace root and needs no `server.fs.allow` exception.
- **Node runs the TypeScript directly** (type stripping, Node 22.18+; 24.20 here), so the CLI needs no build step and no dependencies at all. The price is that `core/` and `tools/` must stay erasable — no enums, no namespaces, no parameter properties — and relative imports must spell the `.ts` extension. `erasableSyntaxOnly` is already on in the UI's tsconfig; the same flag covers `core/`.
- **Three tsconfigs keep the layers honest:** `tsconfig.core.json` (core, `lib: ES2024`, no DOM and no `@types/node`, so a stray `window` or `process` fails to compile), `tsconfig.node.json` (`core/hosts/node.ts`, `tools/`, `vite.config.ts`), `tsconfig.app.json` (`ui/src`, `core/hosts/tauri.ts`). `npm run typecheck` builds all three.


## Architecture

All the logic — VDF parsing, libraries, manifests, Workshop, accounts, settings shape — is TypeScript in `core/`, written once and run in two places: the Tauri webview, and Node for the CLI. Rust is a thin shell: six commands and three plugins, about 265 lines.

```
core/               Host-agnostic TypeScript. No node:*, no @tauri-apps/*, no DOM.
  host.ts             the Host interface: fs, http, registry, dirSizes, allowFolder, dataDir
  models.ts           Game / Library / SteamData types; the single source of truth for the JSON shape
  paths.ts            the Windows path handling core needs, since node:path is not available here
  format.ts           sizes, playtime and dates, shared by the UI and the CLI report
  vdf.ts              tolerant text VDF/ACF parser
  appinfo.ts          appid → name from the binary appcache/appinfo.vdf (placeholder names)
  locate.ts           find the Steam folder (registry via the host, then default paths)
  libraries.ts        read libraryfolders.vdf (current + legacy formats)
  games.ts            read appmanifest_*.acf per library
  workshop.ts         read appworkshop_*.acf per library (Workshop totals and items)
  workshop-names.ts   Workshop item names from the Steam web API, cached on disk
  accounts.ts         most recently signed-in account, playtime from localconfig.vdf
  measure.ts          accurate mode: ask the host for folder sizes, split shared folders
  settings.ts         settings shape, defaults, and the merge rule (IO through the host)
  scanner.ts          scan(host, options): the single entry point used by the CLI and the UI
  *.test.ts           node:test suites against fake Steam folders on disk
  test-support.ts     their fixtures (Node-only, so outside tsconfig.core.json)
core/hosts/         The two adapters. Each is imported by exactly one caller.
  node.ts             node:fs, `reg query`, global fetch, its own directory walk
  tauri.ts            @tauri-apps/plugin-fs, plugin-http, and invoke() for the Rust commands
tools/
  steamdirstats-cli.ts  the CLI: node tools/steamdirstats-cli.ts [--json] [--accurate] [--no-items]
  shot.mjs              screenshot helper for the running window
src-tauri/          The Rust shell. Small on purpose; see "What Rust is for".
  Cargo.toml        tauri, tauri-plugin-fs, -http, -opener, winreg, windows-sys, walkdir, serde
  tauri.conf.json   window defaults (hidden until placed), bundle settings, dev/build commands
  capabilities/default.json  which plugin commands the window may call
  src/main.rs       entry point
  src/lib.rs        builder: plugins, command registration
  src/commands.rs   read_registry, allow_steam_folder, dir_sizes, open_folder, disk_usage, data_dir
ui/                 Vue 3 + Vite project; imports core/ through the `@core` alias
  src/api/bridge.ts   builds the Tauri host, runs scan(), and the three opener actions
  src/lib/window-state.ts  save and restore the window placement (§8)
ui/dist/            Production build output, embedded in the exe by Tauri
package.json        One package at the project root: the UI's deps plus the Tauri CLI
vite.config.ts      Vite with `root: 'ui'`, aliases `@` → ui/src and `@core` → core
```

### What Rust is for

Everything else is TypeScript. Rust earns its place in exactly six commands:

| Command                           | Why it cannot be TypeScript                                                                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read_registry(hive, key, value)` | Reads `HKCU\Software\Valve\Steam\SteamPath` and the HKLM fallbacks (`winreg`). Only those two hives and only string values, so the page cannot name a hive of its own.                                                                       |
| `allow_steam_folder(path)`        | Only the Rust side can widen the file scope at runtime, and it allows a folder only if it really holds a `steamapps` directory (§7d). The same command serves the Steam folder and every library.                                            |
| `dir_sizes(paths)`                | Accurate mode. The fs plugin's `readDir` carries no sizes, so TypeScript would need one `stat` call per file across the IPC bridge — hundreds of thousands of round trips. `walkdir` does it on a blocking thread and emits progress events. |
| `open_folder(path)`               | The opener plugin's path scope is static, written in the capability file, which cannot name library drives it has never seen. Rust opens the folder through the same plugin, gated on the runtime fs scope the scan already granted (§7d).   |
| `disk_usage(path)`                | Free and total space for the legend (`GetDiskFreeSpaceExW`); no plugin exposes it.                                                                                                                                                           |
| `data_dir()`                      | The folder of `current_exe()` (§9), which the fs plugin has no notion of, plus the scope grant for it.                                                                                                                                       |

The window itself, the uninstall and Workshop-page links and the window-state save/restore are all TypeScript on top of the official plugins; only opening a folder needs the Rust side, for the scope reason above.

### Host ports

`core/` never imports a host API. It takes a `Host` object:

```ts
export interface Host {
  fs: {
    readTextFile(path: string): Promise<string>;
    readFile(path: string): Promise<Uint8Array>;
    readDir(path: string): Promise<DirEntry[]>;   // name + isDirectory
    exists(path: string): Promise<boolean>;
    isDirectory(path: string): Promise<boolean>;
    writeTextFile(path: string, text: string): Promise<void>;
    diskUsage(path: string): Promise<DiskUsage | null>;
  };
  http: {
    postForm(url: string, form: Record<string, string>, timeoutMs: number): Promise<unknown>;
  };
  /** HKCU/HKLM string value, or null. */
  registry(hive: 'HKCU' | 'HKLM', key: string, value: string): Promise<string | null>;
  /** Total bytes per folder, in the order given; null for one that cannot be read. */
  dirSizes(paths: string[], onProgress?: SizeProgress): Promise<(number | null)[]>;
  /** Read access to a folder that should hold `steamapps`; false when refused. */
  allowFolder(path: string): Promise<boolean>;
  /** Where settings.json and workshop-names.json live (§9). */
  dataDir(): Promise<string>;
}
```

- `core/hosts/node.ts` implements it with `node:fs/promises`, `reg query` through `node:child_process`, global `fetch`, and a recursive walk of its own. `allowFolder` is a no-op: a Node process already reads whatever the user can.
- `core/hosts/tauri.ts` implements it with the fs and http plugins and `invoke()` for the six Rust commands.
- `allowFolder` is why the scope flow (§7d) lives in `core/` rather than in the UI: `locate.ts` asks before probing a candidate Steam folder, `libraries.ts` before touching a library, and the Node host simply says yes.
- Swapping the backend again means writing a third adapter, not touching `core/`.


## General features

User-facing features, in plain terms. Implementation details are in the functional requirements below.

1. **Combined default view.** On launch, the treemap shows every installed game from all libraries together in one view, sized by disk space.
2. **One colour per library.** Each library gets its own distinct colour, so the space taken by each library is visible at a glance. A legend maps each colour to its library: label, total size, and what share of that library's own drive it takes (`294 GB (56% of disk)`), which is what `disk_usage` is for.
3. **Grouped or mixed layout (toggle).** Default is **grouped**: each library's games form one contiguous block, so the block's area shows that library's share. A toggle switches to **mixed**: all games laid out by size regardless of library, which makes the biggest games easier to compare. Tile areas are exact in both layouts. The choice is remembered in settings.
4. **Right-click menu on a game.** Right-clicking a game tile opens a small context menu with:
   - **View Workshop Items**: expands that game's Workshop items in the table (feature 5), exactly as the row's own expand control does. Shown **only** on games that have Workshop items, so the menu has one entry fewer on most games.
   - **Open folder**: opens the game's install folder in Explorer.
   - **Uninstall…**: opens `steam://uninstall/<appid>` directly, with no confirmation dialog of our own. Steam comes to the front (starting first if needed) and shows its own uninstall dialog, where the user can still cancel. The user then clicks **Refresh** (feature 6) to update sizes.
5. **Workshop items in the table.** There is no drill-down view, and no treemap of a single game: the treemap always shows every game. Instead a game with Workshop content can be **expanded in the table**, listing its items indented underneath it, the way the CLI report does:

   ```
   SteamVR                    34.8 GB  [v] 29.4 GB   590.8 h   Nov 12   D:\SteamLibrary
     Advanced Settings                      7.1 GB                      View on Steam Workshop
     Knuckles Driver                        3.4 GB                      View on Steam Workshop
   ```

   - An expand/collapse control sits next to the **Workshop** figure on the game row, and only on games that have items. Expanded games stay expanded until the next Refresh.
   - Three ways in: the row's own control, **View Workshop Items** in the context menu (feature 4), and double-clicking the game's tile. The two that start from the treemap expand rather than toggle — they ask to see the items, they are not a switch — and they scroll the game's row into view, since the table is rarely already at that game.
   - Item rows are sorted by size, largest first, independently of how the game rows are sorted.
   - Item names come from the same lookup the CLI uses, so the UI's scan has to ask for them (`workshop_names`, §6); without it the rows would show bare item ids. Progress goes to the status bar like the accurate scan's.
   - On an item row only two columns carry anything: the item's name (indented) under **Game**, and its size under **Workshop**. **Size**, **Playtime** and **Last played** stay empty, because an item has no game-files size and no playtime of its own.
   - The **Library** column of an item row holds a dark red **View on Steam Workshop** link (§7c) — the item is already in the game's library, so the column would otherwise repeat it.
6. **Refresh button.** A large Refresh button in the top-right corner of the window rescans all libraries (e.g. after uninstalling a game in Steam). It uses the current fast/accurate mode and always resets the view to the startup view (all libraries combined), clearing the selection and collapsing every expanded game. This keeps the view valid when a game that was on screen has just been uninstalled.

## Functional requirements

### 1. Locate Steam

- Registry `HKCU\Software\Valve\Steam\SteamPath`, then HKLM.
- The app reads it with the `read_registry` command (`winreg`); the CLI's host runs `reg query` and parses the value. Same `core/locate.ts` above both.
- Fallback: `C:\Program Files (x86)\Steam`.

### 2. Find all libraries

- Parse `<Steam>/steamapps/libraryfolders.vdf` → every library `path` (plus its `apps` map of appid → size).
- Library paths contain escaped backslashes (`D:\\SteamLibrary`).
- Use a tolerant VDF parser (format has varied over the years).
- In the app, each library path has to be granted read access before anything inside it can be read (§7d).

### 3. Find each installed game

- Each library's `steamapps/appmanifest_<appid>.acf` → `name`, `installdir` (under `steamapps/common/`), `SizeOnDisk` (bytes).
- Some manifests hold a placeholder name (`appid_823910`) because Steam did not know the name when it wrote the manifest. Steam shows the name from its own cache instead, so fall back to `<Steam>/appcache/appinfo.vdf` (binary KeyValues, `common/name`), then to `installdir`. The binary parse reads the bytes into a `DataView`; it is the one place `core/` touches binary data.

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

- **Fast:** manifests only (near-instant). The default. Pure TypeScript: a few dozen small files read through the host.
- **Accurate:** walk the real folders (manifest sizes can be stale and omit related data). Game folders and Workshop item folders are both measured.
  - `core/measure.ts` decides *which* folders to measure and how to split them; the host decides *how* to add up the bytes. In the app that is the `dir_sizes` Rust command (`walkdir`), in the CLI a plain recursive walk in Node.
  - This split exists because the fs plugin's `readDir` returns no sizes: doing it in the webview would mean one IPC call per file.
  - Progress is reported per folder: the Rust side emits `scan-progress` events, the Node host calls the callback directly.
- Measured on the dev machine: 1.1 s for 54 games and 496 GB, because only directory metadata is read. Accurate came out ~2 GB above fast, the bulk of it one game whose manifest was stale (Tomb Raider, +1.6 GB).
- **Shared install folders.** Some appids share one folder: Skyrim Special Edition (489830) and its Creation Kit (1946180) are both `common/Skyrim Special Edition`. Measuring per game would count those 15 GB twice, so each folder is walked once and split between its games in the proportion their manifests claimed. Steam does the same thing in effect: it gives the Creation Kit only its own 154 MB.
- A folder that cannot be read (missing, permissions, mid-update) keeps its manifest size rather than dropping to zero: `dir_sizes` returns `null` for it rather than failing the scan. Junctions and symlinks are not followed.

### 6. Workshop details

- Expand a game in the table to see its individual items (general feature 5).
- Item names are not stored locally (only numeric IDs). Resolve names via Steam's public `ISteamRemoteStorage/GetPublishedFileDetails` web API (no key required) and cache them in `workshop-names.json` next to the settings (§9); fall back to the ID plus a link to `https://steamcommunity.com/sharedfiles/filedetails/?id=<itemid>`.
- The request goes through `host.http.postForm`: the http plugin in the app (the webview's own `fetch` would be blocked by CORS from the `tauri://localhost` origin), global `fetch` in the CLI.
- Items the API will not describe (unlisted or private, `result` 9) can still name themselves on disk: items published with the Source 2 tools keep a `publish_data.txt` in their folder holding the title. It is tried last, because a title edited after publishing is only up to date in the API's answer. This is where Steam's own names for such items come from.
- Names are looked up automatically for any item the cache does not cover: 100 IDs per POST, 10 s timeout, and the lookup gives up after two failed requests so a machine with no network is not held up. Items the API does not know (deleted or private, `result` 9) are cached as misses and retried after a week. `--offline` skips the network and uses the cache only.
- Known limitation: mods installed outside the Workshop (Nexus, manual, mod managers) count as "Game files"; games that copy Workshop items elsewhere (e.g. Documents) are not detected.
- Some names are unavailable via Steam's public `ISteamRemoteStorage/GetPublishedFileDetails` web API. We COULD scrape the community page title for the misses only. The name is in `<title>` (or the og:title meta) on exactly the URL we already build as the fallback link. It's a handful of requests, cached like the rest. Caveat: the 429s in the transcript came from rapid unauthenticated requests; one request at a time with a browser User-Agent and a small delay is the way, and a failure just leaves the ID. IGNORE FOR NOW.

### 7. Treemap UI

- Squarified treemap, one tile per game: all games from all libraries combined, grouped by library with a toggle for mixed (see General features 1–3).
- Colour by library (fixed colour per library, stable across rescans). Hover tooltip with name, size, library, path, appid.
- Legend + a sortable table view as an alternative to the treemap.
- Actions on a game, both triggered from TypeScript:
  - **Open folder**: the `open_folder` command (Explorer, via the opener plugin on the Rust side, scope-checked).
  - **Uninstall**: `openUrl('steam://uninstall/' + appid)`.
- Refresh button (top right, feature 6); fast/accurate toggle.

### 7b. GUI implementation (Vue 3 + Vite)

- **Shared state:** a single store (Pinia, or a plain `reactive()` module) holds scan results, selection, the set of games expanded in the table, and scan progress. All views read from it, so selecting a tile highlights the table row and vice versa.
- **Components (initial):**
  - `sd-toolbar.vue`: fast/accurate toggle, grouped/mixed layout toggle; large **Refresh** button aligned top right; then the window's own minimize and close buttons (7e).
  - `sd-treemap.vue`: layout via `d3-hierarchy` (squarified), rendered on **Canvas** (handles thousands of Workshop tiles; allows WinDirStat-style cushion shading later). Hover tooltip, click to select, right-click for the context menu, double-click to expand the game in the table.
  - `sd-context-menu.vue`: right-click menu (View Workshop Items — only with items — Open folder, Uninstall…), built on the `popover` attribute and positioned at the cursor; also closes on Esc / outside click.
  - `sd-game-table.vue`: plain `<table>` with sortable columns (name, size, Workshop, playtime, last played, library), plus the expandable Workshop item rows (general feature 5). Rows are a flat list of game and item rows built in one computed property, so the `<table>` stays one `v-for` and the browser keeps the column widths. Virtualisation only if needed (TanStack Table as an option).
  - `sd-status-bar.vue`: totals, scan progress.
  - An about dialog built on native `<dialog>` / `showModal()`.
  - Filenames are kebab-case with an `Sd` component name, per CLAUDE.md.
- **Native HTML/CSS first:** `<dialog>`, the `popover` attribute for menus, CSS grid for layout (toolbar / resizable treemap–table split / status bar). No UI component library initially.
- **No more backend bridge.** `ui/src/api/bridge.ts` shrinks to wiring: it builds the Tauri host (`core/hosts/tauri.ts`), calls `scan(host, options)` from `core/scanner.ts` in the page, and exposes the three opener actions (open folder, uninstall, Workshop page). There is no IPC round trip for a scan and no `pywebviewready`-style wait; `hasBackend()` is a synchronous check for `window.__TAURI_INTERNALS__`.
- **Types come from `core/models.ts`.** `ui/src/api/types.ts` goes away: the UI imports the same types the scanner produces, so a change to the data shape is a compile error rather than a runtime surprise.
- **Scan progress** reaches the store through the callback `scan()` already takes — no global `window.sdScanProgress`, no event listener in the UI. The Tauri host is the only thing that knows `scan-progress` events exist.
- **Styling:** Tailwind v4 (the Vite plugin, no `tailwind.config.js`) for layout utilities; component styling in `src/styles/components/*.css` using the `sd-` class names, not `<style scoped>` blocks, so the names stay greppable in one place.
- **Dev without the backend:** in a plain browser `hasBackend()` is false and the store falls back to `ui/fixture.json` (`node tools/steamdirstats-cli.ts --json > ui/fixture.json`, gitignored since it lists a real library). It sits outside `src/` so it is served in dev but never bundled into a release build.
- **Vite config:** at the project root, with `root: 'ui'`, `strictPort: true` on port 5173 (the port `tauri.conf.json` points the window at) and `clearScreen: false` so the Rust compiler's output is not wiped. Tauri serves the build over its own protocol, so `base: './'` is no longer needed.

### 7c. Removing a Workshop item

The **View on Steam Workshop** link on an item row opens the item's page in the Steam client, where **Unsubscribe** removes it.

- Steam exposes **no** `steam://` action that unsubscribes from, or deletes, a single Workshop item. The only documented route is `ISteamUGC::UnsubscribeItem`, which a game calls through the Steamworks SDK from inside its own process — not something an external tool can do.
- So the link opens `steam://url/CommunityFilePage/<itemid>`, which is documented, and **Unsubscribe** is one click away on that page. Steam then deletes the files itself (after the game exits, for a game that is running).
- The label says what the link actually does rather than promising a removal we cannot perform. It is styled dark red all the same, because unsubscribing is where it leads; this adds a `--sd-danger` token to `styles/base.css`, which has none yet.
- Deleting the folder ourselves is deliberately rejected: while the user is still subscribed Steam re-downloads the item, and the entry left in `workshop/appworkshop_<appid>.acf` makes our own sizes wrong until Steam rewrites it.
- The URL is built in TypeScript from the numeric item id and opened with `openUrl()`; the opener's permission scope only allows `steam://*`, so a bad id cannot turn into some other scheme.
- The item also carries a `url` from the scan (`workshop_items[].url`, a `steamcommunity.com` address). That is the fallback for a browser, not what this link uses: in the app we want the page inside Steam, where the Unsubscribe button is.
- Nothing refreshes by itself: the user clicks **Refresh** afterwards, as after a game uninstall.

### 7d. Permissions and file scope

Tauri denies everything that is not explicitly allowed, and the folders we need are only known at runtime — the libraries live on whatever drives this PC has. So the scope is **widened as the scan discovers it**:

1. The app starts with **no file access at all**.
2. `data_dir()` allows the one folder our own files live in (§9), and nothing else next to the exe.
3. `core/locate.ts` reads `SteamPath` from the registry and calls `allowFolder()` on the candidate, which is `allow_steam_folder(path)` in Rust: it allows the folder only if it really contains a `steamapps` directory (`app.fs_scope().allow_directory(&folder, true)`). A candidate that is not a Steam folder is refused and skipped.
4. TypeScript reads `libraryfolders.vdf` through the fs plugin and gets the library paths.
5. `core/libraries.ts` calls `allowFolder()` on each one, which passes the same check. Otherwise the front end could use it to unlock any folder on the machine.
6. From then on the fs plugin can read anything under those libraries, and `dir_sizes` refuses any path outside them.

- `capabilities/default.json` lists the commands the window may call (`fs:allow-read-text-file`, `fs:allow-read-file`, `fs:allow-read-dir`, `fs:allow-exists`, `fs:allow-stat`, `fs:allow-write-text-file`, `http:default`, `opener:allow-open-url`) with **no static filesystem scope**: an allowed command with an empty scope still reads nothing.
- The http scope is narrowed to `https://api.steampowered.com/*`; the opener's url scope to `steam://*`. There is no `opener:allow-open-path`: folders are opened by the `open_folder` command, which checks the runtime fs scope first.
- Runtime grants are **not persisted** — they are rebuilt on every launch, which is what we want: a library that has gone away is never allowed again.
- `dir_sizes` checks the scope itself (`fs_scope().is_allowed`) before walking, so the one command that could measure the whole disk is held to the same folders as the reads.
- Validation lives in Rust rather than TypeScript, because the webview is the untrusted side of this boundary.

### 7e. Custom title bar

The window is undecorated (`"decorations": false` in `tauri.conf.json`) and the toolbar row doubles as its title bar: app icon, title, then the app's own buttons and, after a separator, minimize and close. There is no maximize button — double-clicking the row still toggles maximize, which is what Windows does and what §8 already saves.

- **The frame is kept, only the caption is ours.** `"shadow": true` alongside `"decorations": false` leaves Windows 11 its drop shadow, its thin border and its rounded corners, and — the reason it matters here — its resize borders: tao hit-tests the top edge itself and leaves the other three to the DWM frame, so an undecorated window with a shadow stays resizable from every edge. `"decorations": false` on its own gives a bare rectangle that cannot be resized by dragging.
- **Dragging** is `data-tauri-drag-region="deep"` on the `<header>`: Tauri's injected script walks up from the click and treats buttons as clickable, so the whole row drags except the buttons. It needs `core:window:allow-start-dragging`; the double-click maximize is `allow-internal-toggle-maximize`, which `core:default` already grants. The row is `user-select: none` so dragging the window does not sweep a text selection along with it.
- **The buttons** call `minimize()` and `close()` in `ui/src/lib/window-state.ts` — `close()`, not `destroy()`, so the close request still runs the handler that saves the placement (§8). Minimize needs `core:window:allow-minimize`. They are rendered only when `hasBackend()` is true: in a browser there is no window to act on.
- **Icons** are inline SVG strokes rather than a font or an icon package: a chevron down for minimize, a cross in `--sd-danger` for close, which turns white on a red fill on hover.
- **The app icon** is imported through the `@icons` alias (`src-tauri/icons/`) rather than copied into `ui/public/`, so the title bar shows whatever icon the window and the exe carry, including the day the placeholder is replaced.

### 8. Window state persistence

- Remember window position, size, and maximized state between runs.
- Done in TypeScript with `@tauri-apps/api/window` (`outerPosition()`, `innerSize()`, `isMaximized()`, `setPosition()`, `setSize()`, `maximize()`), saved into `settings.json` (§9). `tauri-plugin-window-state` is deliberately not used: it writes its own file into the OS config folder, which breaks the portable single-file story.
- The window is configured `"visible": false` and shown by the front end once the saved placement has been applied, so there is no visible jump from the default position.
- **Attaching `onCloseRequested` makes the page responsible for closing the window.** The API wrapper calls `destroy()` itself once the handler returns, so the capability file must allow `core:window:allow-destroy` — without it the title bar's close button runs the save handler and then does nothing, and the app can only be killed from Task Manager. The same applies to `allow-set-focus`, `allow-center` and `allow-close`: every window call the front end makes needs its own permission, and a missing one throws at runtime rather than failing the build.
- Restore failures are logged, not swallowed: showing the window is in its own try, because a window left hidden cannot be recovered from the UI.
- Keep the restored size while maximized (maximized is a flag of its own), and ignore the minimized state.
- Pull off-screen windows (unplugged monitor) back onto a visible screen: compare the saved position with `availableMonitors()` and centre the window when no monitor contains it.
- Verify behaviour with display scaling (125%/150%): positions come back physical and sizes logical, so convert once and store one kind consistently.

### 9. Portable settings location

The app is portable: settings live next to the executable by default.

- **App folder:** the folder of `current_exe()`, returned by the `data_dir()` command (the fs plugin has no notion of it). Under `tauri dev` that is `src-tauri/target/debug/`, which is gitignored and fine for development.
- **Resolution order** (decided in Rust, since it is the side that can test writability — by writing a probe file, because Windows permissions are not something to predict from metadata — and grant the scope):
  1. If `settings.json` already exists in the app folder, use it.
  2. Else, if the app folder is writable, create it there.
  3. Otherwise (e.g. exe placed in `C:\Program Files\`) fall back to `%APPDATA%\SteamDirStats\settings.json`.
- The Workshop item-name cache (`workshop-names.json`) follows the same location.
- The CLI's host resolves the same two candidates itself, from the working directory rather than an exe folder, so a scan from the project root shares the name cache with a dev build.
- Merge on write (read, merge, write) so one writer cannot wipe another's keys; the merge rule is in `core/settings.ts` and shared by both hosts.

### 10. Per-account data (which Steam account to use)

Installed games and their sizes are shared by all accounts on the PC, but some data is stored per Steam account under `<Steam>/userdata/<accountid>/` (e.g. playtime and last played in `config/localconfig.vdf`).

- **Use the account that signed in most recently**, with no account picker in the UI. Read `<Steam>/config/loginusers.vdf`: each entry is keyed by SteamID64; pick the one with `"MostRecent" "1"`, falling back to the highest `Timestamp`. On the dev machine `MostRecent` is absent entirely, so the timestamp fallback is the normal path, not an edge case.
- Convert SteamID64 to the `userdata` folder name: `accountid = steamid64 - 76561197960265728`. SteamID64 values exceed `Number.MAX_SAFE_INTEGER`'s comfort zone for arithmetic correctness, so parse them as `BigInt` and convert to a number only after subtracting.
- Ignore `userdata/0` (the offline/anonymous folder).
- If no account or no `userdata` folder is found, skip per-account data; size scanning still works.
- Playtime is always collected (one small file, silent on failure) from `userdata/<accountid>/config/localconfig.vdf` → `Software/Valve/Steam/apps/<appid>`: `Playtime` and `Playtime2wks` in **minutes**, `LastPlayed` as a Unix timestamp. Old entries use `0` or `86400` (1970-01-02) to mean "never played"; anything before 2003 is treated as no date.
- This is the local cache Steam writes as it runs, so it can lag the server by a few minutes. Display matches Steam: hours rounded **up** to one decimal (35443 min = 590.72 h, which Steam shows as 590.8), and a date like `Nov 12`, with the year added outside the current year.

## Known caveats

- Non-Steam shortcuts are not in the manifests (out of scope).
- Workshop content left behind by an uninstalled game (an `appworkshop_<appid>.acf` with no matching `appmanifest`) belongs to no game, so it is not counted. On the dev machine this was 3.4 MB in total, so it is not worth a report of its own.
- The same goes for **game folders** left behind in `steamapps/common/`: a folder with no `appmanifest` belongs to no game, so neither mode counts it, and a scan is therefore smaller than what Explorer shows for `common/`. Measured here on `D:\Steam`: Explorer 235 GB against the scan's 232.9 GB, the difference being ten orphan folders (MTGA 1.7 GB, Sacred 2 Gold 0.7 GB, the rest a few MB of empty shells). This is correct — those bytes belong to no installed game — but it is the first thing to check when a library total looks low against Explorer.
- Exact on-disk size (cluster size, NTFS compression, hard links) only matters for high accuracy; logical file sizes are fine for v1.
- A fast scan reads a few dozen small files over the IPC bridge, which is fine. Anything that would read *per file* belongs in Rust (§5), and that rule is the main thing to watch as features are added.
- `account.steamid64` is a **string** in the JSON. It is larger than `Number.MAX_SAFE_INTEGER`, so a number would quietly lose its last digits (the Python version's JSON did). Nothing displays it, but it is exact.
- A folder whose name ends in a dot (`'.'.`, seen in two games here) cannot be opened through the normal Win32 path rules, so the Python scanner silently skipped it. Node and Rust reach it, so the TypeScript scanner counts those files: ~100 bytes more than the Python one across this machine, and it is the more accurate of the two.
- The CLI's accurate scan is a little slower than the app's: Node pays one `lstat` per file where `walkdir` does not. Measured here: 1.9 s against 1.5 s for the Python version it replaces, close enough not to matter for a dev tool.
- The exe needs the **WebView2 runtime**, which ships with Windows 11 and with up-to-date Windows 10; the installer can bootstrap it, while a bare portable exe assumes it is present.
- Unsigned exes can still trigger antivirus or SmartScreen warnings; code signing is the only real fix.


## About Dialog

- Modal dialog, a small close button in the top right (reuse the one from the main window)
- ESC closes the modal

Contents of the dialog (centered):

```text
     SteamDirStats v1.0

     by fabd
     
     Source code on [Github]
```

- have a blue/cyan gradient cycle through the SteamDirStats name.

Implementation (`ui/src/components/dialogs/sd-about-dialog.vue`):

- Native `<dialog>` with `showModal()`, so the centring, the backdrop and Esc
  are the browser's; `app.vue` owns the element and calls `open()` on it.
- The trigger is an info button in the title bar, left of the window buttons
  (§7e). The dialog is **not** nested in that row: the row is the drag region
  and `data-tauri-drag-region="deep"` walks up from whatever was clicked, so a
  dialog inside it would drag the window instead of taking the click.
- The close button is the title bar's own red cross, reusing its classes
  rather than a second one styled from scratch.
- The version is injected by Vite's `define` as `__APP_VERSION__`, read from
  `src-tauri/tauri.conf.json` — the same number the exe carries, so the dialog
  cannot drift from the build.
- The gradient is `background-clip: text` over a background three times the
  width of the name, slid across it by a keyframe animation; it is held still
  under `prefers-reduced-motion`, being decoration rather than information.
- **Github** hands `https://github.com/fabd/SteamDirStats` to `openUrl()`, so
  it opens in the user's browser. That one URL is added to the opener's url
  scope, which until now allowed only `steam://*`. In a plain browser there is
  no shell to hand it to and `bridge.ts` opens a tab instead.
