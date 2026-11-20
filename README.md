# SteamDirStats

A WinDirStat-style view of the disk space used by installed Steam games, across all Steam libraries. Useful when you have a bunch of games installed on multiple libraries and you want to free space, in particular with Workshop items that can be quite large (eg. SteamVR).

- status bar displays the total space taken by all games across all libraries combined
- view workshop items for a game, by size descending; a "View on Steam Workshop" link takes you to the page in Steam where you can unsubscribe the item
- treemap view to see at a glance games that take the most space, grouped by library or mixed together
- context menu with options: Uninstall, and Browse local files
- the app does NOT touch any Steam files, the Uninstall option simply triggers the uninstall dialog in Steam where you can confirm/cancel

See [plan.md](plan.md) for the full plan.

## App Info

- Built with Rust/Tauri, GUI in TypeScript/HTML/CSS
- Portable app
  - Settings are written to `settings.json` next to the executable
  - falling back to `%APPDATA%\SteamDirStats\` when that folder is read-only

## Development

Requires Node.js 22.18+ (it runs the TypeScript directly), Rust and the
Microsoft C++ Build Tools. Commands are for Git Bash.

```bash
npm install
```

Create the app icons

```bash
npx tauri icon app-icon.png
```

One `package.json` at the project root covers the UI, the CLI and the Tauri
CLI. The Rust side (`src-tauri/`) builds itself on the first `npx tauri dev`.

## Dev & Release Builds

Development, starts the Vite dev server and runs the app in debug mode

```bash
npx tauri dev                        # Vite dev server + the app window, hot reload
```

Run the UI alone, in a browser, on `ui/fixture.json` (instead of the real Steam installation):

```
npm run dev                          # 
```

Build the app => `src-tauri/target/release/SteamDirStats.exe`

```bash
npx tauri build
```

To screenshot what the window is showing (the page, not the window frame), in
two terminals:

```bash
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" npx tauri dev
node tools/shot.mjs window.png       # waits for the window, then writes the PNG
```

Either order works: the script polls for up to 30 seconds.

## Command-line scanner

A CLI version with no build step and no dependencies. Uses the same `core/` the GUI app runs, on the Node host instead of the Tauri one.

```bash
node tools/steamdirstats-cli.ts                     # list games by library
node tools/steamdirstats-cli.ts --json              # same data as JSON
node tools/steamdirstats-cli.ts --accurate          # walk the folders, not the manifests
node tools/steamdirstats-cli.ts --steam-path "D:/Steam"
node tools/steamdirstats-cli.ts --json > ui/fixture.json   # refresh the dev fixture

npm test                                            # node --test over core/
npm run typecheck                                   # all three tsconfigs
```

## Layout

| Folder       | What it holds                                                        |
| ------------ | -------------------------------------------------------------------- |
| `core/`      | All the logic, host-agnostic: no `node:*`, no `@tauri-apps/*`, no DOM |
| `core/hosts/`| The two adapters (`node.ts`, `tauri.ts`) that give `core/` its IO     |
| `ui/`        | The Vue 3 + Vite app                                                  |
| `tools/`     | The CLI and the screenshot helper                                     |
| `src-tauri/` | The Rust shell: five commands and three plugins                       |
