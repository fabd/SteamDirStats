# CLAUDE.md

## Documentation

- docs/plan.md : describes the application
- docs/todos.md : checklist for implementation

## Coding Standards

- Use 2-space indentation for TypeScript, CSS and Vue templates
- Use 4 spaces per indentation level for Rust

### core/

All the logic lives in `core/`, which runs in two hosts: the app window and
Node (the CLI). Keeping it host-agnostic is what makes that possible.

- **No `node:*`, no `@tauri-apps/*`, no DOM** in `core/*.ts`. IO goes through
  the `Host` interface in `core/host.ts`; the adapters are `core/hosts/node.ts`
  and `core/hosts/tauri.ts`. `tsconfig.core.json` enforces this by giving the
  folder neither Node nor DOM types, so a stray `window` fails to compile.
- Node runs the TypeScript directly, so `core/` and `tools/` must stay
  **erasable**: no enums, no namespaces, no parameter properties, and relative
  imports spell the `.ts` extension (`./vdf.ts`).
- Tests are `core/*.test.ts` under `node --test`; shared fixtures are in
  `core/test-support.ts` (Node-only, excluded from `tsconfig.core.json`).

### Rust

- `src-tauri/` is a thin shell: only what TypeScript cannot do (the registry,
  the runtime file-scope grants, the directory walk, free disk space, the exe
  folder). Before adding a command, check the work cannot live in `core/`.
- `cargo fmt` and `cargo clippy` from `src-tauri/`.
- A new command goes in `commands.rs` and must be registered in `lib.rs`.
- A new plugin capability goes in `src-tauri/capabilities/default.json`, as
  narrowly scoped as the feature allows.

### CSS

- use modern syntax with nested CSS
  - keep CSS selector specificity as low as possible
  - use nesting only for pseudo-classes and pseudo-elements (eg. :hover) to reduce repetition of the selectors
- prefix CSS classes with `sd-` (eg. `sd-Dialog` for a `Dialog` component)
- use the pattern `sd-(component name)-(descendant)--(modifier)` (eg. `sd-Dialog-title`)
- BEM modifier `--` for component variants, eg. `sd-Dialog--small`
- use `is-` prefix for runtime state (eg. `is-active`)
- **Tailwind**: prefer using Tailwind for layout utilities while keeping component-specific styling (colors, borders, backgrounds) in custom CSS files

### TypeScript

- use kebab-case for filenames (eg. root-bundle.ts)
- use PascalCase for classes (eg. KoDialog)
- use alias `@` in imports in place of `src` (eg. `src/app/file` => `@/app/file`)
- always end statements with a semicolon; don't rely on ASI
- braces required for all control structures
- let code breathe
  - empty line before a conditional
  - empty line to separate logical blocks of code
  - empty line before the return statement, unless it is the only statement
- booleans named with prefix `is` eg. `isOpen`

After modifying any TypeScript or Vue code, run `npm run typecheck` (`vue-tsc -b`) from the `ui/` directory and fix any reported errors.

### Vue

- use the Options API
- use `Sd` prefix for Vue components (eg. SdTreeView.vue)
