/**
 * One colour per library, stable across rescans.
 *
 * Keyed by library path rather than by position, so adding or removing a
 * library does not recolour the others.
 */

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

export function libraryColors(paths: string[]): Map<string, string> {
  const colors = new Map<string, string>();
  paths.forEach((path, i) => {
    colors.set(path, LIBRARY_COLORS[i % LIBRARY_COLORS.length]);
  });
  return colors;
}
