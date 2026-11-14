# CLAUDE.md

## Documentation

- plan.md : describes the application
- todos.md : checklist for implementation

## Coding Standards

- Use 2-space indentation for TypeScript, CSS and Vue templates
- Use 4 spaces per indentation level for Python

### Python

- Python and `uv` are installed and available in Git Bash on Windows.
- If a script needs third-party packages, use `uv` and keep everything local to the project folder:
  - Create the environment in `.venv` (`uv venv`) if it doesn't exist.
  - Add dependencies with `uv add <package>` (in a project with `pyproject.toml`) or `uv pip install <package>`.
  - Run scripts with `uv run script.py` so the right environment is used without manual activation.
- Never install packages into the global Python. Don't use plain `pip install` outside a `.venv`.
- If activating a venv manually in Git Bash, use `source .venv/Scripts/activate`.
- Add `.venv/` to `.gitignore`. Commit `pyproject.toml` and `uv.lock`.

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
