import unittest

from steamdirstats import vdf


class LoadsTest(unittest.TestCase):
    def test_nested_and_escapes(self):
        text = r'''
        "LibraryFolders"
        {
            // a comment
            "0"
            {
                "path"    "D:\\SteamLibrary"
                "label"   "Say \"hi\""
            }
        }
        '''
        data = vdf.loads(text)
        self.assertEqual(data["libraryfolders"]["0"]["path"], "D:\\SteamLibrary")
        self.assertEqual(data["libraryfolders"]["0"]["label"], 'Say "hi"')

    def test_keys_are_lowercased(self):
        data = vdf.loads('"AppState" { "SizeOnDisk" "123" }')
        self.assertEqual(data["appstate"]["sizeondisk"], "123")

    def test_unquoted_tokens_and_conditionals(self):
        data = vdf.loads('root { key value [$WIN32] other "x" }')
        self.assertEqual(data["root"], {"key": "value", "other": "x"})

    def test_bom_and_empty_value(self):
        data = vdf.loads('\ufeff"a" { "label" "" }')
        self.assertEqual(data["a"]["label"], "")

    def test_malformed_does_not_raise(self):
        data = vdf.loads('"a" { "b" "c" } } { "unterminated')
        self.assertEqual(data["a"]["b"], "c")


if __name__ == "__main__":
    unittest.main()
