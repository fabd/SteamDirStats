/**
 * Command-line output for testing the scanner.
 *
 *     node tools/steamdirstats-cli.ts [--json] [--accurate] [--no-items] ...
 *
 * Node runs this TypeScript directly (type stripping, 22.18+), so there is no
 * build step and no dependencies: it is the same `core/` the app runs, on the
 * Node host instead of the Tauri one.
 */

import { createNodeHost } from '../core/hosts/node.ts';
import { formatLastPlayed, formatPlaytime, formatSize, plural } from '../core/format.ts';
import { SteamNotFoundError } from '../core/locate.ts';
import {
  accountDisplayName,
  allGames,
  itemDisplayName,
  type Game,
  type NameStats,
  type SteamData,
} from '../core/models.ts';
import { scan } from '../core/scanner.ts';

interface Options {
  steamPath: string | null;
  json: boolean;
  items: boolean;
  itemUrls: boolean;
  accurate: boolean;
  offline: boolean;
}

const USAGE = `Usage: node tools/steamdirstats-cli.ts [options]

List installed Steam games by library.

  --steam-path <dir>  Steam folder (default: auto-detect)
  --json              output JSON instead of a text report
  --no-items          hide the per-item Workshop lines
  --item-urls         show the Steam Community link per Workshop item
  --accurate          measure the folders on disk instead of trusting the manifests
  --offline           do not call the Steam web API; use cached Workshop names only
  -h, --help          show this message
`;

function parseArgs(argv: string[]): Options | null {
  const options: Options = {
    steamPath: null,
    json: false,
    items: true,
    itemUrls: false,
    accurate: false,
    offline: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case '--steam-path':
        i += 1;
        options.steamPath = argv[i] ?? null;
        break;
      case '--json':
        options.json = true;
        break;
      case '--no-items':
        options.items = false;
        break;
      case '--item-urls':
        options.itemUrls = true;
        break;
      case '--accurate':
        options.accurate = true;
        break;
      case '--offline':
        options.offline = true;
        break;
      case '-h':
      case '--help':
        return null;
      default:
        process.stderr.write(`Unknown option: ${arg}\n\n${USAGE}`);
        process.exit(2);
    }
  }

  return options;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

/** The "  [590.8 h, Nov 12]" part of a game line, empty when never played. */
function playNote(game: Game): string {
  const parts = [formatPlaytime(game.playtime), formatLastPlayed(game.last_played)].filter(Boolean);

  return parts.length > 0 ? `  [${parts.join(', ')}]` : '';
}

function printReport(data: SteamData, stats: NameStats | null, options: Options): void {
  const out: string[] = [];
  out.push(`Steam: ${data.steam_path}`);

  if (data.accurate) {
    out.push('Sizes: measured on disk (accurate mode)');
  }

  if (data.account) {
    out.push(`Account: ${accountDisplayName(data.account)}  (${data.account.accountid})`);
  }

  for (const library of data.libraries) {
    out.push('');
    let header = `Library: ${library.path}`;

    if (library.label) {
      header += `  "${library.label}"`;
    }

    if (!library.available) {
      out.push(`${header}  (not found, skipped)`);
      continue;
    }

    out.push(
      `${header}  (${plural(library.games.length, 'game')}, ${formatSize(library.total_size)})`,
    );

    if (library.disk_total) {
      out.push(
        `  Disk: ${formatSize(library.disk_free)} free of ${formatSize(library.disk_total)}`,
      );
    }

    for (const game of library.games) {
      let note = game.fully_installed ? '' : '  [not fully installed]';

      if (game.workshop_size) {
        note = `  ( WORKSHOP ${formatSize(game.workshop_size)} )${note}`;
      }

      note += playNote(game);
      out.push(`  ${pad(formatSize(game.total_size), 10)}  ${game.name}  (${game.appid})${note}`);

      if (options.items) {
        game.workshop_items.forEach((item, index) => {
          let line = `     ${pad(String(index + 1), 3)}. ${pad(formatSize(item.size), 9)}  ${itemDisplayName(item)}`;

          if (item.name === null) {
            line += '  [name unavailable]';
          }

          if (options.itemUrls) {
            line += `  ${item.url}`;
          }

          out.push(line);
        });
      }
    }
  }

  const available = data.libraries.filter((library) => library.available).length;
  const workshop = data.workshop_size ? ` (Workshop: ${formatSize(data.workshop_size)})` : '';
  out.push('');
  out.push(
    `Total: ${plural(allGames(data).length, 'game')}, ${formatSize(data.total_size)} ` +
      `in ${available} ${available === 1 ? 'library' : 'libraries'}${workshop}`,
  );

  const names = nameStatsLine(stats);

  if (names) {
    out.push(names);
  }

  process.stdout.write(`${out.join('\n')}\n`);
}

/** One line about the Workshop name lookup, when there was anything to say. */
function nameStatsLine(stats: NameStats | null): string {
  if (!stats) {
    return '';
  }

  const parts = [
    stats.cached ? `${stats.cached} from cache` : '',
    stats.fetched ? `${stats.fetched} fetched` : '',
    stats.local ? `${stats.local} from item folders` : '',
    stats.unavailable ? `${stats.unavailable} unavailable` : '',
    stats.failed ? `${stats.failed} not looked up` : '',
  ].filter(Boolean);

  return parts.length > 0 ? `Workshop names: ${parts.join(', ')}` : '';
}

/** Overwrite one line on stderr while the folders are being measured. */
function reportScanProgress(done: number, total: number, name: string): void {
  if (done >= total) {
    process.stderr.write(`\r${' '.repeat(78)}\r`);

    return;
  }

  const line = `Measuring ${done + 1}/${total} on disk: ${name}`.slice(0, 76);
  process.stderr.write(`\r${line.padEnd(78)}`);
}

function reportNameProgress(done: number, total: number): void {
  if (done === 0) {
    process.stderr.write(`Requesting ${total} Workshop item names from the public Steam API...\n`);
  }
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));

  if (options === null) {
    process.stdout.write(USAGE);

    return 0;
  }

  try {
    const { data, nameStats } = await scan(createNodeHost(), {
      steamPath: options.steamPath,
      accurate: options.accurate,
      workshopNames: true,
      offline: options.offline,
      onScanProgress: reportScanProgress,
      onNameProgress: reportNameProgress,
    });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    } else {
      printReport(data, nameStats, options);
    }
  } catch (error) {
    if (error instanceof SteamNotFoundError) {
      process.stderr.write(`Error: ${error.message}\n`);

      return 1;
    }

    throw error;
  }

  return 0;
}

process.exitCode = await main();
