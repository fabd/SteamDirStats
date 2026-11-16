import json
import os
import tempfile
import time
import unittest
from unittest import mock

from steamdirstats import workshop_names
from steamdirstats.models import WorkshopItem
from steamdirstats.workshop_names import NameCache, resolve_names


def item(itemid, name=None, path=None):
    return WorkshopItem(itemid=itemid, size=100, path=path or f"/w/{itemid}", name=name)


def api_answer(names):
    """Build what the real API returns: result 1 with a title, 9 without."""
    details = []
    for itemid, title in names.items():
        if title is None:
            details.append({"publishedfileid": str(itemid), "result": 9})
        else:
            details.append({"publishedfileid": str(itemid), "result": 1, "title": title})
    return {"response": {"resultcount": len(details), "publishedfiledetails": details}}


class FakeApi:
    """Stands in for urlopen: records the IDs asked for, returns canned answers."""

    def __init__(self, names, fail=False):
        self.names = names
        self.fail = fail
        self.calls = []

    def __call__(self, request, timeout=None):
        body = request.data.decode()
        ids = [int(v) for k, v in _pairs(body) if k.startswith("publishedfileids")]
        self.calls.append(ids)
        if self.fail:
            raise OSError("no network")
        answer = api_answer({i: self.names.get(i) for i in ids})
        return _Response(json.dumps(answer).encode())


def _pairs(body):
    import urllib.parse

    return urllib.parse.parse_qsl(body)


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return self.payload

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class ResolveNamesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = os.path.join(self.tmp.name, "workshop-names.json")

    def tearDown(self):
        self.tmp.cleanup()

    def resolve(self, items, api, **kwargs):
        with mock.patch.object(workshop_names.urllib.request, "urlopen", api):
            return resolve_names(items, cache_path=self.cache, **kwargs)

    def test_names_are_fetched_and_cached(self):
        items = [item(111), item(222)]
        api = FakeApi({111: "The Borderworld", 222: "VR_Assets"})
        stats = self.resolve(items, api)

        self.assertEqual([i.name for i in items], ["The Borderworld", "VR_Assets"])
        self.assertEqual((stats.fetched, stats.cached), (2, 0))
        self.assertEqual(len(api.calls), 1)

        # Second scan: served from the cache file, no request at all.
        again = [item(111), item(222)]
        api2 = FakeApi({})
        stats = self.resolve(again, api2)
        self.assertEqual([i.name for i in again], ["The Borderworld", "VR_Assets"])
        self.assertEqual((stats.cached, stats.fetched), (2, 0))
        self.assertEqual(api2.calls, [])

    def test_deleted_item_keeps_its_id_and_is_not_asked_about_again(self):
        items = [item(111)]
        api = FakeApi({111: None})  # result 9: gone from the Workshop
        stats = self.resolve(items, api)
        self.assertIsNone(items[0].name)
        self.assertEqual(items[0].display_name, "111")
        self.assertIn("id=111", items[0].url)
        self.assertEqual(stats.unavailable, 1)

        api2 = FakeApi({111: "Back Again"})
        stats = self.resolve([item(111)], api2)
        self.assertEqual((stats.unavailable, api2.calls), (1, []))

    def test_a_stale_miss_is_asked_about_again(self):
        self.resolve([item(111)], FakeApi({111: None}))
        with open(self.cache, encoding="utf-8") as f:
            document = json.load(f)
        document["items"]["111"]["fetched"] = int(time.time()) - workshop_names.MISS_TTL - 1
        with open(self.cache, "w", encoding="utf-8") as f:
            json.dump(document, f)

        items = [item(111)]
        api = FakeApi({111: "Back Again"})
        self.resolve(items, api)
        self.assertEqual(items[0].name, "Back Again")
        self.assertEqual(api.calls, [[111]])

    def test_one_request_per_batch(self):
        items = [item(i) for i in range(1, 251)]
        api = FakeApi({i: f"Item {i}" for i in range(1, 251)})
        stats = self.resolve(items, api)
        self.assertEqual([len(c) for c in api.calls], [100, 100, 50])
        self.assertEqual(stats.fetched, 250)

    def test_the_same_item_in_two_libraries_is_asked_about_once(self):
        items = [item(111), item(111)]
        api = FakeApi({111: "Shared"})
        self.resolve(items, api)
        self.assertEqual(api.calls, [[111]])
        self.assertEqual([i.name for i in items], ["Shared", "Shared"])

    def test_no_network_leaves_names_empty(self):
        items = [item(111), item(222)]
        stats = self.resolve(items, FakeApi({}, fail=True))
        self.assertEqual([i.name for i in items], [None, None])
        self.assertEqual(stats.failed, 2)
        self.assertEqual(items[0].display_name, "111")

    def test_repeated_failures_stop_the_lookup(self):
        items = [item(i) for i in range(1, 501)]
        api = FakeApi({}, fail=True)
        stats = self.resolve(items, api)
        self.assertEqual(len(api.calls), workshop_names.MAX_FAILURES)
        self.assertEqual(stats.failed, 500)  # the rest are counted, not requested

    def test_offline_never_calls_the_api(self):
        api = FakeApi({111: "The Borderworld"})
        stats = self.resolve([item(111)], api, offline=True)
        self.assertEqual((api.calls, stats.failed), ([], 1))

    def test_progress_is_reported(self):
        seen = []
        items = [item(i) for i in range(1, 151)]
        api = FakeApi({i: f"Item {i}" for i in range(1, 151)})
        self.resolve(items, api, progress=lambda done, total: seen.append((done, total)))
        self.assertEqual(seen, [(0, 150), (100, 150), (150, 150)])

    def test_nothing_to_do(self):
        api = FakeApi({})
        self.assertEqual(self.resolve([], api).requested, 0)
        self.assertEqual(api.calls, [])
        self.assertFalse(os.path.exists(self.cache))  # no pointless cache file

    def test_malformed_answer(self):
        class BadApi(FakeApi):
            def __call__(self, request, timeout=None):
                self.calls.append(request)
                return _Response(b"not json")

        items = [item(111)]
        stats = self.resolve(items, BadApi({}))
        self.assertEqual((items[0].name, stats.failed), (None, 1))


