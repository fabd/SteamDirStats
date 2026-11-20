/**
 * How a library is named in the views.
 */

import type { Game, Library } from '@core/models.ts';
import { formatPath } from '@core/format.ts';
import { libraryOf } from '@/stores/scan-store';

/** A library's name: the label Steam stored, or its path. */
export function libraryLabel(library: Library): string {
  return library.label || formatPath(library.path);
}

/** The same name, for a game: its library's, or nothing if it has none. */
export function libraryLabelFromGame(game: Game): string {
  const library = libraryOf(game);

  return library ? libraryLabel(library) : '';
}
