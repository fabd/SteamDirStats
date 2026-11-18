/**
 * What `core/` needs from the outside world.
 *
 * Nothing in `core/` imports `node:*` or `@tauri-apps/*`: it takes a `Host`
 * and goes through it for every file, request and registry read. That is what
 * lets the same scanner run in the app window and under Node for the CLI
 * (plan.md, "Host ports"). `tsconfig.core.json` enforces it by giving this
 * folder neither DOM nor Node types.
 *
 * Implementations: `core/hosts/node.ts` and `core/hosts/tauri.ts`.
 */

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface DiskUsage {
  total: number;
  free: number;
}

/** Reported while folders are measured, in the order the paths were given. */
export type SizeProgress = (done: number, total: number) => void;

export interface HostFs {
  /** UTF-8, lossy on bad bytes. Rejects if the file cannot be read. */
  readTextFile(path: string): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  /** Shallow listing. Rejects if the folder cannot be read. */
  readDir(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
  writeTextFile(path: string, text: string): Promise<void>;
  /** Total and free bytes of the volume holding `path`, or null. */
  diskUsage(path: string): Promise<DiskUsage | null>;
}

export interface HostHttp {
  /**
   * POST a form-encoded body and parse the JSON answer.
   *
   * In the app this goes through the http plugin: the webview's own fetch is
   * blocked by CORS from the tauri://localhost origin.
   */
  postForm(url: string, form: Record<string, string>, timeoutMs: number): Promise<unknown>;
}

export interface Host {
  fs: HostFs;

  http: HostHttp;

  /**
   * A string value from the Windows registry, or null.
   *
   * `hive` is "HKCU" or "HKLM"; `key` is the path below it.
   */
  registry(hive: 'HKCU' | 'HKLM', key: string, value: string): Promise<string | null>;

  /**
   * Total bytes under each folder, in the order given, or null for a folder
   * that cannot be read.
   *
   * Lives in the host because the app does it in Rust: the fs plugin's
   * readDir carries no sizes, so measuring in the webview would mean one IPC
   * call per file (plan.md §5).
   */
  dirSizes(paths: string[], onProgress?: SizeProgress): Promise<(number | null)[]>;

  /**
   * Ask for read access to a folder that should be a Steam folder or library.
   *
   * The app starts with no file access at all and widens it as the scan finds
   * where Steam lives (plan.md §7d): Rust allows the folder only if it really
   * contains `steamapps`, so this is also the validation that stops the page
   * from unlocking anything else. Returns false when it was refused.
   *
   * The Node host has nothing to grant and always returns true.
   */
  allowFolder(path: string): Promise<boolean>;

  /** Where our own files live: settings.json, workshop-names.json (plan.md §9). */
  dataDir(): Promise<string>;
}
