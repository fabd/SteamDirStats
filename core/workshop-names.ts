/**
 * Resolve Workshop item names through Steam's public web API, with a cache.
 *
 * Item names are not stored on disk, only numeric IDs, so the only way to show
 * them is to ask Steam: ISteamRemoteStorage/GetPublishedFileDetails, which
 * needs no API key. Answers are cached in the app folder, so the names are
 * fetched once and later scans are offline and instant.
 *
 * Items the API will not describe (unlisted, private, or removed) can still
 * have a name in their own folder, which is where Steam gets the names it
 * shows for them, so that is tried last.
 *
 * Nothing here throws: a machine with no network, or an item with no name
 * anywhere, simply ends up without a name, and the UI falls back to showing
 * the ID plus a link to the Steam Community page.
 */

import type { Host } from './host.ts';
import type { NameStats, WorkshopItem } from './models.ts';
import { join } from './paths.ts';
import { localTitle } from './workshop.ts';

export const API_URL =
  'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';
export const CACHE_FILE = 'workshop-names.json';
const CACHE_VERSION = 1;

const BATCH_SIZE = 100; // IDs per request
const TIMEOUT_MS = 10_000; // per request
const MAX_FAILURES = 2; // consecutive request failures before giving up
const MISS_TTL_MS = 7 * 24 * 3600 * 1000; // retry items the API did not know after a week

/** Progress callback: (items resolved so far, items to resolve). */
export type NameProgress = (done: number, total: number) => void;

export interface ResolveOptions {
  offline?: boolean;
  progress?: NameProgress;
  /** Override the cache location; the tests use it, the app does not. */
  cachePath?: string;
}

/** How many items `resolveNames` was asked about in total. */
export function requested(stats: NameStats): number {
  return stats.fetched + stats.local + stats.unavailable + stats.failed;
}

/**
 * Fill in `name` on every item: from the cache, the API, then the item folder.
 *
 * `offline` skips the API; the cache and the item folders still work. The same
 * item can be installed in several libraries, so items are grouped by ID and
 * each ID is asked about once.
 */
export async function resolveNames(
  host: Host,
  items: Iterable<WorkshopItem>,
  options: ResolveOptions = {},
): Promise<NameStats> {
  const byId = new Map<number, WorkshopItem[]>();

  for (const item of items) {
    const group = byId.get(item.itemid);

    if (group) {
      group.push(item);
    } else {
      byId.set(item.itemid, [item]);
    }
  }

  const cache = await NameCache.open(host, options.cachePath);
  const cached = new Set<number>();
  const missing: number[] = [];

  for (const [itemid, group] of byId) {
    const { known, name } = cache.get(itemid);

    if (known && name) {
      cached.add(itemid);
      setName(group, name);
    } else if (!known) {
      missing.push(itemid);
    }
  }

  const fetched = new Set<number>();
  // No answer from the API: offline, or out of reach.
  const unanswered = new Set(missing);

  if (missing.length > 0 && !options.offline) {
    await fetchMissing(host, missing, byId, cache, fetched, unanswered, options.progress);
    await cache.save(host);
  }

  // Items the API will not describe can still name themselves on disk.
  const local = new Set<number>();

  for (const [itemid, group] of byId) {
    const first = group[0] as WorkshopItem;

    if (first.name) {
      continue;
    }

    const name = await localTitle(host, first.path);

    if (name) {
      setName(group, name);
      local.add(itemid);
    }
  }

  const failed = [...unanswered].filter((itemid) => !local.has(itemid)).length;

  return {
    cached: cached.size,
    fetched: fetched.size,
    local: local.size,
    failed,
    unavailable: byId.size - cached.size - fetched.size - local.size - failed,
  };
}

