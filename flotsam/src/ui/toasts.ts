// Short messages that slide in at the side of the screen when something
// changes: food eaten, a map piece found, the hull scraped on a rock.

export type Tone = 'gain' | 'cost' | 'info'

/** how many messages can stack before the oldest is pushed out */
const MAX_VISIBLE = 5
/** how long a message stays up, in milliseconds. Matches the CSS animation */
const LIFETIME = 2800

export function toast(container: HTMLElement, text: string, tone: Tone) {
  const item = document.createElement('div')
  item.className = `toast ${tone}`
  item.textContent = text
  container.appendChild(item)

  while (container.children.length > MAX_VISIBLE) container.firstElementChild!.remove()
  window.setTimeout(() => item.remove(), LIFETIME)
}

/** the numbers the player cares about, watched for changes */
export interface Tally {
  health: number
  pieces: number
  crew: number
  rescued: number
  gold: number
  food: number
}

/** labels for each tally, as they read in a message ("+2 food") */
const LABELS: Record<keyof Tally, string> = {
  health: 'health',
  pieces: 'map piece',
  crew: 'crew',
  rescued: 'rescued',
  gold: 'gold',
  food: 'food',
}

/** announce every number that moved between two tallies. Returns true if any did */
export function announceChanges(container: HTMLElement, before: Tally, after: Tally) {
  let changed = false
  for (const key of Object.keys(LABELS) as (keyof Tally)[]) {
    const delta = after[key] - before[key]
    if (delta === 0) continue
    changed = true
    toast(container, `${delta > 0 ? '+' : '−'} ${Math.abs(delta)} ${LABELS[key]}`, delta > 0 ? 'gain' : 'cost')
  }
  return changed
}
