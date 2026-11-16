/**
 * The one copy of the scan results, shared by every view.
 *
 * A plain `reactive()` module rather than Pinia: the state is small and there
 * is only ever one scan in flight. Components import `scanStore` and read it
 * directly, so selecting a tile and selecting a table row are the same thing.
 */

import { computed, reactive } from 'vue';

import { hasBackend, api, scan } from '@/api/bridge';
import type { Game, Library, ScanProgress, SteamData } from '@/api/types';
import { libraryColors } from '@/lib/colors';

declare global {
  interface Window {
    /** Called from Python via evaluate_js() while an accurate scan runs. */
    sdScanProgress?: (done: number, total: number, name: string) => void;
  }
}

interface ScanState {
  data: SteamData | null;
  loading: boolean;
  /** Message shown in the status bar when a scan or an action fails. */
  error: string;
  progress: ScanProgress | null;
  /** True while reading the dev fixture instead of a real scan. */
  fixture: boolean;
  /** The game the table and treemap highlight, by appid. */
  selected: number | null;
  /** The game being inspected, or null for the combined view. */
  inspecting: number | null;
}

export const scanStore = reactive<ScanState>({
  data: null,
  loading: false,
  error: '',
  progress: null,
  fixture: false,
  selected: null,
  inspecting: null,
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

/** Library path → colour, stable while the set of libraries is unchanged. */
export const colors = computed(() =>
  libraryColors((scanStore.data?.libraries ?? []).map((lib) => lib.path)),
);

export const inspectedGame = computed<Game | null>(
  () => games.value.find((g) => g.appid === scanStore.inspecting) ?? null,
);

/** The library a game belongs to; games carry no back-reference. */
export function libraryOf(game: Game): Library | null {
  return (scanStore.data?.libraries ?? []).find((lib) => lib.games.includes(game)) ?? null;
}

/**
 * Scan, or fall back to the dev fixture when no Python backend answered.
 *
 * The fixture lets the UI be built in a plain browser with `npm run dev`. It
 * lives at `ui/fixture.json`, outside `src/`, so Vite serves it in dev but
 * never bundles real library data into a release build.
 */
export async function load(options: { accurate?: boolean } = {}): Promise<void> {
  scanStore.loading = true;
  scanStore.error = '';
  scanStore.progress = null;
  try {
    await api();
    scanStore.data = hasBackend() ? await scan(options) : await loadFixture();
    scanStore.fixture = !hasBackend();
  } catch (err) {
    scanStore.error = err instanceof Error ? err.message : String(err);
  } finally {
    scanStore.loading = false;
    scanStore.progress = null;
  }
}

/** Rescan and reset to the startup view, as the Refresh button does. */
export async function refresh(options: { accurate?: boolean } = {}): Promise<void> {
  scanStore.selected = null;
  scanStore.inspecting = null;
  await load(options);
}

/** Show a message in the status bar; used by actions that cannot complete. */
export function notify(message: string): void {
  scanStore.error = message;
}

export function select(appid: number | null): void {
  scanStore.selected = appid;
}

export function inspect(appid: number | null): void {
  scanStore.inspecting = appid;
  if (appid !== null) scanStore.selected = appid;
}

const MISSING_FIXTURE =
  'No Python backend and no ui/fixture.json ' +
  '(create one with: python -m steamdirstats --json > ui/fixture.json)';

async function loadFixture(): Promise<SteamData> {
  if (!import.meta.env.DEV) throw new Error('No Python backend');
  const response = await fetch(`${import.meta.env.BASE_URL}fixture.json`);
  if (!response.ok) throw new Error(MISSING_FIXTURE);
  return (await response.json()) as SteamData;
}

window.sdScanProgress = (done, total, name) => {
  scanStore.progress = { done, total, name };
};