class LocalFallbackTest(unittest.TestCase):
    """Items the API will not describe, but whose folder names them."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = os.path.join(self.tmp.name, "workshop-names.json")

    def tearDown(self):
        self.tmp.cleanup()

    def item_with_title(self, itemid, title):
        folder = os.path.join(self.tmp.name, str(itemid))
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, "publish_data.txt"), "w", encoding="utf-8") as f:
            f.write(f'"publish_data" {{ "title" "{title}" }}')
        return item(itemid, path=folder)

    def resolve(self, items, api, **kwargs):
        with mock.patch.object(workshop_names.urllib.request, "urlopen", api):
            return resolve_names(items, cache_path=self.cache, **kwargs)

    def test_item_folder_names_an_item_the_api_does_not_know(self):
        unlisted = self.item_with_title(3751064269, "byteframe14 Runtime: Scott")
        stats = self.resolve([unlisted], FakeApi({3751064269: None}))
        self.assertEqual(unlisted.name, "byteframe14 Runtime: Scott")
        self.assertEqual((stats.local, stats.unavailable), (1, 0))

    def test_the_api_name_wins_when_there_is_one(self):
        # Titles can be edited after publishing, so the API is the fresher source.
        renamed = self.item_with_title(1180765965, "Mt Rainier Camp")
        self.resolve([renamed], FakeApi({1180765965: "Mount Rainier"}))
        self.assertEqual(renamed.name, "Mount Rainier")

    def test_item_folders_still_work_offline(self):
        unlisted = self.item_with_title(111, "Local Name")
        stats = self.resolve([unlisted], FakeApi({}), offline=True)
        self.assertEqual((unlisted.name, stats.local, stats.failed), ("Local Name", 1, 0))

    def test_item_with_no_name_anywhere(self):
        stats = self.resolve([item(3793101006)], FakeApi({3793101006: None}))
        self.assertEqual((stats.local, stats.unavailable), (0, 1))


class NameCacheTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "workshop-names.json")

    def tearDown(self):
        self.tmp.cleanup()

    def test_corrupt_or_foreign_cache_is_treated_as_empty(self):
        for text in ("}{", '{"version": 999, "items": {"1": {"name": "x"}}}', '["nope"]'):
            with open(self.path, "w", encoding="utf-8") as f:
                f.write(text)
            self.assertEqual(NameCache(self.path).get(1), (False, None))

    def test_unwritable_cache_is_not_fatal(self):
        cache = NameCache(os.path.join(self.tmp.name, "nope", "deep", "cache.json"))
        cache.set(1, "Name")
        self.assertFalse(cache.save())
        self.assertEqual(cache.get(1), (True, "Name"))  # still useful for this run

    def test_default_path_is_in_the_app_folder(self):
        from steamdirstats.appdir import app_folder

        self.assertEqual(
            NameCache().path, os.path.join(app_folder(), workshop_names.CACHE_FILE)
        )


if __name__ == "__main__":
    unittest.main()
