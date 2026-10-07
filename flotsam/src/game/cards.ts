import type { Card } from './stats'

export const CARDS: readonly Card[] = [
  // ---------------------------------------------------------------- hull
  {
    id: 'plating',
    name: 'Twice as Thick',
    family: 'hull',
    text: 'Two planks thick where the sea hits hardest. They hit; you shrug.',
    add: { hull: 30 },
  },
  {
    id: 'keel',
    name: 'Deep Bottom',
    family: 'hull',
    text: 'Deeper in the water than anyone would build her. She pushes through the waves instead of climbing every one.',
    mul: { hull: 1.15, speed: 0.92 },
  },
  {
    id: 'buoyancy',
    name: 'Floats Higher',
    family: 'hull',
    text: 'Sits high in the water. The waves grab less of her, and she bobs right back up.',
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
    name: 'Tighter Ropes',
    family: 'sail',
    text: 'Every rope tight and waiting. She answers the moment you ask.',
    mul: { accel: 1.1 },
  },
  {
    id: 'fairlead',
    name: 'Iron Chains',
    family: 'sail',
    text: 'Iron chains where rope used to be. She pivots hard and follows exactly where you point her.',
    mul: { turn: 1.1 },
  },
  {
    id: 'narrow-waist',
    name: 'Slim and Quick',
    family: 'sail',
    text: 'Narrowed until she turns on the spot. It cost some of her strength to do it.',
    mul: { turn: 1.15, hull: 0.9 },
  },
  {
    id: 'studding',
    name: 'Too Many Sails',
    family: 'sail',
    text: 'Every sail you own and then some. She flies — and the waves hit back like it took it personally.',
    mul: { speed: 1.25, waveImpact: 1.3 },
  },

  // ---------------------------------------------------------------- utility
  {
    id: 'glass',
    name: 'Spyglass',
    family: 'utility',
    text: 'One island by guess; every island through the glass. You never sail blind again.',
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
    name: 'Weight Down Low',
    family: 'utility',
    text: 'All the weight moved low and heavy. Fast in a straight line, and she will complain if you ask her to turn.',
    mul: { speed: 1.1, turn: 0.9 },
  },
  {
    id: 'pumps',
    name: 'Pumps',
    family: 'utility',
    text: 'Water stays out even when she is hurting. What the sea takes, she claws back.',
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
    name: 'Packed to the Rails',
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
