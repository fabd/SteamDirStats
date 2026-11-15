# CLAUDE.md

## Documentation

- plan.md : describes the application
- todos.md : checklist for implementation

## Coding Standards

- Use 2-space indentation for TypeScript, CSS and Vue templates
- Use 4 spaces per indentation level for Python

### Python

- Python and `uv` are installed and available in Git Bash on Windows.
- **Never install packages into the global Python.** Third-party packages always go in a project-local `.venv`; don't use plain `pip install` outside one.
- This project uses a plain venv, declared in `requirements.txt`:
  - `python -m venv .venv`, then `pip install -r requirements.txt` with it activated.
  - Pin versions in `requirements.txt` and say which are build-only.
  - Run with the venv activated, or call `.venv/Scripts/python.exe` directly.
- `uv` is optional, for a one-off script or anything wanting a lockfile: `uv venv`, `uv add <package>` (with a `pyproject.toml`) or `uv pip install <package>`, and `uv run script.py` to skip activation. Commit `pyproject.toml` and `uv.lock` when used.
- If activating a venv manually in Git Bash, use `source .venv/Scripts/activate`.
- Add `.venv/` to `.gitignore`.

### CSS

- prefix CSS classes with `sd-` (eg. `sd-Dialog` for a `Dialog` component)
- use the pattern `sd-(component name)-(descendant)--(modifier)` (eg. `sd-Dialog-title`)
- BEM modifier `--` for component variants, eg. `sd-Dialog--small`
- use `is-` prefix for runtime state (eg. `is-active`)
- **Tailwind**: prefer using Tailwind for layout utilities while keeping component-specific styling (colors, borders, backgrounds) in custom CSS files

### TypeScript

- use kebab-case for filenames (eg. root-bundle.ts)
- use PascalCase for classes (eg. KoDialog)
- use alias `@` in imports in place of `src` (eg. `src/app/file` => `@/app/file`)

### Vue

- use the Options API
- use `Sd` prefix for Vue components (eg. SdTreeView.vue)
