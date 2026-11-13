import os
import struct
import tempfile
import unittest

from steamdirstats import appinfo


def build_appinfo(apps, magic=appinfo.MAGIC_V29):
    """Build a binary appinfo.vdf holding {appid: name} for testing."""
    keys = ["appid", "common", "name", "type", "size"]
    index = {key: i for i, key in enumerate(keys)}

    def key(name):
        if magic == appinfo.MAGIC_V29:
            return struct.pack("<I", index[name])
        return name.encode() + b"\x00"

    body = b""
    for appid, name in apps.items():
        kv = b"\x02" + key("appid") + struct.pack("<I", appid)  # a root-level int32
        kv += b"\x00" + key("common")
        kv += b"\x01" + key("type") + b"Game\x00"
        if name is not None:
            kv += b"\x01" + key("name") + name.encode("utf-8") + b"\x00"
        kv += b"\x07" + key("size") + struct.pack("<Q", 1)  # a uint64 we must skip
        kv += b"\x08"  # end of common
        kv += b"\x08"  # end of the implicit root map
        header = struct.pack("<IIQ", 0, 1700000000, 0) + b"s" * 20 + struct.pack("<I", 1)
        if magic != appinfo.MAGIC_V27:
            header += b"b" * 20
        entry = header + kv
        body += struct.pack("<II", appid, len(entry)) + entry
    body += struct.pack("<I", 0)  # appid 0 ends the file

    out = struct.pack("<II", magic, 1)
    if magic == appinfo.MAGIC_V29:
        table = struct.pack("<I", len(keys)) + b"".join(k.encode() + b"\x00" for k in keys)
        out += struct.pack("<q", len(out) + 8 + len(body)) + body + table
    else:
        out += body
    return out


class AppInfoTest(unittest.TestCase):
    def test_names_with_string_table(self):
        data = build_appinfo({10: "Last Evil", 20: "No Man's Sky"})
        self.assertEqual(appinfo.parse_names(data), {10: "Last Evil", 20: "No Man's Sky"})

    def test_names_legacy_formats(self):
        for magic in (appinfo.MAGIC_V27, appinfo.MAGIC_V28):
            with self.subTest(magic=hex(magic)):
                data = build_appinfo({10: "Quake"}, magic=magic)
                self.assertEqual(appinfo.parse_names(data), {10: "Quake"})

    def test_app_without_a_name_is_skipped(self):
        self.assertEqual(appinfo.parse_names(build_appinfo({10: None})), {})

    def test_unknown_or_truncated_file(self):
        self.assertEqual(appinfo.parse_names(b""), {})
        self.assertEqual(appinfo.parse_names(struct.pack("<II", 0x07564400, 1)), {})
        truncated = build_appinfo({10: "Quake", 20: "Portal"})[:-10]
        self.assertEqual(appinfo.parse_names(truncated), {})

    def test_read_names_without_a_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(appinfo.read_names(tmp), {})
            os.makedirs(os.path.join(tmp, "appcache"))
            with open(os.path.join(tmp, "appcache", "appinfo.vdf"), "wb") as f:
                f.write(build_appinfo({42: "Half-Life"}))
            self.assertEqual(appinfo.read_names(tmp), {42: "Half-Life"})


if __name__ == "__main__":
    unittest.main()
