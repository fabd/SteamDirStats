/**
 * The Node host: what `core/` uses when the CLI runs it.
 *
 * Everything here is the standard library — no dependencies, so
 * `node tools/steamdirstats-cli.ts` runs with nothing installed. The app's
 * host is `core/hosts/tauri.ts`; the scanner above them cannot tell which one
 * it is talking to.
 */

import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { DirEntry, DiskUsage, Host, SizeProgress } from '../host.ts';

const execFileAsync = promisify(execFile);

const APP_NAME = 'SteamDirStats';

export function createNodeHost(): Host {
  return {
    fs: {
      async readTextFile(file) {
        return fs.readFile(file, 'utf8');
      },

      async readFile(file) {
        return new Uint8Array(await fs.readFile(file));
      },

      async readDir(dir): Promise<DirEntry[]> {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        return entries.map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
        }));
      },

      async exists(file) {
        try {
          await fs.access(file, constants.F_OK);

          return true;
        } catch {
          return false;
        }
      },

      async isDirectory(dir) {
        try {
          return (await fs.stat(dir)).isDirectory();
        } catch {
          return false;
        }
      },

      async writeTextFile(file, text) {
        // Written beside the target and renamed, so an interrupted write
        // cannot leave a half-finished cache behind.
        const temp = `${file}.tmp`;
        await fs.writeFile(temp, text, 'utf8');
        await fs.rename(temp, file);
      },

      async diskUsage(dir): Promise<DiskUsage | null> {
        try {
          const stats = await fs.statfs(dir);

          return {
            total: Number(stats.blocks) * Number(stats.bsize),
            free: Number(stats.bavail) * Number(stats.bsize),
          };
        } catch {
          return null;
        }
      },
    },

    http: {
      async postForm(url, form, timeoutMs) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(form).toString(),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.json();
      },
    },

    async registry(hive, key, value) {
      // `reg query` rather than a native module, so the CLI stays
      // dependency-free. The app reads the registry in Rust instead.
      const root = hive === 'HKCU' ? 'HKCU' : 'HKLM';

      try {
        const { stdout } = await execFileAsync('reg', ['query', `${root}\\${key}`, '/v', value], {
          windowsHide: true,
        });

        // "    SteamPath    REG_SZ    e:/steam"
        const match = stdout.match(new RegExp(`^\\s*${value}\\s+REG_\\w+\\s+(.*)$`, 'im'));

        return match ? (match[1] ?? '').trim() || null : null;
      } catch {
        return null;
      }
    },

    async dirSizes(paths, onProgress?: SizeProgress) {
      const sizes: Array<number | null> = [];

      for (const [index, dir] of paths.entries()) {
        onProgress?.(index, paths.length);
        sizes.push(await folderSize(dir));
      }

      onProgress?.(paths.length, paths.length);

      return sizes;
    },

    async allowFolder() {
      // Nothing to grant: a Node process already reads whatever the user can.
      return true;
    },

    async dataDir() {
      // The CLI shares the app's files: next to the executable when that is
      // writable, %APPDATA% otherwise (plan.md §9). For the CLI "the
      // executable" is the project folder, since that is where a developer
      // expects the cache to land.
      const local = process.cwd();

      if (await writable(local)) {
        return local;
      }

      const base = process.env['APPDATA'] || os.homedir();
      const folder = path.join(base, APP_NAME);

      try {
        await fs.mkdir(folder, { recursive: true });
      } catch {
        // Fall through: the caller treats a failed write as "no cache".
      }

      return folder;
    },
  };
}

async function writable(dir: string): Promise<boolean> {
  try {
    await fs.access(dir, constants.W_OK);

    return true;
  } catch {
    return false;
  }
}

/**
 * Total size of every file under `path`, or null if it cannot be read.
 *
 * Never throws: a folder that disappears mid-walk (Steam updating a game) or
 * one we may not read is skipped, and the rest is still counted. Junctions and
 * symlinks are not followed, so content shared between libraries is not
 * counted twice.
 */
async function folderSize(dir: string): Promise<number | null> {
  try {
    if (!(await fs.stat(dir)).isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }

  let total = 0;
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries;

    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue; // vanished, or not ours to read
    }

    const files: string[] = [];

    for (const entry of entries) {
      const full = path.join(current, entry.name);

      if (entry.isSymbolicLink()) {
        continue; // junctions included: content is counted where it really lives
      }

      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }

    // A readdir gives no sizes on Windows, so every file costs its own lstat.
    // Issuing a folder's worth at once keeps the disk busy instead of paying
    // the round trip one file at a time (the Rust walker the app uses has the
    // same problem and solves it with threads).
    const sizes = await Promise.all(files.map(fileSize));
    total = sizes.reduce((sum, size) => sum + size, total);
  }

  return total;
}

async function fileSize(file: string): Promise<number> {
  try {
    return (await fs.lstat(file)).size;
  } catch {
    return 0; // vanished, or not ours to read
  }
}
