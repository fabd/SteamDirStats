/**
 * The app's own preferences, stored portably in settings.json.
 *
 * Where the file lives is the host's problem (`dataDir()`: next to the exe
 * when that folder is writable, %APPDATA% otherwise, plan.md §9); this module
 * only reads, merges and writes it.
 */

import type { Host } from './host.ts';
import { join } from './paths.ts';

export const FILENAME = 'settings.json';

/** Saved by the window itself (plan.md §8), not by the UI. */
export interface WindowPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface Settings {
  /** "grouped" or "mixed". */
  layout: string;
  /** Walk the folders instead of trusting the manifests. */
  accurate: boolean;
  window?: WindowPlacement;
  [key: string]: unknown;
}

export const DEFAULTS: Settings = {
  layout: 'grouped',
  accurate: false,
};

export async function settingsPath(host: Host): Promise<string> {
  return join(await host.dataDir(), FILENAME);
}

/**
 * Everything we have stored, with the defaults filled in.
 *
 * A missing, unreadable or corrupt file is not worth an error: the app is
 * perfectly usable with the defaults.
 */
export async function load(host: Host): Promise<Settings> {
  let stored: unknown;

  try {
    stored = JSON.parse(await host.fs.readTextFile(await settingsPath(host)));
  } catch {
    return { ...DEFAULTS };
  }

  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return { ...DEFAULTS };
  }

  return { ...DEFAULTS, ...(stored as Partial<Settings>) };
}

/**
 * Merge `values` into the stored settings and write them back.
 *
 * Merging rather than replacing: the window placement (§8) writes its own
 * keys, and the UI must not wipe them by saving a toggle.
 */
export async function save(host: Host, values: Partial<Settings>): Promise<Settings> {
  const merged = { ...(await load(host)), ...values };

  try {
    await host.fs.writeTextFile(await settingsPath(host), JSON.stringify(merged, null, 2));
  } catch {
    // Read-only folder: the values still apply for this session.
  }

  return merged;
}
