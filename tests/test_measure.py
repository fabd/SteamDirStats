import os
import tempfile
import unittest
from unittest import mock

from steamdirstats import workshop_names

from steamdirstats import scan
from steamdirstats.measure import folder_size
from tests.test_scanner import manifest, run_cli, vdf_path, write
from tests.test_workshop import workshop_manifest


def file_of(path, size):
    write(path, "x" * size)


class FolderSizeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = self.tmp.name

    def test_counts_every_file_in_every_subfolder(self):
        file_of(os.path.join(self.root, "a.bin"), 100)
        file_of(os.path.join(self.root, "sub", "b.bin"), 20)
        file_of(os.path.join(self.root, "sub", "deeper", "c.bin"), 3)
        self.assertEqual(folder_size(self.root), 123)

    def test_empty_folder_is_zero_but_a_missing_one_is_none(self):
        empty = os.path.join(self.root, "empty")
        os.makedirs(empty)
        self.assertEqual(folder_size(empty), 0)
        self.assertIsNone(folder_size(os.path.join(self.root, "nope")))
        # A file is not a folder to walk.
        file_of(os.path.join(self.root, "f.bin"), 1)
        self.assertIsNone(folder_size(os.path.join(self.root, "f.bin")))


class AccurateScanTest(unittest.TestCase):
    """A fake library whose real file sizes disagree with its manifests."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.steam = os.path.join(self.tmp.name, "Steam")
        sa = os.path.join(self.steam, "steamapps")
        self._isolate_name_lookup()

        write(os.path.join(sa, "libraryfolders.vdf"),
              '"libraryfolders"\n{\n    "0" { "path" "%s" "label" "" }\n}\n' % vdf_path(self.steam))

        # Manifest says 1000, the folder really holds 123 bytes.
        write(os.path.join(sa, "appmanifest_10.acf"), manifest(10, "Stale Game", "Stale", 1000))
        file_of(os.path.join(sa, "common", "Stale", "a.bin"), 100)
        file_of(os.path.join(sa, "common", "Stale", "sub", "b.bin"), 23)

        # Two appids sharing one install folder, as Skyrim SE and its
        # Creation Kit do. The folder holds 1100 bytes in total.
        write(os.path.join(sa, "appmanifest_20.acf"), manifest(20, "Big App", "Shared", 900))
        write(os.path.join(sa, "appmanifest_21.acf"), manifest(21, "Its Tools", "Shared", 100))
        file_of(os.path.join(sa, "common", "Shared", "data.bin"), 1100)

        # Manifest for a folder that is not there at all.
        write(os.path.join(sa, "appmanifest_30.acf"), manifest(30, "Ghost", "Ghost", 555))

        # Workshop: the manifest's item sizes are stale too.
        write(os.path.join(sa, "workshop", "appworkshop_10.acf"),
              workshop_manifest(10, {111: 4000, 222: 1000}))
        file_of(os.path.join(sa, "workshop", "content", "10", "111", "i.bin"), 30)
        file_of(os.path.join(sa, "workshop", "content", "10", "222", "i.bin"), 70)

    def _isolate_name_lookup(self):
        """Keep the tests off the network and away from the real name cache."""
        cache = os.path.join(self.tmp.name, "workshop-names.json")
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

    def games(self, **kwargs):
        return {g.appid: g for g in scan(self.steam, **kwargs).games}

    def test_fast_mode_still_trusts_the_manifests(self):
        games = self.games()
        self.assertEqual(games[10].size_on_disk, 1000)
        self.assertEqual(games[10].workshop_size, 5000)

    def test_accurate_mode_uses_the_real_file_sizes(self):
        games = self.games(accurate=True)
        self.assertEqual(games[10].size_on_disk, 123)

    def test_a_shared_install_folder_is_counted_once(self):
        games = self.games(accurate=True)
        # 1100 bytes split as the manifests claimed (900 / 100), not 1100 each.
        self.assertEqual(games[20].size_on_disk + games[21].size_on_disk, 1100)
        self.assertEqual(games[20].size_on_disk, 990)
        self.assertEqual(games[21].size_on_disk, 110)

    def test_a_missing_folder_keeps_its_manifest_size(self):
        self.assertEqual(self.games(accurate=True)[30].size_on_disk, 555)

    def test_workshop_items_are_measured_and_resorted(self):
        game = self.games(accurate=True)[10]
        self.assertEqual([(i.itemid, i.size) for i in game.workshop_items], [(222, 70), (111, 30)])
        self.assertEqual(game.workshop_size, 100)

    def test_totals_add_up(self):
        data = scan(self.steam, accurate=True)
        self.assertTrue(data.accurate)
        self.assertEqual(data.size_on_disk, 123 + 100 + 1100 + 555)
        self.assertEqual(data.to_dict()["accurate"], True)

    def test_progress_is_reported_once_per_game_and_at_the_end(self):
        seen = []
        games = scan(self.steam, accurate=True, scan_progress=lambda *a: seen.append(a)).games
        self.assertEqual(len(seen), len(games) + 1)
        self.assertEqual([done for done, _, _ in seen], list(range(len(games) + 1)))
        self.assertTrue(all(total == len(games) for _, total, _ in seen))
        self.assertEqual(seen[0][2], games[0].name)
        self.assertEqual(seen[-1], (len(games), len(games), ""))

    def test_cli_accurate_flag(self):
        exit_code, out = run_cli(["--steam-path", self.steam, "--accurate", "--no-items"])
        self.assertEqual(exit_code, 0)
        self.assertIn("measured on disk", out)
        self.assertIn("1.8 KB", out)  # 1878 bytes in total

        exit_code, out = run_cli(["--steam-path", self.steam, "--no-items"])
        self.assertNotIn("measured on disk", out)


if __name__ == "__main__":
    unittest.main()
