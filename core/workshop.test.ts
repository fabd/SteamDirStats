import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';

import { localTitle, readLibraryWorkshop, readManifest } from './workshop.ts';
import { tempDir, testHost, workshopManifest, write } from './test-support.ts';

test('items are read largest first, with their folders', async (t) => {
  const root = await tempDir(t);
  const host = testHost(root);
  const workshopDir = path.join(root, 'steamapps', 'workshop');
  const file = path.join(workshopDir, 'appworkshop_10.acf');

  await write(file, workshopManifest(10, { 111: 1000, 222: 4000 }));

  const app = await readManifest(host, file, workshopDir);

  assert.equal(app?.appid, 10);
  assert.equal(app?.size, 5000);
  assert.deepEqual(
    app?.items.map((item) => [item.itemid, item.size]),
    [
      [222, 4000],
      [111, 1000],
    ],
  );
  assert.equal(app?.items[0]?.path, path.join(workshopDir, 'content', '10', '222'));
  assert.equal(app?.items[0]?.url, 'https://steamcommunity.com/sharedfiles/filedetails/?id=222');
  assert.equal(app?.items[0]?.time_updated, 1700000000);
});

test('SizeOnDisk wins over the sum when the manifest has one', async (t) => {
  const root = await tempDir(t);
  const host = testHost(root);
  const file = path.join(root, 'appworkshop_10.acf');

  await write(file, workshopManifest(10, { 111: 1000 }, 9999));

  assert.equal((await readManifest(host, file, root))?.size, 9999);
});

test('an unreadable or invalid manifest is skipped', async (t) => {
  const root = await tempDir(t);
  const host = testHost(root);

  assert.equal(await readManifest(host, path.join(root, 'nope.acf'), root), null);

  await write(path.join(root, 'bad.acf'), '"AppWorkshop" { "nothing" "here" }');
  assert.equal(await readManifest(host, path.join(root, 'bad.acf'), root), null);
});

test('a library with no workshop folder reads as empty', async (t) => {
  const root = await tempDir(t);

  assert.equal((await readLibraryWorkshop(testHost(root), root)).size, 0);
});

test('every appworkshop manifest in a library is found', async (t) => {
  const root = await tempDir(t);
  const workshopDir = path.join(root, 'steamapps', 'workshop');

  await write(path.join(workshopDir, 'appworkshop_10.acf'), workshopManifest(10, { 111: 10 }));
  await write(path.join(workshopDir, 'appworkshop_20.acf'), workshopManifest(20, { 222: 20 }));
  await write(path.join(workshopDir, 'notes.txt'), 'ignored');

  const apps = await readLibraryWorkshop(testHost(root), root);

  assert.deepEqual([...apps.keys()].sort(), [10, 20]);
});

test('publish_data.txt names an item the API will not describe', async (t) => {
  const root = await tempDir(t);
  const host = testHost(root);
  const item = path.join(root, 'content', '10', '111');

  assert.equal(await localTitle(host, item), null);

  await write(
    path.join(item, 'publish_data.txt'),
    '"publish_data"\n{\n    "title"  "Winter Peak"\n}\n',
  );

  assert.equal(await localTitle(host, item), 'Winter Peak');
});
