/** Read the list of Steam library folders from libraryfolders.vdf. */

import type { Host } from './host.ts';
import type { Library } from './models.ts';
import { join, normalize, normcase } from './paths.ts';
import * as vdf from './vdf.ts';

async function libraryFoldersFile(host: Host, steamPath: string): Promise<string | null> {
  for (const relative of [
    ['steamapps', 'libraryfolders.vdf'],
    ['config', 'libraryfolders.vdf'],
  ]) {
    const path = join(steamPath, ...relative);

    if (await host.fs.exists(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Return every library, the main Steam folder first.
 *
 * Handles both libraryfolders.vdf formats:
 *   - current: "0" { "path" "D:\\SteamLibrary" "label" "" ... }
 *   - legacy (before 2021): "1" "D:\\SteamLibrary"
 * The legacy format does not list the main Steam folder, so it is always added.
 */
export async function readLibraries(host: Host, steamPath: string): Promise<Library[]> {
  const entries: Array<{ path: string; label: string }> = [{ path: steamPath, label: '' }];
  const vdfPath = await libraryFoldersFile(host, steamPath);

  if (vdfPath) {
    const root = vdf.node(await vdf.load(host, vdfPath), 'libraryfolders');

    for (const [key, value] of Object.entries(root ?? {})) {
      if (!/^\d+$/.test(key)) {
        continue; // e.g. "contentstatsid", "timenextstatsreport"
      }

      const path = vdf.isNode(value) ? vdf.str(value, 'path') : value;
      const label = vdf.isNode(value) ? (vdf.str(value, 'label') ?? '') : '';

      if (path) {
        entries.push({ path, label });
      }
    }
  }

  const libraries: Library[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const path = normalize(entry.path);
    const key = normcase(path);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    libraries.push(await makeLibrary(host, path, entry.label));
  }

  return libraries;
}

async function makeLibrary(host: Host, path: string, label: string): Promise<Library> {
  // Each library is on whatever drive the user put it on, so the app only
  // gains access to it here, once libraryfolders.vdf has named it (plan.md §7d).
  await host.allowFolder(path);

  const available = await host.fs.isDirectory(join(path, 'steamapps'));
  const usage = available ? await host.fs.diskUsage(path) : null;

  return {
    path,
    label,
    available,
    disk_total: usage ? usage.total : null,
    disk_free: usage ? usage.free : null,
    size_on_disk: 0,
    workshop_size: 0,
    games: [],
  };
}
