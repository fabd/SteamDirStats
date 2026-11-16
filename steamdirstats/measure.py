"""Measure what is actually on disk, for accurate mode.

Fast mode trusts the sizes Steam wrote into the manifests. They are usually
right, but they can be stale (Last Evil's Workshop manifest was 4.7 MB behind
what its item folders really hold) and they say nothing about files Steam did
not put there. Accurate mode walks the folders instead.

Sizes are logical file sizes, not size on disk: cluster rounding, NTFS
compression and hard links are out of scope for v1 (see plan.md).
"""

from __future__ import annotations

import os
from typing import Callable

# Called with (games measured so far, games in total, name of the current game).
ScanProgress = Callable[[int, int, str], None]


def folder_size(path: str) -> int | None:
    """Total size of every file under `path`, or None if it cannot be read.

    Never raises: a folder that disappears mid-walk (Steam updating a game) or
    one we may not read is skipped, and the rest is still counted. Junctions
    and symlinks are not followed, so content shared between libraries is not
    counted twice.
    """
    if not os.path.isdir(path):
        return None

    total = 0
    stack = [path]
    # Folders are opened one at a time (not held open while recursing), so a
    # deep tree costs one directory handle, not one per level.
    while stack:
        try:
            with os.scandir(stack.pop()) as entries:
                for entry in entries:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            stack.append(entry.path)
                        else:
                            total += entry.stat(follow_symlinks=False).st_size
                    except OSError:
                        continue  # vanished, or not ours to read
        except OSError:
            continue  # same, for the folder itself
    return total
