import datetime
import os
import tempfile
import unittest

from steamdirstats.accounts import find_account, read_play_stats
from steamdirstats.__main__ import format_last_played, format_play_note, format_playtime
from steamdirstats.models import Game
from tests.test_scanner import write


def loginusers(entries):
    """entries: [(steamid64, {key: value})] -> loginusers.vdf text."""
    blocks = []
    for steamid, details in entries:
        lines = "".join(f'        "{k}"  "{v}"\n' for k, v in details.items())
        blocks.append(f'    "{steamid}"\n    {{\n{lines}    }}\n')
    return '"users"\n{\n' + "".join(blocks) + "}\n"


def localconfig(apps):
    """apps: {appid: {key: value}} -> localconfig.vdf text."""
    blocks = []
    for appid, details in apps.items():
        lines = "".join(f'                    "{k}"  "{v}"\n' for k, v in details.items())
        blocks.append(f'                "{appid}"\n                {{\n{lines}                }}\n')
    return (
        '"UserLocalConfigStore"\n{\n    "Software"\n    {\n        "Valve"\n        {\n'
        '            "Steam"\n            {\n                "apps"\n                {\n'
        + "".join(blocks)
        + "                }\n            }\n        }\n    }\n}\n"
    )


OTHER = 76561198000000000
RECENT = 76561198034268291  # accountid 74002563


class FindAccountTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.steam = os.path.join(self.tmp.name, "Steam")
        self.addCleanup(self.tmp.cleanup)

    def write_users(self, text):
        write(os.path.join(self.steam, "config", "loginusers.vdf"), text)

    def make_userdata(self, accountid, apps=None):
        path = os.path.join(self.steam, "userdata", str(accountid))
        os.makedirs(path, exist_ok=True)
        if apps is not None:
            write(os.path.join(path, "config", "localconfig.vdf"), localconfig(apps))
        return path

    def test_most_recent_flag_wins_over_a_newer_timestamp(self):
        self.write_users(loginusers([
            (OTHER, {"AccountName": "other", "Timestamp": "2000000000"}),
            (RECENT, {"AccountName": "me", "PersonaName": "fabd", "MostRecent": "1",
                      "Timestamp": "1000000000"}),
        ]))
        self.make_userdata(74002563)
        self.make_userdata(OTHER - 76561197960265728)

        account = find_account(self.steam)
        self.assertEqual(account.steamid64, RECENT)
        self.assertEqual(account.accountid, 74002563)
        self.assertEqual(account.display_name, "fabd")

    def test_falls_back_to_the_highest_timestamp_when_most_recent_is_missing(self):
        # Real installs have been seen without any MostRecent key at all.
        self.write_users(loginusers([
            (OTHER, {"AccountName": "other", "timestamp": "1000000000"}),
            (RECENT, {"AccountName": "me", "timestamp": "1794657312"}),
        ]))
        self.make_userdata(74002563)
        self.make_userdata(OTHER - 76561197960265728)

        account = find_account(self.steam)
        self.assertEqual(account.steamid64, RECENT)
        self.assertEqual(account.account_name, "me")
        self.assertEqual(account.display_name, "me")  # no persona name stored

    def test_no_loginusers_file(self):
        self.assertIsNone(find_account(self.steam))

    def test_account_without_a_userdata_folder_is_skipped(self):
        self.write_users(loginusers([(RECENT, {"AccountName": "me", "Timestamp": "1"})]))
        self.assertIsNone(find_account(self.steam))

    def test_malformed_loginusers_does_not_raise(self):
        self.write_users("garbage {")
        self.assertIsNone(find_account(self.steam))

    def test_play_stats_are_read_per_app(self):
        self.write_users(loginusers([(RECENT, {"AccountName": "me", "MostRecent": "1"})]))
        self.make_userdata(74002563, {
            275850: {"LastPlayed": "1794440326", "Playtime": "35443", "Playtime2wks": "1"},
            250820: {"LastPlayed": "1793667603", "Playtime": "4675"},
            760: {"cloud": ""},  # settings only, no playtime
            4590: {"LastPlayed": "86400", "Playtime": "85"},  # placeholder date
        })

        stats = read_play_stats(find_account(self.steam))
        self.assertEqual(sorted(stats), [4590, 250820, 275850])
        self.assertEqual(stats[275850].playtime, 35443)
        self.assertEqual(stats[275850].playtime_2weeks, 1)
        self.assertEqual(stats[275850].last_played, 1794440326)
        self.assertIsNone(stats[250820].playtime_2weeks)
        # 1970-01-02 means "never", not a date.
        self.assertIsNone(stats[4590].last_played)
        self.assertEqual(stats[4590].playtime, 85)

    def test_missing_localconfig_is_not_an_error(self):
        self.write_users(loginusers([(RECENT, {"AccountName": "me", "MostRecent": "1"})]))
        self.make_userdata(74002563)
        self.assertEqual(read_play_stats(find_account(self.steam)), {})

    def test_malformed_localconfig_is_not_an_error(self):
        self.write_users(loginusers([(RECENT, {"AccountName": "me", "MostRecent": "1"})]))
        path = self.make_userdata(74002563)
        write(os.path.join(path, "config", "localconfig.vdf"), "garbage {")
        self.assertEqual(read_play_stats(find_account(self.steam)), {})


class FormatTest(unittest.TestCase):
    def test_playtime_matches_steams_rounding(self):
        # Steam shows No Man's Sky's 35443 minutes as 590.8 hours, not 590.7.
        self.assertEqual(format_playtime(35443), "590.8 h")
        self.assertEqual(format_playtime(90), "1.5 h")
        self.assertEqual(format_playtime(60), "1.0 h")
        self.assertEqual(format_playtime(59), "59 min")
        self.assertIsNone(format_playtime(0))
        self.assertIsNone(format_playtime(None))

    def test_last_played_drops_the_year_for_the_current_year(self):
        this_year = datetime.datetime(datetime.date.today().year, 11, 12, 12, 0).timestamp()
        self.assertEqual(format_last_played(int(this_year)), "Nov 12")
        self.assertEqual(format_last_played(int(datetime.datetime(2012, 11, 29, 12).timestamp())),
                         "Nov 29, 2012")
        self.assertIsNone(format_last_played(None))
        self.assertIsNone(format_last_played(0))

    def test_play_note_on_a_game_line(self):
        game = Game(275850, "No Man's Sky", "NMS", "", 0)
        self.assertEqual(format_play_note(game), "")
        game.playtime = 35443
        game.last_played = int(datetime.datetime(datetime.date.today().year, 11, 12, 12).timestamp())
        self.assertEqual(format_play_note(game), "  [590.8 h, Nov 12]")


if __name__ == "__main__":
    unittest.main()
