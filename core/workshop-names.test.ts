import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { test } from 'node:test';

import type { Host } from './host.ts';
import { workshopItemUrl, type WorkshopItem } from './models.ts';
import * as settings from './settings.ts';
import { resolveNames } from './workshop-names.ts';
import { tempDir, testHost, write } from './test-support.ts';

function item(itemid: number, itemPath = ''): WorkshopItem {
  return {
    itemid,
    size: 1000,
    path: itemPath,
    time_updated: null,
    name: null,
    url: workshopItemUrl(itemid),
  };
}

/** A host whose only network answer is the one the test hands it. */
function hostWithApi(
  dataDir: string,
  answer: (form: Record<string, string>) => unknown,
  calls: Array<Record<string, string>> = [],
): Host {
  return testHost(dataDir, {
    async postForm(_url, form) {
      calls.push(form);

      return answer(form);
    },
  });
}

function details(entries: Array<[number, string | null]>): unknown {
  return {
    response: {
      publishedfiledetails: entries.map(([itemid, title]) => ({
        publishedfileid: String(itemid),
        ...(title === null ? { result: 9 } : { title }),
      })),
    },
  };
}

test('names are fetched once and then come from the cache', async (t) => {
  const root = await tempDir(t);
  const calls: Array<Record<string, string>> = [];
  const host = hostWithApi(root, () => details([[111, 'Winter Peak']]), calls);

  const first = await resolveNames(host, [item(111)]);

  assert.equal(first.fetched, 1);
  assert.equal(first.cached, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.['publishedfileids[0]'], '111');

  const second = await resolveNames(host, [item(111)]);

  assert.equal(second.cached, 1);
  assert.equal(second.fetched, 0);
  assert.equal(calls.length, 1); // no second request
});

test('the same item in two libraries is asked about once', async (t) => {
  const root = await tempDir(t);
  const calls: Array<Record<string, string>> = [];
  const host = hostWithApi(root, () => details([[111, 'Shared Item']]), calls);
  const copies = [item(111), item(111)];

  const stats = await resolveNames(host, copies);

  assert.equal(stats.fetched, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    copies.map((copy) => copy.name),
    ['Shared Item', 'Shared Item'],
  );
});

test('an item the API will not describe falls back to its own folder', async (t) => {
  const root = await tempDir(t);
  const itemPath = path.join(root, 'content', '10', '111');

  await write(
    path.join(itemPath, 'publish_data.txt'),
    '"publish_data"\n{\n    "title"  "Unlisted Map"\n}\n',
  );

  const host = hostWithApi(root, () => details([[111, null]]));
  const one = item(111, itemPath);
  const stats = await resolveNames(host, [one]);

  assert.equal(one.name, 'Unlisted Map');
  assert.equal(stats.local, 1);
  assert.equal(stats.unavailable, 0);
});

test('an item with no name anywhere is counted as unavailable', async (t) => {
  const root = await tempDir(t);
  const host = hostWithApi(root, () => details([[111, null]]));
  const stats = await resolveNames(host, [item(111)]);

  assert.equal(stats.unavailable, 1);
  assert.equal(stats.failed, 0);
});

test('offline uses the cache only', async (t) => {
  const root = await tempDir(t);
  const calls: Array<Record<string, string>> = [];
  const host = hostWithApi(root, () => details([[111, 'Winter Peak']]), calls);

  const stats = await resolveNames(host, [item(111)], { offline: true });

  assert.equal(calls.length, 0);
  assert.equal(stats.failed, 1);
  assert.equal(stats.fetched, 0);
});

test('a failing request gives up after two tries and reports it', async (t) => {
  const root = await tempDir(t);
  let attempts = 0;
  const host = testHost(root, {
    async postForm() {
      attempts += 1;

      throw new Error('no network');
    },
  });
  // Three batches' worth of ids, so the run would continue if it did not stop.
  const many = Array.from({ length: 250 }, (_unused, index) => item(1000 + index));

  const stats = await resolveNames(host, many);

  assert.equal(attempts, 2);
  assert.equal(stats.failed, 250);
  assert.equal(stats.fetched, 0);
});

test('progress is reported before and after each batch', async (t) => {
  const root = await tempDir(t);
  const host = hostWithApi(root, (form) =>
    details(
      Object.entries(form)
        .filter(([key]) => key.startsWith('publishedfileids'))
        .map(([, id]) => [Number(id), `Item ${id}`] as [number, string]),
    ),
  );
  const seen: Array<[number, number]> = [];

  await resolveNames(
    host,
    Array.from({ length: 150 }, (_unused, index) => item(2000 + index)),
    { progress: (done, total) => seen.push([done, total]) },
  );

  assert.deepEqual(seen, [
    [0, 150],
    [100, 150],
    [150, 150],
  ]);
});

test('settings merge rather than replace', async (t) => {
  const root = await tempDir(t);
  const host = testHost(root);

  assert.deepEqual(await settings.load(host), { layout: 'grouped', accurate: false });

  await settings.save(host, { accurate: true });
  await settings.save(host, { window: { x: 1, y: 2, width: 3, height: 4, maximized: false } });

  const stored = await settings.load(host);

  assert.equal(stored.accurate, true); // not wiped by the second write
  assert.equal(stored.window?.width, 3);
  assert.equal(stored.layout, 'grouped');

  // Written where the host said, and nowhere else.
  assert.ok(await fs.stat(path.join(root, 'settings.json')));
});

test('a corrupt settings file falls back to the defaults', async (t) => {
  const root = await tempDir(t);

  await write(path.join(root, 'settings.json'), '{ not json');

  assert.deepEqual(await settings.load(testHost(root)), { layout: 'grouped', accurate: false });
});
