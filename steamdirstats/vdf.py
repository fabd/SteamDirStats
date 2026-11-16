"""Tolerant parser for Valve's text KeyValues format (.vdf / .acf files).

Example input:

    "libraryfolders"
    {
        "0"
        {
            "path"    "C:\\Program Files (x86)\\Steam"
        }
    }

Parsed into nested dicts of strings. Keys are lower-cased, because Steam has
not always been consistent about key case across versions.
"""

from __future__ import annotations

from typing import Iterator

_ESCAPES = {"n": "\n", "t": "\t", "\\": "\\", '"': '"'}


def load(path: str) -> dict:
    """Parse a VDF file. Raises OSError if the file cannot be read."""
    with open(path, encoding="utf-8", errors="replace") as f:
        return loads(f.read())


def loads(text: str) -> dict:
    """Parse VDF text into nested dicts. Never raises on malformed input."""
    root: dict = {}
    stack = [root]
    key = None

    for token, quoted in _tokens(text):
        if not quoted and token == "{":
            if key is None:
                continue  # stray brace, ignore
            existing = stack[-1].get(key)
            child = existing if isinstance(existing, dict) else {}
            stack[-1][key] = child
            stack.append(child)
            key = None
        elif not quoted and token == "}":
            if len(stack) > 1:
                stack.pop()
            key = None
        elif not quoted and token.startswith("[") and token.endswith("]"):
            continue  # platform conditional such as [$WIN32], ignore
        elif key is None:
            key = token.lower()
        else:
            stack[-1][key] = token
            key = None

    return root


def _tokens(text: str) -> Iterator[tuple[str, bool]]:
    """Yield (token, was_quoted) pairs, skipping whitespace and // comments."""
    i, n = 0, len(text)
    if text.startswith("\ufeff"):
        i = 1

    while i < n:
        c = text[i]
        if c.isspace():
            i += 1
        elif c == "/" and text.startswith("//", i):
            end = text.find("\n", i)
            i = n if end == -1 else end + 1
        elif c in "{}":
            yield c, False
            i += 1
        elif c == '"':
            i += 1
            chars = []
            while i < n and text[i] != '"':
                if text[i] == "\\" and i + 1 < n:
                    nxt = text[i + 1]
                    chars.append(_ESCAPES.get(nxt, "\\" + nxt))
                    i += 2
                else:
                    chars.append(text[i])
                    i += 1
            i += 1  # closing quote
            yield "".join(chars), True
        else:
            start = i
            while i < n and not text[i].isspace() and text[i] not in '{}"':
                i += 1
            yield text[start:i], False
