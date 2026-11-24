/**
 * The data the scanner returns, and the JSON it serialises to.
 *
 * Sizes are bytes, playtime is minutes, timestamps are Unix seconds.
 *
 * Derived fields (`total_size`, `fully_installed`, the library and global
 * totals) are plain fields filled in by `recalculate()`, which the scanner
 * calls once the sizes are final, so the JSON and the in-memory object are the
 * same thing.
 */

/** appmanifest StateFlags bit meaning the game is fully installed. */
export const STATE_FULLY_INSTALLED = 4;

export interface WorkshopItem {
  itemid: number;
  size: number;
  /** Full path to the item folder. */
  path: string;
  time_updated: number | null;
  /** Null until resolved; the UI then falls back to the id. */
  name: string | null;
  url: string;
}

export interface Game {
  appid: number;
  name: string;
  /** Folder name under steamapps/common. */
  install_dir: string;
  install_path: string;
  /** Game files only; the manifest's SizeOnDisk excludes Workshop content. */
  size_on_disk: number;
  workshop_size: number;
  /** size_on_disk + workshop_size: what Steam's Storage Manager shows. */
  total_size: number;
  state_flags: number;
  fully_installed: boolean;
  last_updated: number | null;
  /** Per-account, so null when no account was found or the game is unplayed. */
  playtime: number | null;
  playtime_2weeks: number | null;
  last_played: number | null;
  workshop_items: WorkshopItem[];
}

export interface Library {
  path: string;
  label: string;
  /** False when the folder is missing, e.g. an unplugged drive. */
  available: boolean;
  disk_total: number | null;
  disk_free: number | null;
  /** Game files plus Workshop content, for every game in this library. */
  total_size: number;
  workshop_size: number;
  games: Game[];
}

export interface Account {
  /**
   * A string, not a number: a SteamID64 is larger than `Number.MAX_SAFE_INTEGER`,
   * so it only survives a round trip as text. (The Python version wrote it as a
   * JSON number, which lost the last digits.)
   */
  steamid64: string;
  /** The userdata folder name. */
  accountid: number;
  account_name: string;
  persona_name: string;
  userdata_path: string;
}

export interface SteamData {
  steam_path: string;
  account: Account | null;
  /** True when the sizes were walked on disk rather than read from manifests. */
  accurate: boolean;
  /** Game files plus Workshop content, across every library. */
  total_size: number;
  workshop_size: number;
  libraries: Library[];
}

/** What one `resolveNames()` call did, for a line in the CLI report. */
export interface NameStats {
  /** Names that were already in the cache. */
  cached: number;
  /** Names the API gave us. */
  fetched: number;
  /** Names read from the item's own folder. */
  local: number;
  /** Items with no name anywhere. */
  unavailable: number;
  /** Items we could not ask about (no network, API error). */
  failed: number;
}

export function workshopItemUrl(itemid: number): string {
  return `https://steamcommunity.com/sharedfiles/filedetails/?id=${itemid}`;
}

/** The name to show for an item, falling back to its id. */
export function itemDisplayName(item: WorkshopItem): string {
  return item.name || String(item.itemid);
}

export function accountDisplayName(account: Account): string {
  return account.persona_name || account.account_name || String(account.accountid);
}

/** Every game across every library, in library order. */
export function allGames(data: SteamData): Game[] {
  return data.libraries.flatMap((library) => library.games);
}

/**
 * Fill in every derived total, bottom up.
 *
 * Called once the sizes are final — after an accurate measurement replaces the
 * manifest sizes — so no caller has to remember which totals a change invalidates.
 */
export function recalculate(data: SteamData): SteamData {
  let total = 0;
  let workshop = 0;

  for (const library of data.libraries) {
    let librarySize = 0;
    let libraryWorkshop = 0;

    for (const game of library.games) {
      game.total_size = game.size_on_disk + game.workshop_size;
      game.fully_installed = (game.state_flags & STATE_FULLY_INSTALLED) !== 0;
      librarySize += game.total_size;
      libraryWorkshop += game.workshop_size;
    }

    library.total_size = librarySize;
    library.workshop_size = libraryWorkshop;
    total += librarySize;
    workshop += libraryWorkshop;
  }

  data.total_size = total;
  data.workshop_size = workshop;

  return data;
}
