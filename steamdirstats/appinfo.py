"""Read app names from Steam's binary appcache/appinfo.vdf.

Some appmanifest files store a placeholder name (``appid_823910``) because the
real name was not known when Steam wrote the manifest. Steam itself shows the
name from this cache, so we use it as a fallback.

The file is a binary KeyValues blob, one entry per app, with a header per entry
and (since version 0x29) a string table at the end holding every key name.
The format has changed a few times; anything unexpected makes us give up and
return what we have so far, since this is only a nicety.
"""

from __future__ import annotations

import os
import struct

MAGIC_V27 = 0x07564427  # no binary sha1 in the entry header
MAGIC_V28 = 0x07564428  # adds the binary sha1
MAGIC_V29 = 0x07564429  # adds the string table (keys are indices into it)

# Binary KeyValues value types
_TYPE_MAP = 0x00
_TYPE_STRING = 0x01
_TYPE_INT32 = 0x02
_TYPE_FLOAT32 = 0x03
_TYPE_POINTER = 0x04
_TYPE_WIDESTRING = 0x05
_TYPE_COLOR = 0x06
_TYPE_UINT64 = 0x07
_TYPE_END = 0x08
_TYPE_INT64 = 0x0A
_TYPE_END_ALT = 0x0B

_FIXED_HEADER = (
    4 + 4 + 8 + 20 + 4
)  # state, last updated, token, text sha1, change number


def read_names(steam_path: str) -> dict[int, str]:
    """Return {appid: name} from <Steam>/appcache/appinfo.vdf.

    Returns an empty dict if the cache is missing or cannot be parsed.
    """
    path = os.path.join(steam_path, "appcache", "appinfo.vdf")
    try:
        with open(path, "rb") as handle:
            data = handle.read()
    except OSError:
        return {}
    return parse_names(data)


def parse_names(data: bytes) -> dict[int, str]:
    """Return {appid: name} parsed from the contents of an appinfo.vdf."""
    names: dict[int, str] = {}
    try:
        magic, _universe = struct.unpack_from("<II", data, 0)
    except struct.error:
        return names
    if magic not in (MAGIC_V27, MAGIC_V28, MAGIC_V29):
        return names

    offset = 8
    string_table: list[str] | None = None
    if magic == MAGIC_V29:
        (table_offset,) = struct.unpack_from("<q", data, offset)
        offset += 8
        string_table = _read_string_table(data, table_offset)
        if string_table is None:
            return names

    header_size = _FIXED_HEADER + (20 if magic != MAGIC_V27 else 0)
    while True:
        try:
            appid, size = struct.unpack_from("<II", data, offset)
        except struct.error:
            return names
        offset += 8
        if appid == 0:
            return names
        end = offset + size
        if size < header_size or end > len(data):
            return names
        name = _read_common_name(data, offset + header_size, end, string_table)
        if name:
            names[appid] = name
        offset = end


def _read_string_table(data: bytes, offset: int) -> list[str] | None:
    try:
        (count,) = struct.unpack_from("<I", data, offset)
    except struct.error:
        return None
    offset += 4
    strings = []
    for _ in range(count):
        end = data.find(b"\x00", offset)
        if end < 0:
            return None
        strings.append(data[offset:end].decode("utf-8", "replace"))
        offset = end + 1
    return strings


def _read_common_name(
    data: bytes, offset: int, end: int, string_table: list[str] | None
) -> str | None:
    """Walk one app's KeyValues blob and return its ``common/name``, if any.

    The blob's outermost map is implicit: its fields start right away and one
    end marker closes it, so we start a level deep.
    """
    depth = 1
    path: list[str] = []
    while offset < end:
        value_type = data[offset]
        offset += 1
        if value_type in (_TYPE_END, _TYPE_END_ALT):
            depth -= 1
            if path:
                path.pop()
            if depth <= 0:
                return None
            continue

        key, offset = _read_key(data, offset, string_table)
        if key is None:
            return None

        if value_type == _TYPE_MAP:
            depth += 1
            path.append(key)
            continue
        if value_type == _TYPE_STRING:
            stop = data.find(b"\x00", offset, end)
            if stop < 0:
                return None
            value = data[offset:stop].decode("utf-8", "replace")
            offset = stop + 1
            if key == "name" and path[-1:] == ["common"]:
                return value or None
            continue

        width = _value_width(value_type, data, offset, end)
        if width is None:
            return None
        offset += width
    return None


def _read_key(
    data: bytes, offset: int, string_table: list[str] | None
) -> tuple[str | None, int]:
    if string_table is not None:
        try:
            (index,) = struct.unpack_from("<I", data, offset)
        except struct.error:
            return None, offset
        if index >= len(string_table):
            return None, offset
        return string_table[index], offset + 4
    end = data.find(b"\x00", offset)
    if end < 0:
        return None, offset
    return data[offset:end].decode("utf-8", "replace"), end + 1


def _value_width(value_type: int, data: bytes, offset: int, end: int) -> int | None:
    if value_type in (_TYPE_INT32, _TYPE_FLOAT32, _TYPE_POINTER, _TYPE_COLOR):
        return 4
    if value_type in (_TYPE_UINT64, _TYPE_INT64):
        return 8
    if value_type == _TYPE_WIDESTRING:
        stop = data.find(b"\x00\x00", offset, end)
        if stop < 0:
            return None
        return stop - offset + 2
    return None
