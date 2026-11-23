import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';

import { findAccount, readPlayStats } from './accounts.ts';
import { formatLastPlayed, formatPlaytime, formatSize } from './format.ts';
import { localconfig, loginusers, tempDir, testHost, write } from './test-support.ts';

const OTHER = '76561198000000000'; // accountid 39734272
const RECENT = '76561198123456789'; // accountid 163191061

async function steamWith(
  t: Parameters<typeof tempDir>[0],
  users: string,
  userdataFor: string[] = ['163191061'],
): Promise<string> {
  const root = await tempDir(t);
  const steam = path.join(root, 'Steam');

  await write(path.join(steam, 'config', 'loginusers.vdf'), users);

  for (const accountid of userdataFor) {
    await write(path.join(steam, 'userdata', accountid, 'config', 'localconfig.vdf'), '"x" {}');
  }

  return steam;
}

test('MostRecent picks the account, whatever the timestamps say', async (t) => {
  const steam = await steamWith(
    t,
    loginusers([
      [OTHER, { AccountName: 'other', Timestamp: '9999999999' }],
      [RECENT, { AccountName: 'me', PersonaName: 'fabd', MostRecent: '1', Timestamp: '1' }],
    ]),
  );
  const account = await findAccount(testHost(steam), steam);

  assert.equal(account?.accountid, 163191061);
  assert.equal(account?.account_name, 'me');
  assert.equal(account?.persona_name, 'fabd');
  assert.equal(account?.steamid64, RECENT);
});

test('without MostRecent, the highest timestamp wins', async (t) => {
  const steam = await steamWith(
    t,
    loginusers([
      [OTHER, { AccountName: 'other', Timestamp: '100' }],
      [RECENT, { AccountName: 'me', Timestamp: '200' }],
    ]),
  );

  assert.equal((await findAccount(testHost(steam), steam))?.accountid, 163191061);
});

test('an account with no userdata folder is not used', async (t) => {
  const steam = await steamWith(t, loginusers([[RECENT, { AccountName: 'me' }]]), []);

  assert.equal(await findAccount(testHost(steam), steam), null);
});

test('no loginusers.vdf at all', async (t) => {
  const root = await tempDir(t);

  assert.equal(await findAccount(testHost(root), root), null);
});

test('playtime, two-week playtime and last played', async (t) => {
  const steam = await steamWith(t, loginusers([[RECENT, { AccountName: 'me' }]]));
  const host = testHost(steam);
  const account = await findAccount(host, steam);

  await write(
    path.join(steam, 'userdata', '163191061', 'config', 'localconfig.vdf'),
    localconfig({
      20: { Playtime: '35443', Playtime2wks: '120', LastPlayed: '1794440326' },
      30: { LastPlayed: '86400' }, // the "never played" placeholder
      40: { cloudenabled: '1' }, // says nothing about play
    }),
  );

  const stats = await readPlayStats(host, account as NonNullable<typeof account>);

  assert.equal(stats.get(20)?.playtime, 35443);
  assert.equal(stats.get(20)?.playtime_2weeks, 120);
  assert.equal(stats.get(20)?.last_played, 1794440326);
  assert.equal(stats.has(30), false);
  assert.equal(stats.has(40), false);
});

test('playtime and sizes are formatted the way Steam shows them', () => {
  assert.equal(formatPlaytime(35443), '590.8 h'); // Steam rounds 590.72 up
  assert.equal(formatPlaytime(45), '45 min');
  assert.equal(formatPlaytime(0), '');
  assert.equal(formatLastPlayed(0), '');
  assert.equal(formatSize(512), '512 B');
  assert.equal(formatSize(1536), '1.5 KB');
  assert.equal(formatSize(5 * 1024 ** 3), '5.0 GB');
  assert.equal(formatSize(2 * 1024 ** 4), '2.00 TB');
});
