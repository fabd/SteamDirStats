/**
 * Tolerant parser for Valve's text KeyValues format (.vdf / .acf files).
 *
 * Example input:
 *
 *     "libraryfolders"
 *     {
 *         "0"
 *         {
 *             "path"    "C:\\Program Files (x86)\\Steam"
 *         }
 *     }
 *
 * Parsed into nested objects of strings. Keys are lower-cased, because Steam
 * has not always been consistent about key case across versions.
 */

import type { Host } from './host.ts';

/** A parsed VDF tree: every leaf is a string. */
export interface VdfNode {
  [key: string]: string | VdfNode;
}

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  '\\': '\\',
  '"': '"',
};

/** Parse a VDF file. Returns an empty tree if it cannot be read. */
export async function load(host: Host, path: string): Promise<VdfNode> {
  let text: string;

  try {
    text = await host.fs.readTextFile(path);
  } catch {
    return {};
  }

  return parse(text);
}

/** Parse VDF text into nested objects. Never throws on malformed input. */
export function parse(text: string): VdfNode {
  const root: VdfNode = {};
  const stack: VdfNode[] = [root];
  let key: string | null = null;

  for (const [token, quoted] of tokens(text)) {
    const top = stack[stack.length - 1] as VdfNode;

    if (!quoted && token === '{') {
      if (key === null) {
        continue; // stray brace, ignore
      }

      const existing = top[key];
      const child: VdfNode = isNode(existing) ? existing : {};
      top[key] = child;
      stack.push(child);
      key = null;
    } else if (!quoted && token === '}') {
      if (stack.length > 1) {
        stack.pop();
      }

      key = null;
    } else if (!quoted && token.startsWith('[') && token.endsWith(']')) {
      continue; // platform conditional such as [$WIN32], ignore
    } else if (key === null) {
      key = token.toLowerCase();
    } else {
      top[key] = token;
      key = null;
    }
  }

  return root;
}

/** Yield [token, wasQuoted] pairs, skipping whitespace and // comments. */
function* tokens(text: string): Generator<[string, boolean]> {
  const n = text.length;
  let i = text.startsWith('\ufeff') ? 1 : 0;

  while (i < n) {
    const c = text[i] as string;

    if (isSpace(c)) {
      i += 1;
    } else if (c === '/' && text.startsWith('//', i)) {
      const end = text.indexOf('\n', i);
      i = end === -1 ? n : end + 1;
    } else if (c === '{' || c === '}') {
      yield [c, false];
      i += 1;
    } else if (c === '"') {
      i += 1;
      const chars: string[] = [];

      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const next = text[i + 1] as string;
          chars.push(ESCAPES[next] ?? `\\${next}`);
          i += 2;
        } else {
          chars.push(text[i] as string);
          i += 1;
        }
      }

      i += 1; // closing quote
      yield [chars.join(''), true];
    } else {
      const start = i;

      while (i < n && !isSpace(text[i] as string) && !'{}"'.includes(text[i] as string)) {
        i += 1;
      }

      yield [text.slice(start, i), false];
    }
  }
}

function isSpace(c: string): boolean {
  return /\s/.test(c);
}

export function isNode(value: unknown): value is VdfNode {
  return typeof value === 'object' && value !== null;
}

/** A child node, or null when the key is missing or holds a string. */
export function node(parent: VdfNode | null | undefined, key: string): VdfNode | null {
  if (!parent) {
    return null;
  }

  const value = parent[key];

  return isNode(value) ? value : null;
}

/** A string value, or null when the key is missing or holds a node. */
export function str(parent: VdfNode | null | undefined, key: string): string | null {
  if (!parent) {
    return null;
  }

  const value = parent[key];

  return typeof value === 'string' ? value : null;
}

/**
 * A numeric value, or null when it is missing or not a number.
 *
 * VDF holds everything as text, so every number in a manifest comes through
 * here. Only a whole string of digits counts: `parseInt` would turn "12abc"
 * into 12 and hide a format change.
 */
export function int(parent: VdfNode | null | undefined, key: string): number | null {
  return toInt(str(parent, key));
}

export function toInt(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  if (!/^[+-]?\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isSafeInteger(parsed) ? parsed : null;
}
