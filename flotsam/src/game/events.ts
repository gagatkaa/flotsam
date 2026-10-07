import { CARDS } from './cards'
import type { IslandEvent } from './run'

function byId(id: string) {
  const card = CARDS.find((c) => c.id === id)

  if (!card) {
    throw new Error(`event references unknown card: ${ id } `)
  }

  return card
}

export const EVENTS: Record<string, IslandEvent> = {
  wreck: {
    island: 'wreck',
    title: 'The Ship That Wouldn’t Sink',

    telling:
      'You find a ship drifting in circles with no sails, no flag, and nobody on deck. The strange part is that half of it should already be underwater. Somehow, it is still floating.',

    adventure:
      'As you pull closer, someone starts ringing the ship’s bell from below deck. Three slow rings. Then silence. There is valuable timber in the hold, a locked powder room near the stern, and at least one person still alive somewhere inside.',

    choices: [
      {
        text: 'Follow the bell.',

        preview:
          'You climb into the flooded lower deck and follow the sound. The water rises quickly. You find a trapped sailor, but getting him out means abandoning most of the salvage.',

        outcome:
          'You rescue the sailor and find a hidden box of black powder. The escape costs you 8 health, but you gain 1 crew member.',

        piece: 'wreck',
        gain: byId('blackpowder'),
        damage: 8,
        crewDelta: 1,
      },

      {
        text: 'Forget the sailor. Strip the ship.',

        preview:
          'The hull is full of strong timber, better than anything on your own ship. You send the crew down before the wreck finally gives up and sinks.',

        outcome:
          'You recover a heavy keel beam, but one crew member is trapped when the wreck collapses. You lose 12 health and 1 crew member.',

        piece: 'wreck',
        gain: byId('keel'),
        damage: 12,
        crewDelta: -1,
      },

      {
        text: 'Cut loose the rigging and get out.',

        preview:
          'You decide this ship has already taken enough people. You stay above deck, cut free the best ropes you can find, and leave before the bell rings again.',

        outcome:
          'You gain spare rigging and leave without taking any damage.',

        piece: 'wreck',
        gain: byId('rigging'),
      },
    ],
  },

  gallows: {
    island: 'gallows',
    title: 'The Lighthouse With No Light',

    telling:
      'A tall stone lighthouse stands on a tiny island ahead. Its lantern is dark, but every few seconds the giant mirror inside turns by itself.',

    adventure:
      'Inside, the place looks abandoned. Plates are still on the table. A coat hangs by the door. At the top of the tower you find a chart, a navigator’s glass, and a locked metal box. Then the lighthouse door slams shut below you.',

    choices: [
      {
        text: 'Take the glass and leave through the roof.',

        preview:
          'You climb onto the lantern platform and use the old maintenance ladder to get outside. The navigator’s glass is still in excellent condition.',

        outcome:
          'You escape with the chart and gain the Navigator’s Glass.',

        piece: 'gallows',
        gain: byId('glass'),
      },

      {
        text: 'Fix the lighthouse mechanism.',

        preview:
          'Instead of leaving, you investigate the machinery. Most of it is useless, but several heavy brass parts are perfect for improving your ship’s steering.',

        outcome:
          'You salvage parts from the lighthouse and upgrade your helm.',

        piece: 'gallows',
        gain: byId('helm'),
      },

      {
        text: 'Break open the locked box.',

        preview:
          'The lock gives after a few hits. Inside is black powder, a half-eaten biscuit, and a logbook. The final entry was written yesterday. The lighthouse has supposedly been empty for twelve years.',

        outcome:
          'You gain black powder and leave with a very uncomfortable mystery.',

        piece: 'gallows',
        gain: byId('blackpowder'),
        sets: 'opened-the-box',
      },
    ],
  },

  kitchen: {
    island: 'kitchen',
    title: 'The Crab Market',

    telling:
      'You hear the shouting before you see the island. A tiny fishing village has turned its dock into a loud, chaotic market. People are selling fish, rope, tools, rum, and one absolutely enormous crab tied to a cart.',

    adventure:
      'The market master spots your ship and immediately tries to sell you half the island. Somewhere in the noise you notice useful hull plating, a set of working pumps, and several people looking for passage off the island.',

    choices: [
      {
        text: 'Trade some food.',

        preview:
          'You offer provisions instead of coins. The villagers are hungry enough to accept. They give you strong hull plating, and two locals ask to join your journey.',

        outcome:
          'You spend 5 provisions, gain hull plating, and take 2 passengers aboard.',

        piece: 'kitchen',
        gain: byId('plating'),
        provisionsDelta: -5,
        passengersDelta: 2,
      },

      {
        text: 'Help catch the giant crab.',

        preview:
          'The crab gets loose. Naturally, everyone decides this is now your problem. After a ridiculous chase through the market, you trap it between two barrels.',

        outcome:
          'The villagers reward you with spare pumps and enough food for several days. You gain 4 provisions.',

        piece: 'kitchen',
        gain: byId('pumps'),
        provisionsDelta: 4,
      },

      {
        text: 'Grab supplies during the chaos.',

        preview:
          'While everyone is chasing the crab, you help yourself to a few unattended supplies. Unfortunately, the market master notices before you reach your boat.',

        outcome:
          'You escape with what you took, but lose 8 health after a very short and very unfair fight.',

        piece: 'kitchen',
        damage: 8,
      },
    ],
  },

  bones: {
    island: 'bones',
    title: 'The Sleeping Giant',

    telling:
      'At first you think the island has strange white cliffs. Then one of them moves. You are not looking at rock. You are looking at the bones of something enormous.',

    adventure:
      'The skeleton stretches across almost the entire island. Someone has built a small shrine inside its rib cage. In the centre sits a chart, surrounded by tools, offerings, and the remains of an old camp.',

    choices: [
      {
        text: 'Take the chart carefully.',

        preview:
          'You enter the rib cage without touching the shrine. Beneath the chart you find an old metal steering part left as an offering.',

        outcome:
          'You take the chart without disturbing the shrine and gain a helm upgrade.',

        piece: 'bones',
        gain: byId('helm'),
      },

      {
        text: 'Take one of the giant bones.',

        preview:
          'One of the ribs is almost the perfect shape to reinforce your damaged hull. Removing it is hard work, and the entire skeleton shifts while you cut it free.',

        outcome:
          'You reinforce the ship with a giant rib, but the dangerous work costs you 12 health.',

        piece: 'bones',
        gain: byId('tight-fit'),
        damage: 12,
      },

      {
        text: 'Search the old camp.',

        preview:
          'While searching the ruined camp, you hear someone shouting from inside the skull. A castaway has been living there alone and is very happy to see another human being.',

        outcome:
          'You rescue 1 passenger, but falling debris hits you during the climb. You lose 8 health.',

        piece: 'bones',
        damage: 8,
        passengersDelta: 1,
      },
    ],
  },
}

export function eventFor(id: string): IslandEvent | undefined {
  return EVENTS[id]
}