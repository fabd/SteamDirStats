import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout

from steamdirstats import SteamNotFoundError, scan
from steamdirstats.__main__ import format_size, main


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def manifest(appid, name, installdir, size, flags=4):
    return f'''"AppState"
{{
    "appid"        "{appid}"
    "name"         "{name}"
    "StateFlags"   "{flags}"
    "installdir"   "{installdir}"
    "LastUpdated"  "1700000000"
    "SizeOnDisk"   "{size}"
}}
'''


def vdf_path(p):
    return p.replace("\\", "\\\\")


class ScanTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = self.tmp.name
        self.steam = os.path.join(root, "Steam")
        self.lib2 = os.path.join(root, "SteamLibrary")
        self.missing = os.path.join(root, "Unplugged")

        sa = os.path.join(self.steam, "steamapps")
        write(os.path.join(sa, "appmanifest_10.acf"), manifest(10, "Small Game", "Small", 1000))
        write(os.path.join(sa, "appmanifest_20.acf"), manifest(20, "Big Game", "Big", 5000))
        write(os.path.join(sa, "appmanifest_99.acf"), "garbage {")
        write(os.path.join(sa, "libraryfolders.vdf"), f'''"libraryfolders"
{{
    "0" {{ "path" "{vdf_path(self.steam)}" "label" "" }}
    "1" {{ "path" "{vdf_path(self.lib2)}" "label" "Games SSD" }}
    "2" {{ "path" "{vdf_path(self.missing)}" "label" "" }}
}}
''')
        sa2 = os.path.join(self.lib2, "steamapps")
        write(os.path.join(sa2, "appmanifest_30.acf"), manifest(30, "Half-Done", "HD", 300, flags=1026))

    def tearDown(self):
        self.tmp.cleanup()

    def test_libraries_and_games(self):
        data = scan(self.steam)
        self.assertEqual([lib.path for lib in data.libraries], [self.steam, self.lib2, self.missing])

        main_lib, lib2, missing = data.libraries
        self.assertEqual([g.name for g in main_lib.games], ["Big Game", "Small Game"])  # largest first
        self.assertEqual(main_lib.size_on_disk, 6000)
        self.assertEqual(main_lib.games[0].install_path, os.path.join(self.steam, "steamapps", "common", "Big"))
        self.assertIsNotNone(main_lib.disk_total)

        self.assertEqual(lib2.label, "Games SSD")
        self.assertFalse(lib2.games[0].fully_installed)

        self.assertFalse(missing.available)
        self.assertEqual(missing.games, [])

        self.assertEqual(data.size_on_disk, 6300)
        self.assertEqual(len(data.games), 3)

    def test_legacy_libraryfolders_format(self):
        write(os.path.join(self.steam, "steamapps", "libraryfolders.vdf"), f'''"LibraryFolders"
{{
    "TimeNextStatsReport" "1234"
    "ContentStatsID" "-5"
    "1" "{vdf_path(self.lib2)}"
}}
''')
        data = scan(self.steam)
        self.assertEqual([lib.path for lib in data.libraries], [self.steam, self.lib2])

    def test_missing_libraryfolders_still_scans_main_folder(self):
        os.remove(os.path.join(self.steam, "steamapps", "libraryfolders.vdf"))
        data = scan(self.steam)
        self.assertEqual(len(data.libraries), 1)
        self.assertEqual(len(data.games), 2)

    def test_not_a_steam_folder(self):
        with self.assertRaises(SteamNotFoundError):
            scan(self.tmp.name)

    def test_cli_text_and_json(self):
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(main(["--steam-path", self.steam]), 0)
        text = out.getvalue()
        self.assertIn("Big Game", text)
        self.assertIn("not found, skipped", text)
        self.assertIn("Total: 3 games", text)

        out = io.StringIO()
        with redirect_stdout(out):
            main(["--steam-path", self.steam, "--json"])
        data = json.loads(out.getvalue())
        self.assertEqual(data["size_on_disk"], 6300)
        self.assertEqual(data["libraries"][1]["games"][0]["appid"], 30)


class FormatSizeTest(unittest.TestCase):
    def test_units(self):
        self.assertEqual(format_size(512), "512 B")
        self.assertEqual(format_size(1536), "1.5 KB")
        self.assertEqual(format_size(5 * 1024**3), "5.0 GB")
        self.assertEqual(format_size(2 * 1024**4), "2.00 TB")


if __name__ == "__main__":
    unittest.main()
