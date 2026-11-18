/**
 * Read app names from Steam's binary appcache/appinfo.vdf.
 *
 * Some appmanifest files store a placeholder name (`appid_823910`) because the
 * real name was not known when Steam wrote the manifest. Steam itself shows
 * the name from this cache, so we use it as a fallback.
 *
 * The file is a binary KeyValues blob, one entry per app, with a header per
 * entry and (since version 0x29) a string table at the end holding every key
 * name. The format has changed a few times; anything unexpected makes us give
 * up and return what we have so far, since this is only a nicety.
 */

import type { Host } from './host.ts';
import { join } from './paths.ts';

const MAGIC_V27 = 0x07564427; // no binary sha1 in the entry header
const MAGIC_V28 = 0x07564428; // adds the binary sha1
const MAGIC_V29 = 0x07564429; // adds the string table (keys are indices into it)

// Binary KeyValues value types
const TYPE_MAP = 0x00;
const TYPE_STRING = 0x01;
const TYPE_INT32 = 0x02;
const TYPE_FLOAT32 = 0x03;
const TYPE_POINTER = 0x04;
const TYPE_WIDESTRING = 0x05;
const TYPE_COLOR = 0x06;
const TYPE_UINT64 = 0x07;
const TYPE_END = 0x08;
const TYPE_INT64 = 0x0a;
const TYPE_END_ALT = 0x0b;

/** state, last updated, token, text sha1, change number */
const FIXED_HEADER = 4 + 4 + 8 + 20 + 4;

/**
 * Declared rather than imported: `TextDecoder` is a host global in both Node
 * and the webview, but it is in neither the ES library nor `core/`'s type
 * environment, which has no DOM and no Node (tsconfig.core.json). Declaring it
 * module-locally states the one global this file assumes without opening the
 * whole DOM to `core/`.
 */
declare const TextDecoder: {
  new (label?: string): { decode(input: Uint8Array): string };
};

const decoder = new TextDecoder('utf-8');

/**
 * Return a map of appid to name from <Steam>/appcache/appinfo.vdf.
 *
 * Returns an empty map if the cache is missing or cannot be parsed.
 */
export async function readNames(host: Host, steamPath: string): Promise<Map<number, string>> {
  try {
    const data = await host.fs.readFile(join(steamPath, 'appcache', 'appinfo.vdf'));

    return parseNames(data);
  } catch {
    return new Map();
  }
}

/** Return a map of appid to name parsed from the contents of an appinfo.vdf. */
export function parseNames(data: Uint8Array): Map<number, string> {
  const names = new Map<number, string>();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  if (data.byteLength < 8) {
    return names;
  }

  const magic = view.getUint32(0, true);

  if (magic !== MAGIC_V27 && magic !== MAGIC_V28 && magic !== MAGIC_V29) {
    return names;
  }

  let offset = 8; // magic + universe
  let stringTable: string[] | null = null;

  if (magic === MAGIC_V29) {
    if (offset + 8 > data.byteLength) {
      return names;
    }

    const tableOffset = Number(view.getBigInt64(offset, true));
    offset += 8;
    stringTable = readStringTable(data, view, tableOffset);

    if (stringTable === null) {
      return names;
    }
  }

  const headerSize = FIXED_HEADER + (magic === MAGIC_V27 ? 0 : 20);

  for (;;) {
    if (offset + 8 > data.byteLength) {
      return names;
    }

    const appid = view.getUint32(offset, true);
    const size = view.getUint32(offset + 4, true);
    offset += 8;

    if (appid === 0) {
      return names;
    }

    const end = offset + size;

    if (size < headerSize || end > data.byteLength) {
      return names;
    }

    const name = readCommonName(data, offset + headerSize, end, stringTable, view);

    if (name) {
      names.set(appid, name);
    }

    offset = end;
  }
}

function readStringTable(data: Uint8Array, view: DataView, offset: number): string[] | null {
  if (offset < 0 || offset + 4 > data.byteLength) {
    return null;
  }

  const count = view.getUint32(offset, true);
  let at = offset + 4;
  const strings: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const end = indexOfZero(data, at, data.byteLength);

    if (end < 0) {
      return null;
    }

    strings.push(decode(data, at, end));
    at = end + 1;
  }

  return strings;
}

/**
 * Walk one app's KeyValues blob and return its `common/name`, if any.
 *
 * The blob's outermost map is implicit: its fields start right away and one
 * end marker closes it, so we start a level deep.
 */
function readCommonName(
  data: Uint8Array,
  start: number,
  end: number,
  stringTable: string[] | null,
  view: DataView,
): string | null {
  let offset = start;
  let depth = 1;
  const path: string[] = [];

  while (offset < end) {
    const valueType = data[offset] as number;
    offset += 1;

    if (valueType === TYPE_END || valueType === TYPE_END_ALT) {
      depth -= 1;
      path.pop();

      if (depth <= 0) {
        return null;
      }

      continue;
    }

    const read = readKey(data, offset, stringTable, view);

    if (read.key === null) {
      return null;
    }

    offset = read.offset;

    if (valueType === TYPE_MAP) {
      depth += 1;
      path.push(read.key);
      continue;
    }

    if (valueType === TYPE_STRING) {
      const stop = indexOfZero(data, offset, end);

      if (stop < 0) {
        return null;
      }

      const value = decode(data, offset, stop);
      offset = stop + 1;

      if (read.key === 'name' && path[path.length - 1] === 'common') {
        return value || null;
      }

      continue;
    }

    const width = valueWidth(valueType, data, offset, end);

    if (width === null) {
      return null;
    }

    offset += width;
  }

  return null;
}

function readKey(
  data: Uint8Array,
  offset: number,
  stringTable: string[] | null,
  view: DataView,
): { key: string | null; offset: number } {
  if (stringTable !== null) {
    if (offset + 4 > data.byteLength) {
      return { key: null, offset };
    }

    const index = view.getUint32(offset, true);

    if (index >= stringTable.length) {
      return { key: null, offset };
    }

    return { key: stringTable[index] as string, offset: offset + 4 };
  }

  const end = indexOfZero(data, offset, data.byteLength);

  if (end < 0) {
    return { key: null, offset };
  }

  return { key: decode(data, offset, end), offset: end + 1 };
}

function valueWidth(
  valueType: number,
  data: Uint8Array,
  offset: number,
  end: number,
): number | null {
  if (
    valueType === TYPE_INT32 ||
    valueType === TYPE_FLOAT32 ||
    valueType === TYPE_POINTER ||
    valueType === TYPE_COLOR
  ) {
    return 4;
  }

  if (valueType === TYPE_UINT64 || valueType === TYPE_INT64) {
    return 8;
  }

  if (valueType === TYPE_WIDESTRING) {
    for (let at = offset; at + 1 < end; at += 1) {
      if (data[at] === 0 && data[at + 1] === 0) {
        return at - offset + 2;
      }
    }

    return null;
  }

  return null;
}

function indexOfZero(data: Uint8Array, from: number, limit: number): number {
  for (let at = from; at < limit; at += 1) {
    if (data[at] === 0) {
      return at;
    }
  }

  return -1;
}

function decode(data: Uint8Array, start: number, end: number): string {
  return decoder.decode(data.subarray(start, end));
}
