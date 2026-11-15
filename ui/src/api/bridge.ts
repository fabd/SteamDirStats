/**
 * The only place that touches `window.pywebview`.
 *
 * pywebview injects its API asynchronously and fires `pywebviewready` when the
 * bridge is usable, so every call waits for that first. In a plain browser the
 * event never comes: `hasBackend()` is false and callers fall back to the dev
 * fixture (see stores/scan-store.ts).
 */

import type { ScanOptions, SteamData } from '@/api/types';

interface PywebviewApi {
  scan(options: ScanOptions): Promise<SteamData>;
  open_folder(path: string): Promise<boolean>;
  uninstall(appid: number): Promise<boolean>;
  get_settings(): Promise<Record<string, unknown>>;
  set_settings(values: Record<string, unknown>): Promise<Record<string, unknown>>;
}

declare global {
  interface Window {
    pywebview?: { api: PywebviewApi };
  }
}

/**
 * How long we wait for `pywebviewready` before giving up on the backend.
 *
 * Shorter in dev, where the event is never coming and the wait only delays the
 * fixture fallback on every reload.
 */
const READY_TIMEOUT_MS = import.meta.env.DEV ? 1000 : 5000;

let readyPromise: Promise<void> | null = null;

/**
 * Whether the bridge is usable.
 *
 * `window.pywebview.api` exists as an empty placeholder before the methods are
 * attached, so test for a method rather than for the object: a truthiness
 * check here reports a backend that cannot yet be called.
 */
function isReady(): boolean {
  return typeof window.pywebview?.api?.scan === 'function';
}

function waitForApi(): Promise<void> {
  if (isReady()) return Promise.resolve();

  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('pywebviewready', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, READY_TIMEOUT_MS);
    window.addEventListener('pywebviewready', done);
  });
}

/**
 * Resolves to the Python API, or null when running outside pywebview.
 *
 * The object is looked up fresh every time: pywebview replaces it while
 * setting the bridge up, so a reference kept from before `pywebviewready`
 * goes stale.
 */
export async function api(): Promise<PywebviewApi | null> {
  readyPromise ??= waitForApi();
  await readyPromise;
  return isReady() ? (window.pywebview?.api ?? null) : null;
}

/** True once a Python backend is attached and callable. Await `api()` first. */
export function hasBackend(): boolean {
  return isReady();
}

async function call<T>(name: keyof PywebviewApi, run: (a: PywebviewApi) => Promise<T>): Promise<T> {
  const a = await api();
  if (!a) throw new Error(`No Python backend: ${name}() is unavailable`);
  return run(a);
}

export function scan(options: ScanOptions = {}): Promise<SteamData> {
  return call('scan', (a) => a.scan(options));
}

export function openFolder(path: string): Promise<boolean> {
  return call('open_folder', (a) => a.open_folder(path));
}

export function uninstall(appid: number): Promise<boolean> {
  return call('uninstall', (a) => a.uninstall(appid));
}

export function getSettings(): Promise<Record<string, unknown>> {
  return call('get_settings', (a) => a.get_settings());
}

export function setSettings(values: Record<string, unknown>): Promise<Record<string, unknown>> {
  return call('set_settings', (a) => a.set_settings(values));
}
