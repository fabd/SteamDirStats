/**
 * The little bit of path handling `core/` needs.
 *
 * `node:path` is not available here (see host.ts), and the two hosts would
 * disagree about separators anyway: Steam writes `SteamPath` with forward
 * slashes, the manifests use backslashes, and Windows accepts both. So paths
 * are normalised to backslashes once, on the way in.
 *
 * Windows-only, like the rest of the app.
 */

/** Join path segments, ignoring empty ones. */
export function join(...parts: string[]): string {
  const segments = parts.filter((part) => part !== '');

  if (segments.length === 0) {
    return '';
  }

  return normalize(segments.join('\\'));
}

/**
 * Backslashes, no duplicate separators, no `.` or `..` left in the middle.
 *
 * The leading `\\` of a UNC path is kept; a trailing separator is dropped
 * except on a bare drive root (`D:\`), which needs it to stay a root.
 */
export function normalize(path: string): string {
  if (path === '') {
    return '';
  }

  const withBackslashes = path.replace(/\//g, '\\');
  const unc = withBackslashes.startsWith('\\\\');
  const parts: string[] = [];

  for (const part of withBackslashes.split('\\')) {
    if (part === '' || part === '.') {
      continue;
    }

    const last = parts[parts.length - 1];

    if (part === '..' && parts.length > 0 && last !== '..' && !isDriveRoot(last ?? '')) {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  const joined = (unc ? '\\\\' : '') + parts.join('\\');

  // "D:" alone means "the current directory on D:", which is not what any
  // caller means here.
  return parts.length === 1 && isDriveRoot(parts[0] ?? '') ? `${joined}\\` : joined;
}

/**
 * The form used to compare two paths.
 *
 * Windows filesystems are case-insensitive, so `D:\Games` and `d:\games` are
 * the same folder and must collapse to one key.
 */
export function normcase(path: string): string {
  return normalize(path).toLowerCase();
}

/** The last segment of a path. */
export function basename(path: string): string {
  const normalized = normalize(path);
  const index = normalized.lastIndexOf('\\');

  return index === -1 ? normalized : normalized.slice(index + 1);
}

/** Everything but the last segment. */
export function dirname(path: string): string {
  const normalized = normalize(path);
  const index = normalized.lastIndexOf('\\');

  if (index === -1) {
    return '';
  }

  const head = normalized.slice(0, index);

  return isDriveRoot(head) ? `${head}\\` : head;
}

function isDriveRoot(part: string): boolean {
  return /^[A-Za-z]:$/.test(part);
}
