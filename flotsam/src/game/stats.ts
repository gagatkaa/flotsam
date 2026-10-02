export interface Stats {
  /** hit points before the hull goes under */
  hull: number
  /** top speed in units/second */
  speed: number
  /** how fast you reach top speed */
  accel: number
  /** yaw rate at full rudder, radians/second */
  turn: number
  /** multiplies pitch and roll from the waves. high = punishing ride */
  waveImpact: number
  /** how far the deck sits above the waterline */
  rideHeight: number
  /** rudder authority available at a dead stop, 0-1 */
  helmFloor: number
  /** flat speed multiplier once below half hull, 1 = none */
  pumps: number
  /** multiplier on collision damage taken */
  frailty: number
}

export const BASE_STATS: Stats = {
  hull: 100,
  speed: 8.5,
  accel: 1.6,
  turn: 0.85,
  waveImpact: 1,
  rideHeight: 0.25,
  helmFloor: 0,
  pumps: 1,
  frailty: 1,
}

/**
 * Ceilings that exist to stop a late-run deck from becoming unplayable rather
 * than to balance it. Speeds and turns still climb, just not without bound.
 */
const CAPS = {
  speed: 19,
  turn: 2.1,
  waveImpact: 2.2,
}

export type Modifier = Partial<Record<keyof Stats, number>>

export interface Card {
  id: string
  name: string
  family: 'hull' | 'sail' | 'utility' | 'risky'
  /** the player-facing description, written from the card's own numbers */
  text: string
  /** multiplied once per copy */
  mul?: Modifier
  /** added once per copy */
  add?: Modifier
}

/**
 * Resolve a deck into stats. Pure and order independent: two copies of a card
 * contribute twice, and the order you drafted them in changes nothing. That
 * makes the build readable as a list and keeps the draft honest.
 */
export function resolve(deck: readonly Card[]): Stats {
  const stats = { ...BASE_STATS }

  for (const card of deck) {
    if (card.mul) {
      for (const [key, factor] of Object.entries(card.mul) as [keyof Stats, number][]) {
        stats[key] *= factor
      }
    }
    if (card.add) {
      for (const [key, amount] of Object.entries(card.add) as [keyof Stats, number][]) {
        stats[key] += amount
      }
    }
  }

  stats.hull = Math.max(1, stats.hull)
  stats.speed = Math.min(CAPS.speed, stats.speed)
  stats.turn = Math.min(CAPS.turn, stats.turn)
  stats.waveImpact = Math.min(CAPS.waveImpact, stats.waveImpact)
  stats.rideHeight = Math.max(0.1, stats.rideHeight)
  stats.helmFloor = Math.min(1, Math.max(0, stats.helmFloor))
  stats.frailty = Math.max(0.15, stats.frailty)

  return stats
}

/** short "speed +12%" lines for the build panel, derived from the same numbers */
export function describe(card: Card): string {
  const parts: string[] = []

  for (const [key, factor] of Object.entries(card.mul ?? {}) as [keyof Stats, number][]) {
    const sign = factor >= 1 ? '+' : ''
    parts.push(`${LABELS[key]} ${sign}${Math.round((factor - 1) * 100)}%`)
  }

  for (const [key, amount] of Object.entries(card.add ?? {}) as [keyof Stats, number][]) {
    const sign = amount >= 0 ? '+' : ''
    parts.push(`${LABELS[key]} ${sign}${Math.round(amount * 100) / 100}`)
  }

  return parts.join('  ')
}

const LABELS: Record<keyof Stats, string> = {
  hull: 'hull',
  speed: 'speed',
  accel: 'accel',
  turn: 'turn',
  waveImpact: 'wave impact',
  rideHeight: 'freeboard',
  helmFloor: 'helm',
  pumps: 'pumps',
  frailty: 'damage taken',
}