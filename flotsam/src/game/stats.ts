export interface Stats {
  hull: number
  /** top speed in units/second */
  speed: number
  accel: number
  /** yaw rate at full rudder, radians/second */
  turn: number
  /** multiplies pitch and roll from the waves */
  waveImpact: number
  /** how far the deck sits above the waterline */
  rideHeight: number
  /** rudder authority at a dead stop, 0-1 */
  helmFloor: number
  /** speed multiplier once below half hull */
  pumps: number
  /** multiplier on damage taken */
  frailty: number
  /** above 0, the instruments show every island instead of just the nearest */
  lookahead: number
}

export const BASE_STATS: Stats = {
  hull: 60,
  speed: 6,
  accel: 1,
  turn: 0.85,
  waveImpact: 1,
  rideHeight: 0.25,
  helmFloor: 0,
  pumps: 1,
  frailty: 1,
  lookahead: 0,
}

/** ceilings that keep a late-run deck playable */
const CAPS = {
  speed: 13.5,
  turn: 2.1,
  waveImpact: 2.2,
}

/** what is on the boat, as opposed to what is fitted to it */
export interface Load {
  crew: number
  /** people aboard who do not work the boat: pure weight */
  passengers: number
  gold: number
  /** days of food */
  provisions: number
}

export const STARTING_LOAD: Load = { crew: 3, passengers: 0, gold: 0, provisions: 8 }

export type Modifier = Partial<Record<keyof Stats, number>>

export interface Card {
  id: string
  name: string
  text: string
  /** multiplied once per copy */
  mul?: Modifier
  /** added once per copy */
  add?: Modifier
}

/** resolve a deck into stats; order independent, so the draft order changes nothing */
export function resolve(deck: readonly Card[], load: Load = STARTING_LOAD): Stats {
  const stats = { ...BASE_STATS }

  applyLoad(stats, load)

  for (const card of deck) {
    for (const [key, factor] of entries(card.mul)) stats[key] *= factor
    for (const [key, amount] of entries(card.add)) stats[key] += amount
  }

  stats.hull = Math.max(1, stats.hull)
  stats.speed = Math.min(CAPS.speed, stats.speed)
  stats.turn = Math.min(CAPS.turn, stats.turn)
  stats.waveImpact = Math.min(CAPS.waveImpact, stats.waveImpact)
  stats.rideHeight = Math.max(0.1, stats.rideHeight)
  stats.helmFloor = Math.min(1, Math.max(0, stats.helmFloor))
  stats.frailty = Math.max(0.15, stats.frailty)
  stats.lookahead = Math.min(6, Math.max(0, stats.lookahead))

  return stats
}

function applyLoad(stats: Stats, load: Load) {
  const crowding = Math.min(0.42, load.passengers * 0.035)
  stats.speed *= 1 - crowding
  stats.accel *= 1 - crowding * 0.7
  stats.turn *= 1 - crowding * 0.3

  stats.speed *= 1 - Math.min(0.28, (load.gold / 100) * 0.05)

  // one hand can just about sail her; every extra one helps
  const hands = Math.min(0.55, Math.max(0, load.crew - 1) * 0.13)
  stats.accel *= 1 + hands
  stats.turn *= 1 + hands * 0.55

  const hungry = load.provisions <= 0 ? 0.3 : load.provisions < 3 ? 0.14 : 0
  stats.accel *= 1 - hungry
  stats.frailty *= 1 + hungry
}

/** short "speed +12%" lines for the build panel */
export function describe(card: Card): string {
  const parts: string[] = []

  for (const [key, factor] of entries(card.mul)) {
    const sign = factor >= 1 ? '+' : ''
    parts.push(`${LABELS[key]} ${sign}${Math.round((factor - 1) * 100)}%`)
  }

  for (const [key, amount] of entries(card.add)) {
    // lookahead is described by its effect, not its number
    if (key === 'lookahead') continue

    const sign = amount >= 0 ? '+' : ''
    const value = key === 'helmFloor' ? `${Math.round(amount * 100)}%` : `${Math.round(amount * 100) / 100}`
    parts.push(`${LABELS[key]} ${sign}${value}`)
  }

  if ((card.add?.lookahead ?? 0) > 0) parts.push(LABELS.lookahead)

  return parts.join('  ·  ')
}

function entries(modifier: Modifier = {}) {
  return Object.entries(modifier) as [keyof Stats, number][]
}

const LABELS: Record<keyof Stats, string> = {
  hull: 'health',
  speed: 'speed',
  accel: 'acceleration',
  turn: 'turning',
  waveImpact: 'rocking from waves',
  rideHeight: 'deck height',
  helmFloor: 'turning at a stop',
  pumps: 'speed when hurt',
  frailty: 'damage taken',
  lookahead: 'shows every island',
}
