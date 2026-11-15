/**
 * The JSON shapes the Python side sends us.
 *
 * Mirrors the `to_dict()` methods in steamdirstats/models.py; keep the two in
 * step. Sizes are bytes, playtime is minutes, timestamps are Unix seconds.
 */

export interface WorkshopItem {
  itemid: number
  size: number
  path: string
  time_updated: number | null
  /** Empty when no name could be resolved; `url` is then the only handle. */
  name: string
  url: string
}

export interface Game {
  appid: number
  name: string
  install_dir: string
  install_path: string
  /** Game files only; Workshop content is counted separately. */
  size_on_disk: number
  workshop_size: number
  /** size_on_disk + workshop_size: what the treemap sizes tiles by. */
  total_size: number
  state_flags: number
  fully_installed: boolean
  last_updated: number | null
  /** Per-account, so null when no account was found or the game is unplayed. */
  playtime: number | null
  playtime_2weeks: number | null
  last_played: number | null
  workshop_items: WorkshopItem[]
}

export interface Library {
  path: string
  label: string
  /** False when the folder is missing, e.g. an unplugged drive. */
  available: boolean
  disk_total: number | null
  disk_free: number | null
  size_on_disk: number
  workshop_size: number
  games: Game[]
}

export interface Account {
  steamid64: number
  accountid: number
  account_name: string
  persona_name: string
  userdata_path: string
}

export interface SteamData {
  steam_path: string
  account: Account | null
  /** True when sizes were walked on disk rather than read from manifests. */
  accurate: boolean
  size_on_disk: number
  workshop_size: number
  libraries: Library[]
}

/** Arguments for scanner.scan(); the Python side takes these as keywords. */
export interface ScanOptions {
  accurate?: boolean
  workshop_names?: boolean
  offline?: boolean
}

/** Pushed from Python during an accurate scan (measure.ScanProgress). */
export interface ScanProgress {
  done: number
  total: number
  /** The game being measured. */
  name: string
}
