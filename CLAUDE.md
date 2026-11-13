# TECH REQUIREMENTS

## Python

- Python and `uv` are installed and available in Git Bash on Windows.
- If a script needs third-party packages, use `uv` and keep everything local to the project folder:
  - Create the environment in `.venv` (`uv venv`) if it doesn't exist.
  - Add dependencies with `uv add <package>` (in a project with `pyproject.toml`) or `uv pip install <package>`.
  - Run scripts with `uv run script.py` so the right environment is used without manual activation.
- Never install packages into the global Python. Don't use plain `pip install` outside a `.venv`.
- If activating a venv manually in Git Bash, use `source .venv/Scripts/activate`.
- Add `.venv/` to `.gitignore`. Commit `pyproject.toml` and `uv.lock`.
