/**
 * Read installed Workshop content from a library's appworkshop_<appid>.acf files.
 *
 * Workshop content lives in the same library as the game it belongs to, under
 * `steamapps/workshop/`, and the game's own `SizeOnDisk` does not include it.
 * The manifests hold numeric item IDs, not names; some item folders do carry a
 * name of their own (see `localTitle`), but the general case needs the web API
 * in `workshop-names.ts`.
 */

import type { Host } from './host.ts';
import { workshopItemUrl, type WorkshopItem } from './models.ts';
import { join } from './paths.ts';
import * as vdf from './vdf.ts';

/** The Workshop content installed for one game. */
export interface WorkshopApp {
  appid: number;
  size: number;
  items: WorkshopItem[];
}

/** Return a map of appid to WorkshopApp for every appworkshop manifest in a library. */
export async function readLibraryWorkshop(
  host: Host,
  libraryPath: string,
): Promise<Map<number, WorkshopApp>> {
  const workshopDir = join(libraryPath, 'steamapps', 'workshop');
  const apps = new Map<number, WorkshopApp>();
  let entries;

  try {
    entries = await host.fs.readDir(workshopDir);
  } catch {
    return apps;
  }

  for (const entry of entries) {
    const name = entry.name.toLowerCase();

    if (name.startsWith('appworkshop_') && name.endsWith('.acf')) {
      const app = await readManifest(host, join(workshopDir, entry.name), workshopDir);

      if (app) {
        apps.set(app.appid, app);
      }
    }
  }

  return apps;
}

/** Parse one appworkshop file. Returns null if it is unreadable or invalid. */
export async function readManifest(
  host: Host,
  manifestPath: string,
  workshopDir: string,
): Promise<WorkshopApp | null> {
  const state = vdf.node(await vdf.load(host, manifestPath), 'appworkshop');
  const appid = vdf.int(state, 'appid');

  if (state === null || appid === null) {
    return null;
  }

  const installed = vdf.node(state, 'workshopitemsinstalled');
  const items: WorkshopItem[] = [];

  for (const [itemid, details] of Object.entries(installed ?? {})) {
    const item = readItem(itemid, details, workshopDir, appid);

    if (item) {
      items.push(item);
    }
  }

  sortItems(items);

  // SizeOnDisk is the whole app's Workshop folder; on a healthy manifest it
  // equals the sum of the item sizes, so either one works as the total.
  const size = vdf.int(state, 'sizeondisk');

  return {
    appid,
    size: size ?? items.reduce((sum, item) => sum + item.size, 0),
    items,
  };
}

/** Largest first, by id for ties, as the CLI report and the table show them. */
export function sortItems(items: WorkshopItem[]): void {
  items.sort((a, b) => b.size - a.size || a.itemid - b.itemid);
}

function readItem(
  itemid: string,
  details: string | vdf.VdfNode,
  workshopDir: string,
  appid: number,
): WorkshopItem | null {
  const id = vdf.toInt(itemid);

  if (id === null || !vdf.isNode(details)) {
    return null;
  }

  return {
    itemid: id,
    size: vdf.int(details, 'size') ?? 0,
    path: join(workshopDir, 'content', String(appid), String(id)),
    time_updated: vdf.int(details, 'timeupdated'),
    name: null,
    url: workshopItemUrl(id),
  };
}

/**
 * The title stored in an item folder, if the item has one.
 *
 * Items published with the Source 2 tools (Half-Life: Alyx, SteamVR Home, ...)
 * keep a `publish_data.txt` next to their files holding the title as it was
 * published. It is the only local source of item names, and it covers items
 * the public web API will not describe, such as unlisted ones.
 */
export async function localTitle(host: Host, itemPath: string): Promise<string | null> {
  const data = vdf.node(await vdf.load(host, join(itemPath, 'publish_data.txt')), 'publish_data');
  const title = vdf.str(data, 'title');

  return title ? title : null;
}
