import assert from 'node:assert/strict';
import { test } from 'node:test';

import { join, normalize, normcase } from './paths.ts';
import * as vdf from './vdf.ts';

test('nested blocks, comments and escapes', () => {
  const data = vdf.parse(String.raw`
  "LibraryFolders"
  {
      // a comment
      "0"
      {
          "path"    "D:\\SteamLibrary"
          "label"   "Say \"hi\""
      }
  }
  `);
  const first = vdf.node(vdf.node(data, 'libraryfolders'), '0');

  assert.equal(vdf.str(first, 'path'), 'D:\\SteamLibrary');
  assert.equal(vdf.str(first, 'label'), 'Say "hi"');
});

test('keys are lower-cased', () => {
  const data = vdf.parse('"AppState" { "SizeOnDisk" "123" }');

  assert.equal(vdf.int(vdf.node(data, 'appstate'), 'sizeondisk'), 123);
});

test('unquoted tokens, platform conditionals ignored', () => {
  const data = vdf.parse('root { key value [$WIN32] other "x" }');

  assert.deepEqual(vdf.node(data, 'root'), { key: 'value', other: 'x' });
});

test('byte order mark and empty values', () => {
  const data = vdf.parse('\ufeff"a" { "label" "" }');

  assert.equal(vdf.str(vdf.node(data, 'a'), 'label'), '');
});

test('malformed input never throws', () => {
  const data = vdf.parse('"a" { "b" "c" } } { "unterminated');

  assert.equal(vdf.str(vdf.node(data, 'a'), 'b'), 'c');
});

test('int() only accepts whole numbers', () => {
  const data = vdf.parse('"a" { "n" "12" "junk" "12abc" "empty" "" }');
  const a = vdf.node(data, 'a');

  assert.equal(vdf.int(a, 'n'), 12);
  assert.equal(vdf.int(a, 'junk'), null);
  assert.equal(vdf.int(a, 'empty'), null);
  assert.equal(vdf.int(a, 'missing'), null);
});

test('paths join and normalise the Windows way', () => {
  assert.equal(join('D:\\Steam', 'steamapps', 'common'), 'D:\\Steam\\steamapps\\common');
  assert.equal(normalize('e:/steam/steam/'), 'e:\\steam\\steam');
  assert.equal(normalize('D:\\Steam\\.\\steamapps\\..\\steamapps'), 'D:\\Steam\\steamapps');
  assert.equal(normalize('D:/'), 'D:\\');
  assert.equal(normalize('\\\\server\\share\\lib'), '\\\\server\\share\\lib');
  assert.equal(normcase('D:\\Games'), 'd:\\games');
  assert.equal(join('', 'steamapps'), 'steamapps');
});
