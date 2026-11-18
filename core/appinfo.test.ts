import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';

import { parseNames, readNames } from './appinfo.ts';
import {
  buildAppinfo,
  MAGIC_V27,
  MAGIC_V28,
  tempDir,
  testHost,
  writeBytes,
} from './test-support.ts';

test('names from a file with a string table', () => {
  const data = buildAppinfo([
    [10, 'Last Evil'],
    [20, "No Man's Sky"],
  ]);

  assert.deepEqual(
    [...parseNames(data)],
    [
      [10, 'Last Evil'],
      [20, "No Man's Sky"],
    ],
  );
});

test('names from the legacy formats', () => {
  for (const magic of [MAGIC_V27, MAGIC_V28]) {
    const data = buildAppinfo([[10, 'Quake']], magic);

    assert.deepEqual([...parseNames(data)], [[10, 'Quake']], `magic ${magic.toString(16)}`);
  }
});

test('an app without a name is skipped', () => {
  assert.equal(parseNames(buildAppinfo([[10, null]])).size, 0);
});

test('unknown or truncated files parse to nothing', () => {
  assert.equal(parseNames(new Uint8Array(0)).size, 0);

  const wrongMagic = new Uint8Array(8);
  new DataView(wrongMagic.buffer).setUint32(0, 0x07564400, true);
  assert.equal(parseNames(wrongMagic).size, 0);

  const full = buildAppinfo([
    [10, 'Quake'],
    [20, 'Portal'],
  ]);
  assert.equal(parseNames(full.subarray(0, full.length - 10)).size, 0);
});

test('readNames without a cache, then with one', async (t) => {
  const root = await tempDir(t);
  const host = testHost(root);

  assert.equal((await readNames(host, root)).size, 0);

  await writeBytes(path.join(root, 'appcache', 'appinfo.vdf'), buildAppinfo([[42, 'Half-Life']]));

  assert.deepEqual([...(await readNames(host, root))], [[42, 'Half-Life']]);
});
