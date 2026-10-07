import type { Card } from './stats'

export const CARDS: readonly Card[] = [
  // ---------------------------------------------------------------- hull
  {
    id: 'plating',
    name: 'Reinforced Plating',
    family: 'hull',
    text: 'Two planks thick at the waterline, where the sea punches hardest. They hit; you shrug.',
    add: { hull: 30 },
  },
  {
    id: 'keel',
    name: 'Deep Keel',
    family: 'hull',
    text: 'Deeper below the waterline than anyone would build her. She shoulders through the swell instead of climbing every wave.',
    mul: { hull: 1.15, speed: 0.92 },
  },
  {
    id: 'buoyancy',
    name: 'Buoyancy',
    family: 'hull',
    text: 'Corked up high and easy. The waves grab hold of less of her — and let more of her up for air.',
    mul: { waveImpact: 0.6, rideHeight: 1.6 },
  },

  // ---------------------------------------------------------------- sail
  {
    id: 'full-sails',
    name: 'Full Sails',
    family: 'sail',
    text: 'Every scrap of sail she can carry. When the wind offers anything, she takes all of it.',
    mul: { speed: 1.12 },
  },
  {
    id: 'rigging',
    name: 'Running Rigging',
    family: 'sail',
    text: 'Every line taut and waiting. She answers the moment you ask.',
    mul: { accel: 1.1 },
  },
  {
    id: 'fairlead',
    name: 'Fairlead Chains',
    family: 'sail',
    text: 'Iron chains where rope used to be. She pivots hard and follows exactly where you point her.',
    mul: { turn: 1.1 },
  },
  {
    id: 'narrow-waist',
    name: 'Narrow Waist',
    family: 'sail',
    text: 'Cut in at the waist until she turns on a coin. Some of her bones went to pay for it.',
    mul: { turn: 1.15, hull: 0.9 },
  },
  {
    id: 'studding',
    name: 'Studding Sails',
    family: 'sail',
    text: 'Every sail you own and then some. She flies — and the sea hits back like it took it personally.',
    mul: { speed: 1.25, waveImpact: 1.3 },
  },

  // ---------------------------------------------------------------- utility
  {
    id: 'glass',
    name: "Navigator's Glass",
    family: 'utility',
    text: 'One bearing by instinct; every bearing through the glass. You never sail blind again.',
    add: { lookahead: 1 },
  },
  {
    id: 'helm',
    name: 'Steering Upgrade',
    family: 'utility',
    text: 'Iron bitted into the rudder. Even stopped dead, she turns when you ask.',
    add: { helmFloor: 0.45 },
  },
  {
    id: 'ballast',
    name: 'Ballast Shift',
    family: 'utility',
    text: 'Ballast shifted low and heavy. Fast on the straight run, and she will complain if you ask her to turn.',
    mul: { speed: 1.1, turn: 0.9 },
  },
  {
    id: 'pumps',
    name: 'Pumps',
    family: 'utility',
    text: 'Bilge stays clear even when she is hurting. What the sea takes, she claws back.',
    mul: { pumps: 1.08 },
  },

  // ---------------------------------------------------------------- risky
  {
    id: 'blackpowder',
    name: 'Blackpowder Charge',
    family: 'risky',
    text: 'A charge bigger than she was ever built to hold. She goes like a warship for a moment, and begs forgiveness right after.',
    mul: { speed: 1.5, hull: 0.8 },
  },
  {
    id: 'double-crew',
    name: 'Double Crew',
    family: 'risky',
    text: 'Two hands on every line, two on every watch. Everything reacts faster — including the parts that break.',
    mul: { speed: 1.1, accel: 1.1, turn: 1.1, frailty: 1.15 },
  },
  {
    id: 'tight-fit',
    name: 'Overloaded Hold',
    family: 'risky',
    text: 'Stuffed to the rails and lashed down hard. She runs heavy and fast, and every other wave reminds you why no one else does this.',
    mul: { speed: 1.18, frailty: 1.25 },
  },
]

/** cards that only change what you see, so they're safe to repeat */
const INFORMATIONAL = new Set(['glass', 'helm'])

/**
 * Offer three cards. Nudges toward cards the deck has none of, so a run keeps
 * opening up instead of offering the same pick forever, and never offers two
 * copies of itself in one hand.
 */
export function draft(deck: readonly Card[], random: () => number = Math.random): Card[] {
  const owned = new Set(deck.map((card) => card.id))

  const weight = (card: Card) => {
    if (owned.has(card.id) && INFORMATIONAL.has(card.id)) return 0.5
    if (owned.has(card.id)) return 2.2
    return 1
  }

  const pool = CARDS.slice()
  const hand: Card[] = []

  while (hand.length < 3 && pool.length > 0) {
    let total = 0
    for (const card of pool) total += weight(card)

    let roll = random() * total
    let index = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      roll -= weight(pool[i])
      if (roll <= 0) {
        index = i
        break
      }
    }

    hand.push(pool.splice(index, 1)[0])
  }

  return hand
}
/** the display name for a card id, for anything that refers to a card by id */
export function cardName(id: string): string {
  return CARDS.find((c) => c.id === id)?.name ?? id
}
