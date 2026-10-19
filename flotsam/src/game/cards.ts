import type { Card } from './stats'

export const CARDS: readonly Card[] = [
  // ---------------------------------------------------------------- hull
  {
    id: 'plating',
    name: 'Twice as Thick',
    text: 'Two planks thick where the sea hits hardest. They hit; you shrug.',
    add: { hull: 30 },
  },
  {
    id: 'keel',
    name: 'Deep Bottom',
    text: 'Deeper in the water than anyone would build her. She pushes through the waves instead of climbing every one.',
    mul: { hull: 1.15, speed: 0.92 },
  },
  {
    id: 'buoyancy',
    name: 'Floats Higher',
    text: 'Sits high in the water. The waves grab less of her, and she bobs right back up.',
    mul: { waveImpact: 0.6, rideHeight: 1.6 },
  },

  // ---------------------------------------------------------------- sail
  {
    id: 'full-sails',
    name: 'Full Sails',
    text: 'Every scrap of sail she can carry. When the wind offers anything, she takes all of it.',
    mul: { speed: 1.12 },
  },
  {
    id: 'rigging',
    name: 'Tighter Ropes',
    text: 'Every rope tight and waiting. She answers the moment you ask.',
    mul: { accel: 1.1 },
  },
  {
    id: 'fairlead',
    name: 'Iron Chains',
    text: 'Iron chains where rope used to be. She pivots hard and follows exactly where you point her.',
    mul: { turn: 1.1 },
  },
  {
    id: 'narrow-waist',
    name: 'Slim and Quick',
    text: 'Narrowed until she turns on the spot. It cost some of her strength to do it.',
    mul: { turn: 1.15, hull: 0.9 },
  },
  {
    id: 'studding',
    name: 'Too Many Sails',
    text: 'Every sail you own and then some. She flies — and the waves hit back like it took it personally.',
    mul: { speed: 1.25, waveImpact: 1.3 },
  },

  // ---------------------------------------------------------------- utility
  {
    id: 'glass',
    name: 'Spyglass',
    text: 'One island by guess; every island through the glass. You never sail blind again.',
    add: { lookahead: 1 },
  },
  {
    id: 'helm',
    name: 'Steering Upgrade',
    text: 'Iron bitted into the rudder. Even stopped dead, she turns when you ask.',
    add: { helmFloor: 0.45 },
  },
  {
    id: 'ballast',
    name: 'Weight Down Low',
    text: 'All the weight moved low and heavy. Fast in a straight line, and she will complain if you ask her to turn.',
    mul: { speed: 1.1, turn: 0.9 },
  },
  {
    id: 'pumps',
    name: 'Pumps',
    text: 'Water stays out even when she is hurting. What the sea takes, she claws back.',
    mul: { pumps: 1.08 },
  },

  // ---------------------------------------------------------------- risky
  {
    id: 'blackpowder',
    name: 'Blackpowder Charge',
    text: 'A charge bigger than she was ever built to hold. She goes like a warship for a moment, and begs forgiveness right after.',
    mul: { speed: 1.5, hull: 0.8 },
  },
  {
    id: 'double-crew',
    name: 'Double Crew',
    text: 'Two hands on every line, two on every watch. Everything reacts faster — including the parts that break.',
    mul: { speed: 1.1, accel: 1.1, turn: 1.1, frailty: 1.15 },
  },
  {
    id: 'tight-fit',
    name: 'Packed to the Rails',
    text: 'Stuffed to the rails and lashed down hard. She runs heavy and fast, and every other wave reminds you why no one else does this.',
    mul: { speed: 1.18, frailty: 1.25 },
  },
]

export function cardById(id: string): Card {
  const card = CARDS.find((c) => c.id === id)
  if (!card) throw new Error(`unknown card: ${id}`)
  return card
}

export function cardName(id: string): string {
  return CARDS.find((c) => c.id === id)?.name ?? id
}
