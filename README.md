# SteamDirStats

A WinDirStat-style view of the disk space used by installed Steam games, across all Steam libraries. See [plan.md](plan.md) for the full plan.

## Setting up

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
CLI. The Rust side (`src-tauri/`) builds itself on the first `tauri dev`.

## The desktop app

```bash
npx tauri dev                        # Vite dev server + the app window, hot reload
npx tauri build                      # -> src-tauri/target/release/SteamDirStats.exe

npm run dev                          # the UI alone, in a browser, on ui/fixture.json
```

Settings are written to `settings.json` next to the executable, falling back to
`%APPDATA%\SteamDirStats\` when that folder is read-only.

To screenshot what the window is showing (the page, not the window frame), in
two terminals:

```bash
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" npx tauri dev
node tools/shot.mjs window.png       # waits for the window, then writes the PNG
```

Either order works: the script polls for up to 30 seconds.

## Command-line scanner

The same `core/` the app runs, on the Node host instead of the Tauri one. No
build step and no dependencies.

```bash
node tools/steamdirstats-cli.ts                     # list games by library
node tools/steamdirstats-cli.ts --json              # same data as JSON
node tools/steamdirstats-cli.ts --accurate          # walk the folders, not the manifests
node tools/steamdirstats-cli.ts --steam-path "D:/Steam"
node tools/steamdirstats-cli.ts --json > ui/fixture.json   # refresh the dev fixture

npm test                                            # node --test over core/
npm run typecheck                                   # all three tsconfigs
```

From other TypeScript:

```ts
import { createNodeHost } from './core/hosts/node.ts';
import { scan } from './core/scanner.ts';

const { data } = await scan(createNodeHost());

for (const library of data.libraries) {
  console.log(library.path, library.size_on_disk);

  for (const game of library.games) {
    console.log('  ', game.name, game.total_size);
  }
}
```

## Layout

| Folder       | What it holds                                                        |
| ------------ | -------------------------------------------------------------------- |
| `core/`      | All the logic, host-agnostic: no `node:*`, no `@tauri-apps/*`, no DOM |
| `core/hosts/`| The two adapters (`node.ts`, `tauri.ts`) that give `core/` its IO     |
| `ui/`        | The Vue 3 + Vite app                                                  |
| `tools/`     | The CLI and the screenshot helper                                     |
| `src-tauri/` | The Rust shell: five commands and three plugins                       |
