import type { Card } from './stats'

export const CARDS: readonly Card[] = [
  // ---------------------------------------------------------------- hull
  {
    id: 'plating',
    name: 'Reinforced Plating',
    family: 'hull',
    text: 'Doubled oak on the waterline. Takes a lot more punishment.',
    add: { hull: 30 },
  },
  {
    id: 'keel',
    name: 'Deep Keel',
    family: 'hull',
    text: 'Heavier below, faster through it. Stiffer ride, blunter entry.',
    mul: { hull: 1.15, speed: 0.92 },
  },
  {
    id: 'buoyancy',
    name: 'Buoyancy',
    family: 'hull',
    text: 'Rides higher and softer. Waves lose their grip on you.',
    mul: { waveImpact: 0.6, rideHeight: 1.6 },
  },

  // ---------------------------------------------------------------- sail
  {
    id: 'full-sails',
    name: 'Full Sails',
    family: 'sail',
    text: 'More canvas, more speed.',
    mul: { speed: 1.12 },
  },
  {
    id: 'rigging',
    name: 'Running Rigging',
    family: 'sail',
    text: 'Trimmed lines. Comes up to speed fast.',
    mul: { accel: 1.1 },
  },
  {
    id: 'fairlead',
    name: 'Fairlead Chains',
    family: 'sail',
    text: 'Chains instead of rope over the quarter. Tighter turns.',
    mul: { turn: 1.1 },
  },
  {
    id: 'narrow-waist',
    name: 'Narrow Waist',
    family: 'sail',
    text: 'Squeezed amidships to turn like a skiff. Costs you timber.',
    mul: { turn: 1.15, hull: 0.9 },
  },
  {
    id: 'studding',
    name: 'Studding Sails',
    family: 'sail',
    text: 'Huge speed, and the sea hits you like it means it.',
    mul: { speed: 1.25, waveImpact: 1.3 },
  },

  // ---------------------------------------------------------------- utility
  {
    id: 'glass',
    name: "Navigator's Glass",
    family: 'utility',
    text: 'Dead reckoning gives you one bearing. The glass gives you all of them.',
    add: { lookahead: 1 },
  },
  {
    id: 'helm',
    name: 'Helm Upgrade',
    family: 'utility',
    text: 'Bitting paddle at a dead stop. You can turn before you have way on.',
    add: { helmFloor: 0.45 },
  },
  {
    id: 'ballast',
    name: 'Ballast Shift',
    family: 'utility',
    text: 'Low and heavy. Runs fast, hates changing direction.',
    mul: { speed: 1.1, turn: 0.9 },
  },
  {
    id: 'pumps',
    name: 'Pumps',
    family: 'utility',
    text: 'Keep the bilge clear and you claw speed back when hurt.',
    mul: { pumps: 1.08 },
  },

  // ---------------------------------------------------------------- risky
  {
    id: 'blackpowder',
    name: 'Blackpowder Charge',
    family: 'risky',
    text: 'Overcharged. Enormous speed, and the hull was never meant to hold this.',
    mul: { speed: 1.5, hull: 0.8 },
  },
  {
    id: 'double-crew',
    name: 'Double Crew',
    family: 'risky',
    text: 'Twice the hands on every line. All of it faster, none of it safer.',
    mul: { speed: 1.1, accel: 1.1, turn: 1.1, frailty: 1.15 },
  },
  {
    id: 'tight-fit',
    name: 'Overloaded Hold',
    family: 'risky',
    text: 'Cargo lashed above the rail. Fast, but she takes a beating.',
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