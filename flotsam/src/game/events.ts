import { cardById } from './cards'
import type { IslandEvent } from './run'

/** the story on each island, keyed by the island's `event` id */
const EVENTS: Record<string, IslandEvent> = {
  wreck: {
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
        gain: cardById('blackpowder'),
        damage: 8,
        crewDelta: 1,
        sets: 'saved-sailor',
      },

      {
        text: 'Forget the sailor. Strip the ship.',

        preview:
          'The hull is full of strong timber, better than anything on your own ship, and the captain’s strongbox is still bolted to the cabin floor. You send the crew down before the wreck finally gives up and sinks.',

        outcome:
          'You recover a heavy keel beam and the captain’s coin, but one crew member is trapped when the wreck collapses. You lose 12 health and 1 crew member.',

        piece: 'wreck',
        gain: cardById('keel'),
        damage: 12,
        crewDelta: -1,
        goldDelta: 25,
      },

      {
        text: 'Cut loose the rigging and get out.',

        preview:
          'You decide this ship has already taken enough people. You stay above deck, cut free the best ropes you can find, and leave before the bell rings again.',

        outcome:
          'You gain spare rigging and leave without taking any damage.',

        piece: 'wreck',
        gain: cardById('rigging'),
      },
    ],
  },

  gallows: {
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
        gain: cardById('glass'),
      },

      {
        text: 'Fix the lighthouse mechanism.',

        preview:
          'Instead of leaving, you investigate the machinery. Most of it is useless, but several heavy brass parts are perfect for improving your ship’s steering.',

        outcome:
          'You salvage parts from the lighthouse and upgrade your helm.',

        piece: 'gallows',
        gain: cardById('helm'),
      },

      {
        text: 'Break open the locked box.',

        preview:
          'The lock gives after a few hits. Inside is black powder, a little coin, a half-eaten biscuit, and a logbook. The final entry was written yesterday. The lighthouse has supposedly been empty for twelve years.',

        outcome:
          'You take the black powder and the coin, and leave with a very uncomfortable mystery.',

        piece: 'gallows',
        gain: cardById('blackpowder'),
        goldDelta: 15,
        sets: 'opened-the-box',
      },
    ],
  },

  kitchen: {
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
        gain: cardById('plating'),
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
        gain: cardById('pumps'),
        provisionsDelta: 4,
      },

      {
        text: 'Grab supplies during the chaos.',

        preview:
          'While everyone is chasing the crab, you help yourself to a few unattended supplies. Unfortunately, the market master notices before you reach your boat.',

        outcome:
          'You escape with a purse and a sack of food, but lose 8 health after a very short and very unfair fight.',

        piece: 'kitchen',
        damage: 8,
        goldDelta: 20,
        provisionsDelta: 3,
      },

      {
        text: 'Pay for a ship’s cook.',

        preview:
          'A retired galley cook has been sitting on the same crate all morning. For a fair price she will bring her pots, her spices, and enough salted fish to last the trip.',

        outcome:
          'You pay 20 gold. The cook comes aboard with 6 days of food.',

        piece: 'kitchen',
        goldDelta: -20,
        provisionsDelta: 6,
        crewDelta: 1,
      },

      {
        text: 'Let the sailor do the talking.',

        preview:
          'The sailor you pulled from the wreck grew up on this dock. Half the market owes his family a favour, and the market master is his cousin.',

        outcome:
          'The sailor gets you hull plating and passage for two locals, for only 2 days of food.',

        piece: 'kitchen',
        gain: cardById('plating'),
        provisionsDelta: -2,
        passengersDelta: 2,
        requires: 'saved-sailor',
      },
    ],
  },

  bones: {
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
        gain: cardById('helm'),
      },

      {
        text: 'Take one of the giant bones.',

        preview:
          'One of the ribs is almost the perfect shape to reinforce your damaged hull. Removing it is hard work, and the entire skeleton shifts while you cut it free.',

        outcome:
          'You reinforce the ship with a giant rib, but the dangerous work costs you 12 health.',

        piece: 'bones',
        gain: cardById('tight-fit'),
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

      {
        text: 'Read the lighthouse logbook aloud.',

        preview:
          'The handwriting in the logbook matches the notes pinned around the shrine. When you read the last entry aloud, a thin old man climbs out of the skull: the lighthouse keeper, twelve years gone.',

        outcome:
          'The keeper joins your crew, hands you the chart and his savings, and shows you the safe way down.',

        piece: 'bones',
        crewDelta: 1,
        goldDelta: 30,
        requires: 'opened-the-box',
      },
    ],
  },
}

/** the story written for an island, or undefined if it has none yet */
export function eventFor(id: string): IslandEvent | undefined {
  return EVENTS[id]
}