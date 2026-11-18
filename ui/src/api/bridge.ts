/**
 * The only place that knows the app is running inside Tauri.
 *
 * There is no backend to call for a scan any more: `core/` runs in the page,
 * on the Tauri host, and only reaches Rust for the registry, the file-scope
 * grants and the folder sizes (plan.md, "What Rust is for"). What is left here
 * is the wiring — building the host once, and the three actions that hand a
 * path or a URL to the shell.
 */

import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

import { createTauriHost } from '@core/hosts/tauri.ts';
import type { Host } from '@core/host.ts';
import type { ScanOptions, ScanResult } from '@core/scanner.ts';
import { scan as runScan } from '@core/scanner.ts';
import { workshopItemUrl } from '@core/models.ts';

/**
 * True when the page is running inside the app.
 *
 * Tauri injects its IPC before the page's own scripts run, so this is a plain
 * check rather than a wait for a ready event: in a browser it is simply false
 * and the store falls back to the dev fixture.
 */
export function hasBackend(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

let cachedHost: Host | null = null;

/** The one host for this page. */
export function host(): Host {
  cachedHost ??= createTauriHost();

  return cachedHost;
}

export function scan(options: ScanOptions = {}): Promise<ScanResult> {
  return runScan(host(), options);
}

/**
 * Open a game's install folder in Explorer.
 *
 * Not the opener plugin: its path scope is fixed in the capability file, which
 * cannot name library drives it has never seen. Rust opens the folder instead,
 * and only one already inside the scan's runtime grant.
 */
export function openFolder(path: string): Promise<void> {
  return invoke('open_folder', { path });
}

/**
 * Hand the uninstall to Steam, which shows its own confirmation.
 *
 * The URL is built here from the numeric appid, and the opener's permission
 * scope only allows `steam://`, so a bad id cannot become some other scheme.
 */
export function uninstall(appid: number): Promise<void> {
  return openUrl(`steam://uninstall/${Math.trunc(appid)}`);
}

/** Open a Workshop item's page in Steam, where it can be unsubscribed. */
export function workshopPage(itemid: number): Promise<void> {
  return openUrl(`steam://url/CommunityFilePage/${Math.trunc(itemid)}`);
}

/** The item's page on the web, for a browser rather than the Steam client. */
export function workshopWebUrl(itemid: number): string {
  return workshopItemUrl(itemid);
}
