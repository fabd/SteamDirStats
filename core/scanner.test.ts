/**
 * The scan as a whole, against a fake Steam folder on disk.
 *
 * The same ground the Python suite covered: library discovery in both
 * libraryfolders formats, Workshop content attached to its game, placeholder
 * names, playtime, and the shapes the UI and the CLI read.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { test } from 'node:test';

import { SteamNotFoundError } from './locate.ts';
import { allGames, type Game, type SteamData } from './models.ts';
import { scan } from './scanner.ts';
import {
  buildAppinfo,
  localconfig,
  loginusers,
  manifest,
  tempDir,
  testHost,
  workshopManifest,
  write,
  writeBytes,
} from './test-support.ts';

const RECENT = '76561198123456789'; // accountid 163191061

function vdfPath(p: string): string {
  return p.replace(/\\/g, '\\\\');
}

interface Fixture {
  root: string;
  steam: string;
  lib2: string;
  missing: string;
}

/** Two libraries plus one that is not there, as if a drive were unplugged. */
async function makeSteam(t: Parameters<typeof tempDir>[0]): Promise<Fixture> {
  const root = await tempDir(t);
  const steam = path.join(root, 'Steam');
  const lib2 = path.join(root, 'SteamLibrary');
  const missing = path.join(root, 'Unplugged');
  const steamapps = path.join(steam, 'steamapps');

  await write(
    path.join(steamapps, 'appmanifest_10.acf'),
    manifest(10, 'Small Game', 'Small', 1000),
  );
  await write(path.join(steamapps, 'appmanifest_20.acf'), manifest(20, 'Big Game', 'Big', 5000));
  await write(path.join(steamapps, 'appmanifest_99.acf'), 'garbage {');
  await write(
    path.join(steamapps, 'libraryfolders.vdf'),
    `"libraryfolders"
{
    "0" { "path" "${vdfPath(steam)}" "label" "" }
    "1" { "path" "${vdfPath(lib2)}" "label" "Games SSD" }
    "2" { "path" "${vdfPath(missing)}" "label" "" }
}
`,
  );
  await write(
    path.join(steamapps, 'workshop', 'appworkshop_10.acf'),
    workshopManifest(10, { 111: 4000, 222: 1000 }),
  );
  await write(
    path.join(lib2, 'steamapps', 'appmanifest_30.acf'),
    manifest(30, 'Half-Done', 'HD', 300, 1026),
  );

  return { root, steam, lib2, missing };
}

function byAppid(data: SteamData): Map<number, Game> {
  return new Map(allGames(data).map((game) => [game.appid, game]));
}

test('libraries and the games in them', async (t) => {
  const fixture = await makeSteam(t);
  const { data } = await scan(testHost(fixture.root), { steamPath: fixture.steam });

  assert.deepEqual(
    data.libraries.map((library) => library.path),
    [fixture.steam, fixture.lib2, fixture.missing],
  );

  const [main, lib2, missing] = data.libraries;

  // Small Game is 1000 of game files but 6000 with its Workshop content.
  assert.deepEqual(
    main?.games.map((game) => game.name),
    ['Small Game', 'Big Game'],
  );
  assert.equal(main?.total_size, 11000);
  assert.equal(
    main?.games[0]?.install_path,
    path.join(fixture.steam, 'steamapps', 'common', 'Small'),
  );
  assert.ok(main?.disk_total);

  assert.equal(lib2?.label, 'Games SSD');
  assert.equal(lib2?.games[0]?.fully_installed, false);

  assert.equal(missing?.available, false);
  assert.deepEqual(missing?.games, []);

  assert.equal(data.total_size, 11300);
  assert.equal(data.workshop_size, 5000);
  assert.equal(allGames(data).length, 3);
});

test('the legacy libraryfolders format', async (t) => {
  const fixture = await makeSteam(t);
  await write(
    path.join(fixture.steam, 'steamapps', 'libraryfolders.vdf'),
    `"LibraryFolders"
{
    "TimeNextStatsReport" "1234"
    "ContentStatsID" "-5"
    "1" "${vdfPath(fixture.lib2)}"
}
`,
  );

  const { data } = await scan(testHost(fixture.root), { steamPath: fixture.steam });

  assert.deepEqual(
    data.libraries.map((library) => library.path),
    [fixture.steam, fixture.lib2],
  );
});

test('a missing libraryfolders.vdf still scans the main folder', async (t) => {
  const fixture = await makeSteam(t);
  await fs.rm(path.join(fixture.steam, 'steamapps', 'libraryfolders.vdf'));

  const { data } = await scan(testHost(fixture.root), { steamPath: fixture.steam });

  assert.equal(data.libraries.length, 1);
  assert.equal(allGames(data).length, 2);
});

test('Workshop content is attached to its game', async (t) => {
  const fixture = await makeSteam(t);
  const { data } = await scan(testHost(fixture.root), { steamPath: fixture.steam });
  const games = byAppid(data);
  const withWorkshop = games.get(10) as Game;
  const without = games.get(20) as Game;

  assert.equal(withWorkshop.size_on_disk, 1000); // game files only
  assert.equal(withWorkshop.workshop_size, 5000);
  assert.equal(withWorkshop.total_size, 6000);
  assert.deepEqual(
    withWorkshop.workshop_items.map((item) => item.size),
    [4000, 1000],
  );
  assert.deepEqual(
    withWorkshop.workshop_items.map((item) => item.itemid),
    [111, 222],
  );

  assert.equal(without.workshop_size, 0);
  assert.deepEqual(without.workshop_items, []);
  assert.equal(without.total_size, without.size_on_disk);
});

