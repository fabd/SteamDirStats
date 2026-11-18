/** Read installed games from a library's appmanifest_<appid>.acf files. */

import type { Host } from './host.ts';
import { STATE_FULLY_INSTALLED, type Game, type Library } from './models.ts';
import { join } from './paths.ts';
import * as vdf from './vdf.ts';
import type { WorkshopApp } from './workshop.ts';

/**
 * Return the games installed in `library`, largest first.
 *
 * `appNames` maps appid to name (from Steam's appinfo cache) and is used for
 * manifests that only hold a placeholder name. `workshop` maps appid to the
 * Workshop content installed for it in this library.
 */
export async function readGames(
  host: Host,
  library: Library,
  appNames?: Map<number, string>,
  workshop?: Map<number, WorkshopApp>,
): Promise<Game[]> {
  if (!library.available) {
    return [];
  }

  const steamapps = join(library.path, 'steamapps');
  const games: Game[] = [];
  let entries;

  try {
    entries = await host.fs.readDir(steamapps);
  } catch {
    return [];
  }

  for (const entry of entries) {
    const name = entry.name.toLowerCase();

    if (!name.startsWith('appmanifest_') || !name.endsWith('.acf')) {
      continue;
    }

    const game = await readManifest(host, join(steamapps, entry.name), steamapps, appNames);

    if (game) {
      attachWorkshop(game, workshop);
      games.push(game);
    }
  }

  sortGames(games);

  return games;
}

/**
 * Largest first, by name for ties.
 *
 * Code-point order rather than `localeCompare`, so two runs on the same data
 * always produce the same JSON regardless of the machine's locale.
 */
export function sortGames(games: Game[]): void {
  games.sort((a, b) => {
    if (a.total_size !== b.total_size) {
      return b.total_size - a.total_size;
    }

    const left = a.name.toLowerCase();
    const right = b.name.toLowerCase();

    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/** Parse one appmanifest file. Returns null if it is unreadable or invalid. */
export async function readManifest(
  host: Host,
  manifestPath: string,
  steamapps: string,
  appNames?: Map<number, string>,
): Promise<Game | null> {
  const state = vdf.node(await vdf.load(host, manifestPath), 'appstate');
  const appid = vdf.int(state, 'appid');

  if (state === null || appid === null) {
    return null;
  }

  const installDir = vdf.str(state, 'installdir') ?? '';
  const sizeOnDisk = vdf.int(state, 'sizeondisk') ?? 0;
  const stateFlags = vdf.int(state, 'stateflags') ?? 0;

  return {
    appid,
    name: gameName(appid, vdf.str(state, 'name'), installDir, appNames),
    install_dir: installDir,
    install_path: installDir ? join(steamapps, 'common', installDir) : '',
    size_on_disk: sizeOnDisk,
    workshop_size: 0,
    total_size: sizeOnDisk,
    state_flags: stateFlags,
    fully_installed: (stateFlags & STATE_FULLY_INSTALLED) !== 0,
    last_updated: vdf.int(state, 'lastupdated'),
    playtime: null,
    playtime_2weeks: null,
    last_played: null,
    workshop_items: [],
  };
}

function attachWorkshop(game: Game, workshop?: Map<number, WorkshopApp>): void {
  const app = workshop?.get(game.appid);

  if (app) {
    game.workshop_size = app.size;
    game.workshop_items = app.items;
    game.total_size = game.size_on_disk + game.workshop_size;
  }
}

/**
 * Pick the best name available for a game.
 *
 * Steam writes a placeholder (`appid_823910`) when it installs a game whose
 * name it does not know yet, and shows the real name from its appinfo cache
 * instead; do the same, then fall back to the install folder.
 */
function gameName(
  appid: number,
  manifestName: string | null,
  installDir: string,
  appNames?: Map<number, string>,
): string {
  const name = manifestName ?? '';

  if (name && name !== `appid_${appid}`) {
    return name;
  }

  return appNames?.get(appid) || installDir || `App ${appid}`;
}
