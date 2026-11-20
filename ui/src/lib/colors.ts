/**
 * One colour per library, stable across rescans.
 *
 * Keyed by library path rather than by position, so adding or removing a
 * library does not recolour the others.
 */

import { computed } from 'vue';

import type { Game } from '@core/models.ts';
import { libraryOf, scanStore } from '@/stores/scan-store';

/** Distinct hues that stay readable with white tile labels. */
const LIBRARY_COLORS = [
  '#2f6f9f', // blue
  '#9f5a2f', // rust
  '#4f7f3f', // green
  '#7f3f6f', // plum
  '#8f7f2f', // olive
  '#3f7f7f', // teal
  '#6f4f9f', // violet
  '#9f3f4f', // red
];

/** Colours for the drill-down view, where tiles are categories. */
export const CATEGORY_COLORS = {
  game: '#2f6f9f',
  workshop: '#9f5a2f',
} as const;

export type Category = keyof typeof CATEGORY_COLORS;

/** For a library with no colour of its own: an unavailable drive. */
export const NO_COLOR = '#555';

export function libraryColors(paths: string[]): Map<string, string> {
  const colors = new Map<string, string>();
  paths.forEach((path, i) => {
    colors.set(path, LIBRARY_COLORS[i % LIBRARY_COLORS.length]);
  });
  return colors;
}

/** Library path → colour, stable while the set of libraries is unchanged. */
export const colors = computed(() =>
  libraryColors((scanStore.data?.libraries ?? []).map((lib) => lib.path)),
);

/** The colour of one library, by path. */
export function libraryColor(path: string): string {
  return colors.value.get(path) ?? NO_COLOR;
}

/**
 * The colour standing for a game's library.
 *
 * What the swatch in the table, the legend and the treemap's tooltip is
 * filled with, so the three cannot disagree. A game whose library is not in
 * the palette (an unavailable drive) gets no colour rather than a wrong one.
 */
export function gameColor(game: Game): string {
  const library = libraryOf(game);

  return library ? libraryColor(library.path) : NO_COLOR;
}
