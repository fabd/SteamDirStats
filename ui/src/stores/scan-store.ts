/**
 * The one copy of the scan results, shared by every view.
 *
 * A plain `reactive()` module rather than Pinia: the state is small and there
 * is only ever one scan in flight. Components import `scanStore` and read it
 * directly, so selecting a tile and selecting a table row are the same thing.
 */

import { computed, reactive } from 'vue';

import { hasBackend, scan } from '@/api/bridge';
import type { Game, Library, SteamData } from '@core/models.ts';

/** What the status bar shows while an accurate scan runs. */
export interface ScanProgress {
  done: number;
  total: number;
  /** The game being measured. */
  name: string;
}

interface ScanState {
  data: SteamData | null;
  isLoading: boolean;
  /** Message shown in the status bar when a scan or an action fails. */
  error: string;
  progress: ScanProgress | null;
  /** True while reading the dev fixture instead of a real scan. */
  isFixture: boolean;
  /** The game the table and treemap highlight, by appid. */
  selected: number | null;
  /** Appids whose Workshop items are listed in the table. */
  expanded: Set<number>;
  /**
   * A game the table should scroll into view, once.
   *
   * Set when the expansion was asked for from the treemap, where the row is
   * usually off-screen; the table clears it again after scrolling.
   */
  revealed: number | null;
}

export const scanStore = reactive<ScanState>({
  data: null,
  isLoading: false,
  error: '',
  progress: null,
  isFixture: false,
  selected: null,
  expanded: new Set(),
  revealed: null,
});

/** Every game across all libraries, largest first. */
export const games = computed<Game[]>(() =>
  (scanStore.data?.libraries ?? [])
    .flatMap((lib) => lib.games)
    .sort((a, b) => b.total_size - a.total_size),
);

export const libraries = computed<Library[]>(() =>
  (scanStore.data?.libraries ?? []).filter((lib) => lib.available),
);

/** The library a game belongs to; games carry no back-reference. */
export function libraryOf(game: Game): Library | null {
  return (scanStore.data?.libraries ?? []).find((lib) => lib.games.includes(game)) ?? null;
}

/**
 * Scan, or fall back to the dev fixture when running outside the app.
 *
 * The fixture lets the UI be built in a plain browser with `npm run dev`. It
 * lives at `ui/fixture.json`, outside `src/`, so Vite serves it in dev but
 * never bundles real library data into a release build.
 */
export async function load(options: { accurate?: boolean } = {}): Promise<void> {
  scanStore.isLoading = true;
  scanStore.error = '';
  scanStore.progress = null;

  try {
    if (hasBackend()) {
      // workshopNames: the item rows in the table are useless without them,
      // and the lookup is cached on disk, so only new items cost a request.
      const { data } = await scan({
        accurate: options.accurate,
        workshopNames: true,
        onScanProgress: (done, total, name) => {
          scanStore.progress = { done, total, name };
        },
        onNameProgress: (done, total) => {
          scanStore.progress = { done, total, name: 'Workshop item names' };
        },
      });
      scanStore.data = data;
    } else {
      scanStore.data = await loadFixture();
    }

    scanStore.isFixture = !hasBackend();
  } catch (err) {
    scanStore.error = err instanceof Error ? err.message : String(err);
  } finally {
    scanStore.isLoading = false;
    scanStore.progress = null;
  }
}

/** Rescan and reset to the startup view, as the Refresh button does. */
export async function refresh(options: { accurate?: boolean } = {}): Promise<void> {
  scanStore.selected = null;
  scanStore.expanded.clear();
  scanStore.revealed = null;
  await load(options);
}

/** Show a message in the status bar; used by actions that cannot complete. */
export function notify(message: string): void {
  scanStore.error = message;
}

export function select(appid: number | null): void {
  scanStore.selected = appid;
}

export function isExpanded(appid: number): boolean {
  return scanStore.expanded.has(appid);
}

/** The table's own expand control: a game's items come and go. */
export function toggleExpanded(appid: number): void {
  if (scanStore.expanded.has(appid)) {
    scanStore.expanded.delete(appid);
  } else {
    scanStore.expanded.add(appid);
  }
}

/**
 * Show a game's Workshop items, from the treemap or the context menu.
 *
 * Expands rather than toggles: both callers say "view the items", and a tile
 * the user double-clicks twice should not fold the rows away again. The row
 * is scrolled into view because the table is rarely already at that game.
 */
export function expandWorkshop(appid: number): void {
  scanStore.expanded.add(appid);
  scanStore.selected = appid;
  scanStore.revealed = appid;
}

/** Called by the table once it has scrolled; nothing else should clear it. */
export function clearRevealed(): void {
  scanStore.revealed = null;
}

const MISSING_FIXTURE =
  'Not running in the app, and no ui/fixture.json ' +
  '(create one with: node tools/steamdirstats-cli.ts --json > ui/fixture.json)';

async function loadFixture(): Promise<SteamData> {
  if (!import.meta.env.DEV) {
    throw new Error('Not running in the app: no scan is possible');
  }

  const response = await fetch(`${import.meta.env.BASE_URL}fixture.json`);

  if (!response.ok) {
    throw new Error(MISSING_FIXTURE);
  }

  return (await response.json()) as SteamData;
}
