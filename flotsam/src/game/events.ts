import { CARDS } from './cards'
import type { IslandEvent } from './run'

/**
 * The seven islands. `requires` / `blockedBy` on a choice is what lets an
 * earlier decision change a later island, which is the point of the whole
 * thing: any order you sail in, the run is different.
 */
export const EVENTS: Record<string, IslandEvent> = {
  wreck: {
    island: 'wreck',
    title: 'The Wreck',
    telling:
      'You find her at first light, bow under and stern up, which is how you know ' +
      'she went down forward and fought it the whole way. Thirty feet of her are ' +
      'still dry. Somebody lashed the captain to his own wheel before the water ' +
      'came, and the lashing has held, which means it happened faster than he ' +
      'could think to cut himself free.',
    adventure:
      'You take the boat in on the lee side and go over the rail. There is a ' +
      'chart case still lashed above the chart table, and the chart table is ' +
      'what you came for.',
    choices: [
      {
        text: 'Go below. Whatever cargo she was carrying is still down there.',
        outcome: "Went below in the wreck. Took her chart off the captain's table.",
        piece: 'wreck',
        gain: byId('keel'),
        damage: 12,
        sets: 'robbed-wreck',
      },
      {
        text: "Take the wheel off the captain and burn it with his name on it.",
        outcome: "Took the wheel off the captain. Burned his name off it. Took her chart.",
        piece: 'wreck',
        gain: byId('blackpowder'),
        sets: 'burned-name',
      },
      {
        text: 'Cut the lashings and put him in the water. He chose the wheel.',
        outcome: 'Cut the captain loose and put him in the water. Took her chart.',
        piece: 'wreck',
        damage: 18,
        sets: 'killed-wreck',
        gain: byId('plating'),
      },
      {
        text: 'Leave her. Do not touch anything.',
        outcome: 'Left the wreck alone. Took the chart off the wheelhouse door.',
        piece: 'wreck',
        gain: byId('rigging'),
      },
    ],
  },

  gallows: {
    island: 'gallows',
    title: 'Gallows Cay',
    telling:
      'It is low, flat and green, and the only thing standing on it is a post ' +
      'with a chart nailed to it. The post is a gallows. The chart is half ' +
      'coastline, and half of that is yours - your own harbour, drawn by someone ' +
      'who had stood exactly where you are standing.',
    adventure:
      'At the bottom, in a hand that ran out of room, four words: *they hang for ' +
      'this here*. And below that, scratched into the post itself, the same ' +
      'warning in a different hand. Twice, then. That means it worked at least ' +
      'once, and that means there is somebody here.',
    choices: [
      {
        text: 'Take the chart, and the spy-glass that came with it.',
        outcome: 'Took the chart and the glass off the gallows.',
        piece: 'gallows',
        gain: byId('glass'),
        sets: 'took-chart',
      },
      {
        text: 'Leave it. You are not the only lost crew out here.',
        outcome: 'Left the chart where it hung. But not empty-handed.',
        piece: 'gallows',
        gain: byId('helm'),
        sets: 'left-chart',
      },
      {
        text: 'Burn it. Nobody follows a map nobody has.',
        outcome: 'Burned the chart.',
        piece: 'gallows',
        sets: 'burned-chart',
        requires: 'took-chart',
      },
      {
        text: 'Take the chart and leave your own name nailed under it.',
        outcome: 'Took the chart. Left a name nailed under it.',
        piece: 'gallows',
        requires: 'killed-wreck',
        gain: byId('blackpowder'),
        sets: 'named-yourself',
      },
    ],
  },

  kitchen: {
    island: 'kitchen',
    title: 'Kitchen Rock',
    telling:
      'Low, black and flat on top, and from a long way off it does look like the ' +
      'back of a stove with something still in it. The smell gets you first: wood ' +
      'smoke and something cooking, which should not be possible on a rock ' +
      'nobody has lived on for a year. There is smoke. Somebody is down there ' +
      'keeping a fire going.',
    adventure:
      'You get as far as the ledge before a woman stands up out of the scrub with ' +
      'a long hook in her hand and does not raise it. Behind her, a pit, a pot, ' +
      'and eight or nine people who have clearly been eating for a while. She says ' +
      'nothing for long enough that you think she means to let you leave. Then she ' +
      'says: you have a chart. We have a fire. Those are two different kinds of ' +
      'thing to be.',
    choices: [
      {
        text: 'Trade with them. Meat for a share of the chart.',
        outcome: 'Traded meat for a share of the Kitchen Rock chart.',
        piece: 'kitchen',
        gain: byId('plating'),
        sets: 'traded-kitchen',
      },
      {
        text: 'Take the fire by force while they sleep.',
        outcome: 'Took the Kitchen Rock fire while they slept.',
        piece: 'kitchen',
        gain: byId('blackpowder'),
        damage: 16,
        sets: 'robbed-kitchen',
        requires: 'killed-wreck',
      },
      {
        text: 'Ask for water and nothing else. Give them nothing.',
        outcome: 'Asked the Kitchen Rock people for water. Gave nothing.',
        piece: 'kitchen',
        gain: byId('pumps'),
        sets: 'thieved-kitchen',
      },
      {
        text: 'Take the pot and go. Leave them the fire.',
        outcome: 'Took their pot and left them the fire.',
        piece: 'kitchen',
        damage: 8,
        sets: 'took-pot',
      },
    ],
  },

  bones: {
    island: 'bones',
    title: 'The Bones',
    telling:
      'The rock is white, and the beach is not entirely sand. You can see it ' +
      'sitting under the water and you can see what it is before you are close ' +
      'enough to be embarrassed about guessing. It is very regular. It is stacked. ' +
      'Something out here arranged this.',
    adventure:
      'Ribs, in a row, big as your boat, going up into the cliff face where they ' +
      'disappear into a seam of black rock. Somebody has been living in the mouth ' +
      'of it, and has laid out everything the sea would not take. In the middle of ' +
      'the arrangement, weighted down with stones, is a roll of oilcloth with a ' +
      'chart in it and no name on the outside.',
    choices: [
      {
        text: 'Take the oilcloth. The bones were somebody\'s before they were a chart.',
        outcome: 'Took the chart from the Bones.',
        piece: 'bones',
        damage: 8,
        sets: 'took-bones',
      },
      {
        text: 'Take the chart and re-lay the bones the way you found them.',
        outcome: 'Took the chart. Re-laid the bones.',
        piece: 'bones',
        gain: byId('helm'),
        sets: 'tended-bones',
      },
      {
        text: 'Take a rib for the boat. The hull is open and you are four days out.',
        outcome: 'Took a rib from the Bones for the hull.',
        piece: 'bones',
        gain: byId('tight-fit'),
        damage: 12,
        sets: 'took-rib',
      },
      {
        text: 'Bury what is left of your own dead here. They would have wanted the company.',
        outcome: 'Buried your own dead at the Bones.',
        piece: 'bones',
        gain: byId('double-crew'),
        sets: 'buried-own',
        requires: 'killed-wreck',
      },
    ],
  },
}

function byId(id: string) {
  const card = CARDS.find((c) => c.id === id)
  if (!card) throw new Error(`event references unknown card: ${id}`)
  return card
}

export function eventFor(id: string): IslandEvent | undefined {
  return EVENTS[id]
}
