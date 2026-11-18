/**
 * Shared fixtures for the `core/*.test.ts` suites.
 *
 * The tests run against a real temporary folder through the Node host, the way
 * the Python suite did: the parsers see bytes Steam could actually have
 * written, not a mock of our own idea of them. Only the network is faked.
 *
 * Not part of `core/` proper (tsconfig.core.json excludes it): it is Node-only.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { Host } from './host.ts';
import { createNodeHost } from './hosts/node.ts';

export const MAGIC_V27 = 0x07564427;
export const MAGIC_V28 = 0x07564428;
export const MAGIC_V29 = 0x07564429;

/** A temp folder that cleans itself up when the test ends. */
export async function tempDir(t: {
  after: (fn: () => void | Promise<void>) => void;
}): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sds-test-'));

  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  return dir;
}

export async function write(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}

export async function writeBytes(file: string, data: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

/**
 * A host for tests: the real filesystem, no network, and our own files kept
 * inside the temp folder instead of the project.
 */
export function testHost(dataDir: string, http?: Host['http']): Host {
  const host = createNodeHost();

  return {
    ...host,
    http: http ?? {
      async postForm() {
        throw new Error('no network in tests');
      },
    },
    async dataDir() {
      return dataDir;
    },
  };
}

export function manifest(
  appid: number,
  name: string,
  installdir: string,
  size: number,
  flags = 4,
): string {
  return `"AppState"
{
    "appid"        "${appid}"
    "name"         "${name}"
    "StateFlags"   "${flags}"
    "installdir"   "${installdir}"
    "LastUpdated"  "1700000000"
    "SizeOnDisk"   "${size}"
}
`;
}

/** `items` maps item id to size. */
export function workshopManifest(
  appid: number,
  items: Record<number, number>,
  sizeOnDisk?: number,
): string {
  const installed = Object.entries(items)
    .map(
      ([itemid, size]) => `        "${itemid}"
        {
            "size"         "${size}"
            "timeupdated"  "1700000000"
        }`,
    )
    .join('\n');
  const total = sizeOnDisk ?? Object.values(items).reduce((sum, size) => sum + size, 0);

  return `"AppWorkshop"
{
    "appid"        "${appid}"
    "SizeOnDisk"   "${total}"
    "WorkshopItemsInstalled"
    {
${installed}
    }
}
`;
}

/** `entries` maps SteamID64 to the keys of that login entry. */
export function loginusers(entries: Array<[string, Record<string, string>]>): string {
  const blocks = entries.map(([steamid, details]) => {
    const lines = Object.entries(details)
      .map(([key, value]) => `        "${key}"  "${value}"\n`)
      .join('');

    return `    "${steamid}"\n    {\n${lines}    }\n`;
  });

  return `"users"\n{\n${blocks.join('')}}\n`;
}

/** `apps` maps appid to the keys of that app's entry. */
export function localconfig(apps: Record<number, Record<string, string>>): string {
  const blocks = Object.entries(apps).map(([appid, details]) => {
    const lines = Object.entries(details)
      .map(([key, value]) => `                    "${key}"  "${value}"\n`)
      .join('');

    return `                "${appid}"\n                {\n${lines}                }\n`;
  });

  return (
    '"UserLocalConfigStore"\n{\n    "Software"\n    {\n        "Valve"\n        {\n' +
    '            "Steam"\n            {\n                "apps"\n                {\n' +
    blocks.join('') +
    '                }\n            }\n        }\n    }\n}\n'
  );
}

/** Build a binary appinfo.vdf holding {appid: name} for testing. */
export function buildAppinfo(
  apps: Array<[number, string | null]>,
  magic: number = MAGIC_V29,
): Uint8Array {
  const keys = ['appid', 'common', 'name', 'type', 'size'];
  const index = new Map(keys.map((key, at) => [key, at]));

  const key = (name: string): Uint8Array =>
    magic === MAGIC_V29 ? uint32(index.get(name) as number) : cString(name);

  const parts: Uint8Array[] = [];

  for (const [appid, name] of apps) {
    const kv: Uint8Array[] = [
      bytes(0x02),
      key('appid'),
      uint32(appid), // a root-level int32
      bytes(0x00),
      key('common'),
      bytes(0x01),
      key('type'),
      cString('Game'),
    ];

    if (name !== null) {
      kv.push(bytes(0x01), key('name'), cString(name));
    }

    kv.push(bytes(0x07), key('size'), uint64(1n)); // a uint64 we must skip
    kv.push(bytes(0x08)); // end of common
    kv.push(bytes(0x08)); // end of the implicit root map

    const header: Uint8Array[] = [
      uint32(0),
      uint32(1700000000),
      uint64(0n),
      filled(20, 's'.charCodeAt(0)),
      uint32(1),
    ];

    if (magic !== MAGIC_V27) {
      header.push(filled(20, 'b'.charCodeAt(0)));
    }

    const entry = concat([...header, ...kv]);
    parts.push(uint32(appid), uint32(entry.length), entry);
  }

  parts.push(uint32(0)); // appid 0 ends the file

  const body = concat(parts);
  const head = concat([uint32(magic), uint32(1)]);

  if (magic !== MAGIC_V29) {
    return concat([head, body]);
  }

  const table = concat([uint32(keys.length), ...keys.map(cString)]);

  return concat([head, int64(BigInt(head.length + 8 + body.length)), body, table]);
}

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function filled(length: number, value: number): Uint8Array {
  return new Uint8Array(length).fill(value);
}

function cString(text: string): Uint8Array {
  const encoded = new TextEncoder().encode(text);
  const out = new Uint8Array(encoded.length + 1);
  out.set(encoded);

  return out;
}

function uint32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);

  return out;
}

function uint64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);

  return out;
}

function int64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, value, true);

  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;

  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }

  return out;
}
