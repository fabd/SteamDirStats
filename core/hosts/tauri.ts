/**
 * The Tauri host: what `core/` uses inside the app window.
 *
 * Reads go through the fs plugin, which can only see folders the Rust side has
 * allowed (plan.md §7d) — `grantSteamAccess()` and `grantLibraryAccess()` are
 * the two calls that widen that scope as the scan discovers where Steam lives.
 * Everything the plugins cannot do is one of the Rust commands.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import * as fsPlugin from '@tauri-apps/plugin-fs';

import type { DirEntry, DiskUsage, Host, SizeProgress } from '../host.ts';

/** Payload of the `scan-progress` event the `dir_sizes` command emits. */
interface SizeProgressEvent {
  done: number;
  total: number;
}

export function createTauriHost(): Host {
  return {
    fs: {
      readTextFile(path) {
        return fsPlugin.readTextFile(path);
      },

      readFile(path) {
        return fsPlugin.readFile(path);
      },

      async readDir(path): Promise<DirEntry[]> {
        const entries = await fsPlugin.readDir(path);

        return entries.map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory,
        }));
      },

      async exists(path) {
        try {
          return await fsPlugin.exists(path);
        } catch {
          return false;
        }
      },

      async isDirectory(path) {
        try {
          return (await fsPlugin.stat(path)).isDirectory;
        } catch {
          return false;
        }
      },

      async writeTextFile(path, text) {
        await fsPlugin.writeTextFile(path, text);
      },

      async diskUsage(path): Promise<DiskUsage | null> {
        try {
          return await invoke<DiskUsage | null>('disk_usage', { path });
        } catch {
          return null;
        }
      },
    },

    http: {
      async postForm(url, form, timeoutMs) {
        // The http plugin, not the webview's fetch: a request to
        // api.steampowered.com from the tauri://localhost origin is blocked by
        // CORS, and this one is made by Rust instead.
        const response = await tauriFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(form).toString(),
          connectTimeout: timeoutMs,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.json();
      },
    },

    async registry(hive, key, value) {
      try {
        return await invoke<string | null>('read_registry', { hive, key, value });
      } catch {
        return null;
      }
    },

    async dirSizes(paths, onProgress?: SizeProgress) {
      if (paths.length === 0) {
        return [];
      }

      // Rust reports as it walks; the listener only lives as long as the call.
      const stop = onProgress
        ? await listen<SizeProgressEvent>('scan-progress', (event) => {
            onProgress(event.payload.done, event.payload.total);
          })
        : null;

      try {
        return await invoke<Array<number | null>>('dir_sizes', { paths });
      } finally {
        stop?.();
      }
    },

    async allowFolder(path) {
      try {
        // Rust allows it only if it really holds a `steamapps` folder, so a
        // false here means "not a Steam folder", not just "refused".
        return await invoke<boolean>('allow_steam_folder', { path });
      } catch {
        return false;
      }
    },

    dataDir() {
      return invoke<string>('data_dir');
    },
  };
}
