/** Entry point for gathering Steam data. This is what the CLI and the UI call. */

import { findAccount, readPlayStats } from './accounts.ts';
import { readNames } from './appinfo.ts';
import { readGames } from './games.ts';
import type { Host } from './host.ts';
import { readLibraries } from './libraries.ts';
import { findSteamPath } from './locate.ts';
import { measureOnDisk, type ScanProgress } from './measure.ts';
import { allGames, recalculate, type NameStats, type SteamData } from './models.ts';
import { readLibraryWorkshop } from './workshop.ts';
import { resolveNames, type NameProgress } from './workshop-names.ts';

export interface ScanOptions {
  steamPath?: string | null;
  /** Walk the folders instead of trusting the manifest sizes. */
  accurate?: boolean;
  /** Look Workshop item names up (cache first, then the web API). */
  workshopNames?: boolean;
  /** Use the name cache only; never call the web API. */
  offline?: boolean;
  /** Called as each game folder is measured, in accurate mode. */
  onScanProgress?: ScanProgress;
  /** Called while Workshop names are being fetched. */
  onNameProgress?: NameProgress;
}

export interface ScanResult {
  data: SteamData;
  /** Present only when names were looked up. */
  nameStats: NameStats | null;
}

/**
 * Find Steam, list its libraries and the games installed in each.
 *
 * Fast mode (the default): sizes come from the manifests' SizeOnDisk, which is
 * near-instant. With `accurate`, every game and Workshop item folder is walked
 * instead, and `onScanProgress` is called as each game is measured. Each
 * game's size is its game files plus its Workshop content.
 *
 * Throws SteamNotFoundError if Steam cannot be found.
 *
 * With `workshopNames`, item names are looked up from the cache and, unless
 * `offline`, from Steam's web API for the items the cache is missing.
 *
 * Playtime comes from the account that signed in most recently; games with no
 * record for that account keep null.
 */
export async function scan(host: Host, options: ScanOptions = {}): Promise<ScanResult> {
  const steamPath = await findSteamPath(host, options.steamPath);
  const libraries = await readLibraries(host, steamPath);
  const appNames = await readNames(host, steamPath);

  for (const library of libraries) {
    const workshop = library.available ? await readLibraryWorkshop(host, library.path) : new Map();
    library.games = await readGames(host, library, appNames, workshop);
  }

  const data: SteamData = {
    steam_path: steamPath,
    account: await findAccount(host, steamPath),
    accurate: options.accurate === true,
    total_size: 0,
    workshop_size: 0,
    libraries,
  };

  await attachPlayStats(host, data);
  recalculate(data);

  if (options.accurate) {
    await measureOnDisk(host, data, options.onScanProgress);
  }

  let nameStats: NameStats | null = null;

  if (options.workshopNames) {
    const items = allGames(data).flatMap((game) => game.workshop_items);
    nameStats = await resolveNames(host, items, {
      offline: options.offline,
      progress: options.onNameProgress,
    });
  }

  return { data, nameStats };
}

/** Copy the account's playtime records onto the games we found. */
async function attachPlayStats(host: Host, data: SteamData): Promise<void> {
  if (data.account === null) {
    return;
  }

  const stats = await readPlayStats(host, data.account);

  for (const game of allGames(data)) {
    const entry = stats.get(game.appid);

    if (entry) {
      game.playtime = entry.playtime;
      game.playtime_2weeks = entry.playtime_2weeks;
      game.last_played = entry.last_played;
    }
  }
}
