/**
 * Display helpers, mirroring the CLI's formatting in steamdirstats/__main__.py
 * so the UI and the text report never disagree.
 */

/** Binary units, labelled like Windows Explorer (1 GB = 1024^3 bytes). */
export function formatSize(numBytes: number | null): string {
  if (numBytes === null || numBytes === undefined) return '?'
  let size = numBytes
  for (const unit of ['B', 'KB', 'MB', 'GB']) {
    if (size < 1024) {
      return unit === 'B' ? `${Math.round(size)} B` : `${size.toFixed(1)} ${unit}`
    }
    size /= 1024
  }
  return `${size.toFixed(2)} TB`
}

/**
 * Playtime the way Steam shows it: "45 min", "590.8 h".
 *
 * Steam rounds the hours up to one decimal (35443 minutes is 590.72 hours,
 * shown as 590.8), so round the same way to match it.
 */
export function formatPlaytime(minutes: number | null): string {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes} min`
  return `${(Math.ceil(minutes / 6) / 10).toFixed(1)} h`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A date like Steam's: "Nov 12", with the year added outside this year. */
export function formatLastPlayed(timestamp: number | null): string {
  if (!timestamp) return ''
  const when = new Date(timestamp * 1000)
  if (Number.isNaN(when.getTime())) return ''
  const day = `${MONTHS[when.getMonth()]} ${when.getDate()}`
  return when.getFullYear() === new Date().getFullYear() ? day : `${day}, ${when.getFullYear()}`
}

/** The "590.8 h, Nov 12" note on a game, empty when never played. */
export function formatPlayNote(playtime: number | null, lastPlayed: number | null): string {
  return [formatPlaytime(playtime), formatLastPlayed(lastPlayed)].filter(Boolean).join(', ')
}

/** A share of a total, as "12%"; empty when the total is zero. */
export function formatShare(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : ''
}
