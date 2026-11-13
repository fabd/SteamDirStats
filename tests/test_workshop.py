import os
import tempfile
import unittest

from steamdirstats.workshop import read_library_workshop, read_manifest


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def workshop_manifest(appid, items, size_on_disk=None):
    """items: {itemid: size}"""
    installed = "\n".join(
        f'''        "{itemid}"
        {{
            "size"         "{size}"
            "timeupdated"  "1700000000"
        }}'''
        for itemid, size in items.items()
    )
    total = sum(items.values()) if size_on_disk is None else size_on_disk
    return f'''"AppWorkshop"
{{
    "appid"        "{appid}"
    "SizeOnDisk"   "{total}"
    "WorkshopItemsInstalled"
    {{
{installed}
    }}
}}
'''


class WorkshopTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.lib = self.tmp.name
        self.workshop = os.path.join(self.lib, "steamapps", "workshop")

    def tearDown(self):
        self.tmp.cleanup()

    def test_items_and_total(self):
        write(
            os.path.join(self.workshop, "appworkshop_250820.acf"),
            workshop_manifest(250820, {111: 500, 222: 1500}),
        )
        apps = read_library_workshop(self.lib)
        app = apps[250820]
        self.assertEqual(app.size, 2000)
        self.assertEqual([(i.itemid, i.size) for i in app.items], [(222, 1500), (111, 500)])

        item = app.items[0]
        self.assertEqual(item.path, os.path.join(self.workshop, "content", "250820", "222"))
        self.assertEqual(item.time_updated, 1700000000)
        self.assertEqual(item.display_name, "222")  # names are not stored locally
        self.assertIn("id=222", item.url)

    def test_size_on_disk_wins_over_the_item_sum(self):
        # Steam's own total, which can differ slightly from the item sizes.
        write(
            os.path.join(self.workshop, "appworkshop_10.acf"),
            workshop_manifest(10, {111: 500}, size_on_disk=900),
        )
        self.assertEqual(read_library_workshop(self.lib)[10].size, 900)

    def test_missing_size_on_disk_falls_back_to_the_item_sum(self):
        write(
            os.path.join(self.workshop, "appworkshop_10.acf"),
            '''"AppWorkshop"
{
    "appid" "10"
    "WorkshopItemsInstalled" { "111" { "size" "700" } }
}
''',
        )
        self.assertEqual(read_library_workshop(self.lib)[10].size, 700)

    def test_manifest_without_items(self):
        write(os.path.join(self.workshop, "appworkshop_10.acf"), '"AppWorkshop" { "appid" "10" }')
        app = read_library_workshop(self.lib)[10]
        self.assertEqual((app.size, app.items), (0, []))

    def test_bad_manifests_are_skipped(self):
        write(os.path.join(self.workshop, "appworkshop_10.acf"), "garbage {")
        write(os.path.join(self.workshop, "appworkshop_20.acf"), '"AppWorkshop" { "nope" "1" }')
        write(os.path.join(self.workshop, "readme.txt"), "ignored")
        self.assertEqual(read_library_workshop(self.lib), {})
        self.assertIsNone(read_manifest(os.path.join(self.workshop, "nothing.acf"), self.workshop))

    def test_library_without_a_workshop_folder(self):
        self.assertEqual(read_library_workshop(self.lib), {})


if __name__ == "__main__":
    unittest.main()
