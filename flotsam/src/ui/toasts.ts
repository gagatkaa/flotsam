export type Tone = 'gain' | 'cost' | 'info'

const MAX_VISIBLE = 5
/** milliseconds; matches the CSS animation */
const LIFETIME = 2800

export function toast(container: HTMLElement, text: string, tone: Tone) {
  const item = document.createElement('div')
  item.className = `toast ${tone}`
  item.textContent = text
  container.appendChild(item)

  while (container.children.length > MAX_VISIBLE) container.firstElementChild!.remove()
  window.setTimeout(() => item.remove(), LIFETIME)
}

export interface Tally {
  health: number
  pieces: number
  crew: number
  rescued: number
  gold: number
  food: number
}

const LABELS: Record<keyof Tally, string> = {
  health: 'health',
  pieces: 'map piece',
  crew: 'crew',
  rescued: 'rescued',
  gold: 'gold',
  food: 'food',
}

/** toast every number that moved between two tallies; returns true if any did */
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
