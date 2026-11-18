/**
 * Measure what is actually on disk, for accurate mode.
 *
 * Fast mode trusts the sizes Steam wrote into the manifests. They are usually
 * right, but they can be stale (Last Evil's Workshop manifest was 4.7 MB behind
 * what its item folders really hold) and they say nothing about files Steam did
 * not put there. Accurate mode walks the folders instead.
 *
 * This module decides *which* folders to measure and how to split the result;
 * adding up the bytes is `host.dirSizes`, because in the app that work happens
 * in Rust (plan.md §5). Sizes are logical file sizes, not size on disk.
 */

import type { Host } from './host.ts';
import { sortItems } from './workshop.ts';
import { allGames, recalculate, type Game, type SteamData } from './models.ts';
import { normcase } from './paths.ts';

/** Called with (games measured so far, games in total, name of the current game). */
export type ScanProgress = (done: number, total: number, name: string) => void;

/** Replace the manifest sizes with what the folders really hold. */
export async function measureOnDisk(
  host: Host,
  data: SteamData,
  progress?: ScanProgress,
): Promise<void> {
  const games = allGames(data);

  await measureGameFolders(host, games, progress);
  await measureWorkshopItems(host, games);

  recalculate(data);
}

/**
 * Measure every install folder once, then share each one out.
 *
 * Progress counts games rather than folders, because that is what the status
 * bar and the CLI report: with a shared folder, two games tick over together.
 */
async function measureGameFolders(
  host: Host,
  games: Game[],
  progress?: ScanProgress,
): Promise<void> {
  // One entry per distinct folder, in the order the games are listed.
  const folders: string[] = [];
  const groups = new Map<string, Game[]>();

  for (const game of games) {
    if (!game.install_path) {
      continue;
    }

    const key = normcase(game.install_path);
    const group = groups.get(key);

    if (group) {
      group.push(game);
    } else {
      groups.set(key, [game]);
      folders.push(game.install_path);
    }
  }

  const names = [...groups.values()].map((group) => (group[0] as Game).name);
  const sizes = await host.dirSizes(folders, (done, total) => {
    progress?.(done, total, done < total ? (names[done] ?? '') : '');
  });

  let index = 0;

  for (const group of groups.values()) {
    const size = sizes[index];
    index += 1;

    // A folder we cannot read keeps its manifest size rather than dropping to
    // zero: that is more likely our problem than a game taking no space.
    if (size !== null && size !== undefined) {
      shareSize(group, size);
    }
  }

  progress?.(folders.length, folders.length, '');
}

/**
 * Give `size` to the games installed in that one folder.
 *
 * Some apps share an install folder with another: Skyrim Special Edition and
 * its Creation Kit are both in `common/Skyrim Special Edition`. Measuring it
 * per game would count those 15 GB twice, so the folder is measured once and
 * split in the same proportion as the manifests claimed, which keeps the
 * totals right and each game close to the size Steam shows for it.
 */
export function shareSize(games: Game[], size: number): void {
  if (games.length === 1) {
    (games[0] as Game).size_on_disk = size;

    return;
  }

  const claimed = games.reduce((sum, game) => sum + game.size_on_disk, 0);
  let left = size;

  for (const game of games.slice(0, -1)) {
    const share = claimed
      ? Math.floor((size * game.size_on_disk) / claimed)
      : Math.floor(size / games.length);
    game.size_on_disk = share;
    left -= share;
  }

  // The remainder, so the parts add up to exactly what was measured.
  (games[games.length - 1] as Game).size_on_disk = left;
}

/**
 * Measure the Workshop item folders of every game, in one pass.
 *
 * Item folders left behind by an unsubscribed item are not in the manifest and
 * belong to no item, so they stay uncounted (see plan.md).
 */
async function measureWorkshopItems(host: Host, games: Game[]): Promise<void> {
  const paths: string[] = [];

  for (const game of games) {
    for (const item of game.workshop_items) {
      paths.push(item.path);
    }
  }

  if (paths.length === 0) {
    return;
  }

  const sizes = await host.dirSizes(paths);
  const measured = new Set<Game>();
  let index = 0;

  for (const game of games) {
    for (const item of game.workshop_items) {
      const size = sizes[index];
      index += 1;

      if (size !== null && size !== undefined) {
        item.size = size;
        measured.add(game);
      }
    }
  }

  for (const game of measured) {
    sortItems(game.workshop_items);
    game.workshop_size = game.workshop_items.reduce((sum, item) => sum + item.size, 0);
  }
}
