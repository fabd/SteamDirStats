import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

from steamdirstats import workshop_names

from steamdirstats import SteamNotFoundError, scan
from steamdirstats.__main__ import format_size, main
from tests.test_appinfo import build_appinfo
from tests.test_workshop import workshop_manifest


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


def run_cli(args):
    """Run the CLI and return what it printed. Progress goes to stderr."""
    out = io.StringIO()
    with redirect_stdout(out), redirect_stderr(io.StringIO()):
        exit_code = main(args)
    return exit_code, out.getvalue()


class ScanTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = self.tmp.name
        self._isolate_name_lookup(root)
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
        write(os.path.join(self.steam, "steamapps", "workshop", "appworkshop_10.acf"),
              workshop_manifest(10, {111: 4000, 222: 1000}))

        sa2 = os.path.join(self.lib2, "steamapps")
        write(os.path.join(sa2, "appmanifest_30.acf"), manifest(30, "Half-Done", "HD", 300, flags=1026))

    def tearDown(self):
        self.tmp.cleanup()

    def _isolate_name_lookup(self, root):
        """Keep the tests off the network and away from the real name cache."""
        cache = os.path.join(root, "workshop-names.json")
        patches = [
            mock.patch.object(workshop_names, "data_file", lambda name: cache),
            mock.patch.object(
                workshop_names.urllib.request,
                "urlopen",
                mock.Mock(side_effect=OSError("no network in tests")),
            ),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def test_libraries_and_games(self):
        data = scan(self.steam)
        self.assertEqual([lib.path for lib in data.libraries], [self.steam, self.lib2, self.missing])

        main_lib, lib2, missing = data.libraries
        # Small Game is 1000 of game files but 6000 with its Workshop content.
        self.assertEqual([g.name for g in main_lib.games], ["Small Game", "Big Game"])  # largest first
        self.assertEqual(main_lib.size_on_disk, 11000)
        self.assertEqual(main_lib.games[0].install_path, os.path.join(self.steam, "steamapps", "common", "Small"))
        self.assertIsNotNone(main_lib.disk_total)

        self.assertEqual(lib2.label, "Games SSD")
        self.assertFalse(lib2.games[0].fully_installed)

        self.assertFalse(missing.available)
        self.assertEqual(missing.games, [])

        self.assertEqual(data.size_on_disk, 11300)
        self.assertEqual(data.workshop_size, 5000)
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

    def test_workshop_content_is_attached_to_its_game(self):
        games = {g.appid: g for g in scan(self.steam).games}
        with_workshop, without = games[10], games[20]

        self.assertEqual(with_workshop.size_on_disk, 1000)  # game files only
        self.assertEqual(with_workshop.workshop_size, 5000)
        self.assertEqual(with_workshop.total_size, 6000)
        self.assertEqual([i.size for i in with_workshop.workshop_items], [4000, 1000])

        self.assertEqual(without.workshop_size, 0)
        self.assertEqual(without.workshop_items, [])
        self.assertEqual(without.total_size, without.size_on_disk)

    def test_report_shows_workshop_totals_and_items(self):
        _, text = run_cli(["--steam-path", self.steam])
        self.assertIn("( WORKSHOP 4.9 KB )", text)
        self.assertIn("1.    3.9 KB  111  [name unavailable]", text)
        self.assertIn("2.    1000 B  222  [name unavailable]", text)
        self.assertIn("(Workshop: 4.9 KB)", text)
        self.assertIn("Workshop names: 2 not looked up", text)

        _, text = run_cli(["--steam-path", self.steam, "--item-urls"])
        self.assertIn("filedetails/?id=111", text)

        _, text = run_cli(["--steam-path", self.steam, "--no-items"])
        self.assertIn("( WORKSHOP 4.9 KB )", text)
        self.assertNotIn("3.9 KB  111", text)

    def test_placeholder_name_comes_from_the_appinfo_cache(self):
        sa = os.path.join(self.steam, "steamapps")
        write(os.path.join(sa, "appmanifest_40.acf"), manifest(40, "appid_40", "LastEvil", 4000))
        write(os.path.join(sa, "appmanifest_50.acf"), manifest(50, "appid_50", "Unknown", 50))
        cache = os.path.join(self.steam, "appcache", "appinfo.vdf")
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        with open(cache, "wb") as f:
            f.write(build_appinfo({40: "Last Evil"}))

        games = {g.appid: g.name for g in scan(self.steam).games}
        self.assertEqual(games[40], "Last Evil")
        self.assertEqual(games[50], "Unknown")  # not in the cache: use the install folder
        self.assertEqual(games[20], "Big Game")  # a real manifest name wins

    def test_playtime_is_attached_from_the_signed_in_account(self):
        from tests.test_accounts import localconfig, loginusers

        write(os.path.join(self.steam, "config", "loginusers.vdf"),
              loginusers([(76561198034268291, {"AccountName": "me", "MostRecent": "1"})]))
        write(os.path.join(self.steam, "userdata", "74002563", "config", "localconfig.vdf"),
              localconfig({20: {"LastPlayed": "1794440326", "Playtime": "35443"}}))

        data = scan(self.steam)
        self.assertEqual(data.account.accountid, 74002563)
        games = {g.appid: g for g in data.games}
        self.assertEqual(games[20].playtime, 35443)
        self.assertEqual(games[20].last_played, 1794440326)
        self.assertIsNone(games[10].playtime)  # no record for this game

        exit_code, out = run_cli(["--steam-path", self.steam, "--no-items"])
        self.assertEqual(exit_code, 0)
        self.assertIn("Account: me  (74002563)", out)
        self.assertIn("590.8 h", out)

    def test_scan_without_any_account(self):
        data = scan(self.steam)
        self.assertIsNone(data.account)
        self.assertTrue(all(g.playtime is None for g in data.games))
        exit_code, out = run_cli(["--steam-path", self.steam])
        self.assertEqual(exit_code, 0)
        self.assertNotIn("Account:", out)

    def test_not_a_steam_folder(self):
        with self.assertRaises(SteamNotFoundError):
            scan(self.tmp.name)

    def test_cli_text_and_json(self):
        exit_code, text = run_cli(["--steam-path", self.steam])
        self.assertEqual(exit_code, 0)
        self.assertIn("Big Game", text)
        self.assertIn("not found, skipped", text)
        self.assertIn("Total: 3 games", text)

        _, text = run_cli(["--steam-path", self.steam, "--json"])
        data = json.loads(text)
        self.assertEqual(data["size_on_disk"], 11300)
        game10 = data["libraries"][0]["games"][0]
        self.assertEqual(game10["total_size"], 6000)
        self.assertEqual([i["itemid"] for i in game10["workshop_items"]], [111, 222])
        self.assertEqual(data["libraries"][1]["games"][0]["appid"], 30)


class FormatSizeTest(unittest.TestCase):
    def test_units(self):
        self.assertEqual(format_size(512), "512 B")
        self.assertEqual(format_size(1536), "1.5 KB")
        self.assertEqual(format_size(5 * 1024**3), "5.0 GB")
        self.assertEqual(format_size(2 * 1024**4), "2.00 TB")


if __name__ == "__main__":
    unittest.main()