/** Ask the API about the items the cache does not cover, a batch per request. */
async function fetchMissing(
  host: Host,
  missing: number[],
  byId: Map<number, WorkshopItem[]>,
  cache: NameCache,
  fetched: Set<number>,
  unanswered: Set<number>,
  progress?: NameProgress,
): Promise<void> {
  let failures = 0;
  let done = 0;

  progress?.(0, missing.length);

  for (let start = 0; start < missing.length; start += BATCH_SIZE) {
    const batch = missing.slice(start, start + BATCH_SIZE);
    const names = await fetchNames(host, batch);

    if (names === null) {
      failures += 1;

      // Something is wrong with the network; do not sit through the rest.
      if (failures >= MAX_FAILURES) {
        break;
      }

      continue;
    }

    failures = 0;

    for (const itemid of batch) {
      const name = names.get(itemid) ?? null;
      cache.set(itemid, name);
      unanswered.delete(itemid);

      if (name) {
        fetched.add(itemid);
        setName(byId.get(itemid) ?? [], name);
      }
    }

    done += batch.length;
    progress?.(done, missing.length);
  }
}

function setName(items: WorkshopItem[], name: string): void {
  for (const item of items) {
    item.name = name;
  }
}

/**
 * Ask the API about one batch. Returns null if the request itself failed.
 *
 * An item in the answer with no title (deleted, private, or the wrong kind of
 * published file) maps to null: a definite "no name", which we cache.
 */
async function fetchNames(
  host: Host,
  itemids: number[],
): Promise<Map<number, string | null> | null> {
  const form: Record<string, string> = { itemcount: String(itemids.length) };

  itemids.forEach((itemid, index) => {
    form[`publishedfileids[${index}]`] = String(itemid);
  });

  let answer: unknown;

  try {
    answer = await host.http.postForm(API_URL, form, TIMEOUT_MS);
  } catch {
    return null; // network, HTTP, timeout, malformed JSON
  }

  const details = (answer as { response?: { publishedfiledetails?: unknown } })?.response
    ?.publishedfiledetails;

  if (!Array.isArray(details)) {
    return null;
  }

  const names = new Map<number, string | null>(itemids.map((itemid) => [itemid, null]));

  for (const detail of details) {
    if (typeof detail !== 'object' || detail === null) {
      continue;
    }

    const entry = detail as { publishedfileid?: unknown; title?: unknown };
    const itemid = Number(entry.publishedfileid);

    if (!Number.isSafeInteger(itemid)) {
      continue;
    }

    names.set(itemid, typeof entry.title === 'string' && entry.title ? entry.title : null);
  }

  return names;
}

interface CacheEntry {
  name: string | null;
  /** Unix seconds, when the answer was recorded. */
  fetched: number;
}

/** `{itemid: name}` on disk, remembering misses too so we stop asking. */
export class NameCache {
  path: string;
  entries: Record<string, CacheEntry>;
  dirty = false;

  constructor(path: string, entries: Record<string, CacheEntry>) {
    this.path = path;
    this.entries = entries;
  }

  static async open(host: Host, path?: string): Promise<NameCache> {
    const file = path ?? join(await host.dataDir(), CACHE_FILE);

    return new NameCache(file, await load(host, file));
  }

  /** Whether the answer for an item is known, and the name if there is one. */
  get(itemid: number): { known: boolean; name: string | null } {
    const entry = this.entries[String(itemid)];

    if (!entry) {
      return { known: false, name: null };
    }

    if (entry.name) {
      return { known: true, name: entry.name };
    }

    // A miss: ask again once it is stale, in case the item came back.
    const age = Date.now() - entry.fetched * 1000;

    return { known: age < MISS_TTL_MS, name: null };
  }

  set(itemid: number, name: string | null): void {
    this.entries[String(itemid)] = { name, fetched: Math.floor(Date.now() / 1000) };
    this.dirty = true;
  }

  /** Write the cache. Returns false if it could not be written. */
  async save(host: Host): Promise<boolean> {
    if (!this.dirty) {
      return true;
    }

    const document = { version: CACHE_VERSION, items: this.entries };

    try {
      await host.fs.writeTextFile(this.path, JSON.stringify(document, null, 1));
    } catch {
      return false;
    }

    this.dirty = false;

    return true;
  }
}

async function load(host: Host, path: string): Promise<Record<string, CacheEntry>> {
  let document: unknown;

  try {
    document = JSON.parse(await host.fs.readTextFile(path));
  } catch {
    return {};
  }

  if (typeof document !== 'object' || document === null) {
    return {};
  }

  const { version, items } = document as { version?: unknown; items?: unknown };

  if (version !== CACHE_VERSION || typeof items !== 'object' || items === null) {
    return {};
  }

  return items as Record<string, CacheEntry>;
}
