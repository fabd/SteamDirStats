/** Find the Steam installation folder on Windows. */

import type { Host } from './host.ts';
import { normalize, join } from './paths.ts';

export const DEFAULT_PATHS = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];

/** Registry locations, in the order they are tried. */
const REGISTRY_LOCATIONS: Array<{ hive: 'HKCU' | 'HKLM'; key: string; value: string }> = [
  { hive: 'HKCU', key: 'Software\\Valve\\Steam', value: 'SteamPath' },
  { hive: 'HKLM', key: 'SOFTWARE\\WOW6432Node\\Valve\\Steam', value: 'InstallPath' },
  { hive: 'HKLM', key: 'SOFTWARE\\Valve\\Steam', value: 'InstallPath' },
];

export class SteamNotFoundError extends Error {}

export async function isSteamDir(host: Host, path: string): Promise<boolean> {
  return host.fs.isDirectory(join(path, 'steamapps'));
}

/**
 * Return the Steam folder, or throw SteamNotFoundError.
 *
 * If `override` is given it is used as-is (after validation). Otherwise: the
 * Windows registry, then the default install folders.
 */
export async function findSteamPath(host: Host, override?: string | null): Promise<string> {
  if (override) {
    const path = normalize(override);

    // The grant is what makes the folder readable in the app, so it has to
    // come before the check that reads it.
    await host.allowFolder(path);

    if (!(await isSteamDir(host, path))) {
      throw new SteamNotFoundError(`Not a Steam folder (no steamapps inside): ${path}`);
    }

    return path;
  }

  for (const candidate of [...(await registryPaths(host)), ...DEFAULT_PATHS]) {
    // SteamPath comes back with forward slashes; normalize fixes it.
    const path = normalize(candidate);

    if ((await host.allowFolder(path)) && (await isSteamDir(host, path))) {
      return path;
    }
  }

  throw new SteamNotFoundError('Could not find Steam.');
}

async function registryPaths(host: Host): Promise<string[]> {
  const paths: string[] = [];

  for (const { hive, key, value } of REGISTRY_LOCATIONS) {
    let found: string | null = null;

    try {
      found = await host.registry(hive, key, value);
    } catch {
      continue;
    }

    if (found) {
      paths.push(found);
    }
  }

  return paths;
}
