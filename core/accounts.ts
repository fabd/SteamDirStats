/**
 * Per-account Steam data: which account to use, and its playtime records.
 *
 * Installed games are shared by every account on the PC, but playtime and
 * "last played" are stored per account under `<Steam>/userdata/<accountid>/`.
 * We use the account that signed in most recently (see plan.md §10); there is
 * no account picker.
 *
 * Nothing here is essential: when no account or no record is found, the sizes
 * are still complete and the playtime fields simply stay null.
 */

import type { Host } from './host.ts';
import type { Account } from './models.ts';
import { join } from './paths.ts';
import * as vdf from './vdf.ts';

/**
 * userdata folder name = SteamID64 - this offset (Valve's "individual" base).
 *
 * `(1n << 56n) | (1n << 52n) | (1n << 32n)` == 76561197960265728. A SteamID64
 * is past the point where every integer is exactly representable, so the ids
 * are parsed and subtracted as BigInt and only then turned into a number.
 */
export const STEAMID64_BASE = 76561197960265728n;

/**
 * Steam launched in 2003, so a LastPlayed before that is a placeholder, not a
 * date: old entries carry "0" or "86400" (1970-01-02) for "never played".
 */
export const EARLIEST_PLAUSIBLE_PLAYTIME = 1041379200; // 2003-01-01 UTC

/** What one Steam account records about playing one game. */
export interface PlayStats {
  playtime: number | null;
  playtime_2weeks: number | null;
  last_played: number | null;
}

/**
 * The account that signed in most recently, or null if there is none.
 *
 * Reads `config/loginusers.vdf`. Steam marks the current account with
 * "MostRecent" "1", but that key is missing on some installs, so the highest
 * "Timestamp" is the fallback. The account is only returned if its userdata
 * folder actually exists.
 */
export async function findAccount(host: Host, steamPath: string): Promise<Account | null> {
  const users = vdf.node(
    await vdf.load(host, join(steamPath, 'config', 'loginusers.vdf')),
    'users',
  );

  if (!users) {
    return null;
  }

  let best: { steamid64: bigint; details: vdf.VdfNode } | null = null;
  let bestKey: [number, number] = [0, 0];

  for (const [steamid, details] of Object.entries(users)) {
    if (!vdf.isNode(details)) {
      continue;
    }

    const steamid64 = toBigInt(steamid);

    if (steamid64 === null || steamid64 <= STEAMID64_BASE) {
      continue;
    }

    const key: [number, number] = [
      vdf.str(details, 'mostrecent') === '1' ? 1 : 0,
      vdf.int(details, 'timestamp') ?? 0,
    ];

    if (best === null || isGreater(key, bestKey)) {
      best = { steamid64, details };
      bestKey = key;
    }
  }

  if (best === null) {
    return null;
  }

  const accountid = Number(best.steamid64 - STEAMID64_BASE);
  const userdataPath = join(steamPath, 'userdata', String(accountid));

  if (!(await host.fs.isDirectory(userdataPath))) {
    return null;
  }

  return {
    steamid64: String(best.steamid64),
    accountid,
    account_name: vdf.str(best.details, 'accountname') ?? '',
    persona_name: vdf.str(best.details, 'personaname') ?? '',
    userdata_path: userdataPath,
  };
}

/**
 * Return a map of appid to PlayStats from the account's localconfig.vdf.
 *
 * Returns an empty map if the file is missing or unreadable; Steam rewrites it
 * as it runs, so it can briefly be unavailable.
 */
export async function readPlayStats(host: Host, account: Account): Promise<Map<number, PlayStats>> {
  const config = await vdf.load(host, join(account.userdata_path, 'config', 'localconfig.vdf'));
  const apps = dig(config, ['userlocalconfigstore', 'software', 'valve', 'steam', 'apps']);
  const stats = new Map<number, PlayStats>();

  if (!apps) {
    return stats;
  }

  for (const [appid, details] of Object.entries(apps)) {
    const id = vdf.toInt(appid);

    if (id === null || !vdf.isNode(details)) {
      continue;
    }

    const entry: PlayStats = {
      playtime: vdf.int(details, 'playtime'),
      playtime_2weeks: vdf.int(details, 'playtime2wks'),
      last_played: lastPlayed(vdf.int(details, 'lastplayed')),
    };

    // Entries that only hold cloud or launch settings say nothing about play.
    if (entry.playtime || entry.playtime_2weeks || entry.last_played) {
      stats.set(id, entry);
    }
  }

  return stats;
}

function lastPlayed(timestamp: number | null): number | null {
  if (timestamp === null || timestamp < EARLIEST_PLAUSIBLE_PLAYTIME) {
    return null;
  }

  return timestamp;
}

/** Walk nested nodes, tolerating a missing level (the store key is optional). */
function dig(data: vdf.VdfNode | null, keys: string[]): vdf.VdfNode | null {
  let current = data;

  for (const key of keys) {
    if (!current) {
      return null;
    }

    // localconfig has been seen with and without the outer store key.
    if (!(key in current)) {
      continue;
    }

    current = vdf.node(current, key);
  }

  return current;
}

function isGreater(left: [number, number], right: [number, number]): boolean {
  return left[0] !== right[0] ? left[0] > right[0] : left[1] > right[1];
}

function toBigInt(value: string): bigint | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }

  try {
    return BigInt(value.trim());
  } catch {
    return null;
  }
}
