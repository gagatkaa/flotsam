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
  /**
   * How much of the archipelago you can read off the instruments. 0 means the
   * dead reckoning in your head: one bearing, to the nearest island. Higher
   * values buy you the whole set, so one Navigator's Glass does the job and
   * further copies are only worth taking for what else they carry.
   */
  lookahead: number
}

export const BASE_STATS: Stats = {
  hull: 100,
  speed: 8.5,
  accel: 1,
  turn: 0.85,
  waveImpact: 1,
  rideHeight: 0.25,
  helmFloor: 0,
  pumps: 1,
  frailty: 1,
  lookahead: 0,
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

/**
 * What is actually on the boat, as opposed to what has been fitted to it. The
 * deck is not just cards: a boat carrying nine rescued people and a chest of
 * coin handles like a barge, and a boat with nobody left to work the lines
 * handles like nothing at all.
 */
export interface Load {
  /** hands that can work the sheets. This is a crew, not a passenger list */
  crew: number
  /** people picked up who do not pull. pure weight */
  passengers: number
  /** coin and plate. heavier than it looks */
  gold: number
  /** days of food. a short commons makes the crew slow and clumsy */
  provisions: number
}

export const STARTING_LOAD: Load = { crew: 3, passengers: 0, gold: 0, provisions: 8 }

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
export function resolve(deck: readonly Card[], load: Load = STARTING_LOAD): Stats {
  const stats = { ...BASE_STATS }

  applyLoad(stats, load)

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
  // seven islands, six of them worth finding, and one copy already shows all
  stats.lookahead = Math.min(6, Math.max(0, stats.lookahead))

  // you cannot sail with nobody at all. a boat with no hands is going adrift.

  return stats
}

/**
 * Fold the people and the cargo into the stats. Kept beside resolve() rather
 * than inside it so the two kinds of weight stay legible: cards change what the
 * boat is, the load changes what is in it.
 */
function applyLoad(stats: Stats, load: Load) {
  // every passenger is a body in the way and a mouth to feed
  const crowding = Math.min(0.42, load.passengers * 0.035)
  stats.speed *= 1 - crowding
  stats.accel *= 1 - crowding * 0.7
  stats.turn *= 1 - crowding * 0.3

  // coin is dead weight, and it adds up faster than passengers do
  stats.speed *= 1 - Math.min(0.28, (load.gold / 100) * 0.05)

  // hands on the lines. one person can just about sail her; more is faster
  const hands = Math.min(0.55, Math.max(0, load.crew - 1) * 0.13)
  stats.accel *= 1 + hands
  stats.turn *= 1 + hands * 0.55

  // a short commons: hungry, wet crew work her slowly and break her easily
  const hungry = load.provisions <= 0 ? 0.3 : load.provisions < 3 ? 0.14 : 0
  stats.accel *= 1 - hungry
  stats.frailty *= 1 + hungry
}

/** short "speed +12%" lines for the build panel, derived from the same numbers */
export function describe(card: Card): string {
  const parts: string[] = []

  for (const [key, factor] of Object.entries(card.mul ?? {}) as [keyof Stats, number][]) {
    const sign = factor >= 1 ? '+' : ''
    parts.push(`${LABELS[key]} ${sign}${Math.round((factor - 1) * 100)}%`)
  }

  for (const [key, amount] of Object.entries(card.add ?? {}) as [keyof Stats, number][]) {
    // lookahead counts landmarks rather than adjusting a number, and one copy
    // already reveals everything there is, so describe the effect instead
    if (key === 'lookahead') continue

    const sign = amount >= 0 ? '+' : ''
    parts.push(`${LABELS[key]} ${sign}${Math.round(amount * 100) / 100}`)
  }

  if ((card.add?.lookahead ?? 0) > 0) parts.push(LABELS.lookahead)

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
  lookahead: 'bearing to every island',
}