test('a placeholder name comes from the appinfo cache', async (t) => {
  const fixture = await makeSteam(t);
  const steamapps = path.join(fixture.steam, 'steamapps');

  await write(
    path.join(steamapps, 'appmanifest_40.acf'),
    manifest(40, 'appid_40', 'LastEvil', 4000),
  );
  await write(path.join(steamapps, 'appmanifest_50.acf'), manifest(50, 'appid_50', 'Unknown', 50));
  await writeBytes(
    path.join(fixture.steam, 'appcache', 'appinfo.vdf'),
    buildAppinfo([[40, 'Last Evil']]),
  );

  const { data } = await scan(testHost(fixture.root), { steamPath: fixture.steam });
  const games = byAppid(data);

  assert.equal(games.get(40)?.name, 'Last Evil');
  assert.equal(games.get(50)?.name, 'Unknown'); // not in the cache: use the install folder
  assert.equal(games.get(20)?.name, 'Big Game'); // a real manifest name wins
});

test('playtime comes from the account that signed in most recently', async (t) => {
  const fixture = await makeSteam(t);

  await write(
    path.join(fixture.steam, 'config', 'loginusers.vdf'),
    loginusers([[RECENT, { AccountName: 'me', MostRecent: '1' }]]),
  );
  await write(
    path.join(fixture.steam, 'userdata', '163191061', 'config', 'localconfig.vdf'),
    localconfig({ 20: { LastPlayed: '1794440326', Playtime: '35443' } }),
  );

  const { data } = await scan(testHost(fixture.root), { steamPath: fixture.steam });
  const games = byAppid(data);

  assert.equal(data.account?.accountid, 163191061);
  assert.equal(data.account?.steamid64, RECENT);
  assert.equal(games.get(20)?.playtime, 35443);
  assert.equal(games.get(20)?.last_played, 1794440326);
  assert.equal(games.get(10)?.playtime, null); // no record for this game
});

test('a scan without any account still works', async (t) => {
  const fixture = await makeSteam(t);
  const { data } = await scan(testHost(fixture.root), { steamPath: fixture.steam });

  assert.equal(data.account, null);
  assert.ok(allGames(data).every((game) => game.playtime === null));
});

test('a folder that is not Steam is reported, not guessed at', async (t) => {
  const fixture = await makeSteam(t);

  await assert.rejects(
    () => scan(testHost(fixture.root), { steamPath: fixture.root }),
    SteamNotFoundError,
  );
});

test('accurate mode measures the folders and shares one between two games', async (t) => {
  const fixture = await makeSteam(t);
  const steamapps = path.join(fixture.steam, 'steamapps');
  const shared = path.join(steamapps, 'common', 'Shared');

  // Two appids in one folder, as Skyrim SE and its Creation Kit are.
  await write(path.join(steamapps, 'appmanifest_60.acf'), manifest(60, 'Host Game', 'Shared', 300));
  await write(path.join(steamapps, 'appmanifest_61.acf'), manifest(61, 'Add-on', 'Shared', 100));
  await write(path.join(shared, 'data.bin'), 'x'.repeat(800));

  // Real files for one game and one Workshop item, to replace manifest sizes.
  await write(path.join(steamapps, 'common', 'Big', 'game.bin'), 'x'.repeat(2000));
  await write(path.join(steamapps, 'workshop', 'content', '10', '111', 'item.bin'), 'x'.repeat(50));

  const progress: Array<[number, number]> = [];
  const { data } = await scan(testHost(fixture.root), {
    steamPath: fixture.steam,
    accurate: true,
    onScanProgress: (done, total) => progress.push([done, total]),
  });
  const games = byAppid(data);

  assert.equal(data.accurate, true);
  assert.equal(games.get(20)?.size_on_disk, 2000);

  // 800 bytes split 300:100, and the parts add up exactly.
  assert.equal(games.get(60)?.size_on_disk, 600);
  assert.equal(games.get(61)?.size_on_disk, 200);

  // The measured item replaces its manifest size; the one with no folder keeps it.
  const items = games.get(10)?.workshop_items ?? [];
  assert.deepEqual(
    items.map((item) => [item.itemid, item.size]),
    [
      [222, 1000],
      [111, 50],
    ],
  );
  assert.equal(games.get(10)?.workshop_size, 1050);

  assert.ok(progress.length > 0);
  assert.deepEqual(progress[progress.length - 1], [progress[0]?.[1], progress[0]?.[1]]);
});

test('an unreadable game folder keeps its manifest size', async (t) => {
  const fixture = await makeSteam(t);
  const { data } = await scan(testHost(fixture.root), {
    steamPath: fixture.steam,
    accurate: true,
  });

  // Nothing was written for these games, so the folders do not exist.
  assert.equal(byAppid(data).get(20)?.size_on_disk, 5000);
});
