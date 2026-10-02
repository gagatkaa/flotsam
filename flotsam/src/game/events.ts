import { CARDS } from './cards'
import type { IslandEvent } from './run'

function byId(id: string) {
  const card = CARDS.find((c) => c.id === id)
  if (!card) throw new Error(`event references unknown card: ${id}`)
  return card
}

export const EVENTS: Record<string, IslandEvent> = {
  wreck: {
    island: 'wreck',
    title: 'The Wreck',
    telling:
      'You find her at first light, bow under and stern up. Thirty feet of her are still dry. Somebody lashed the captain to his own wheel before the water came, and the lashing has held.',
    adventure:
      'You bring her alongside the lee side and go over the rail. The chart case above the table is still lashed shut. The hold is split open.',
    choices: [
      {
        text: 'Go below. Risk the flooding hold to strip her timbers.',
        preview:
          'You go down into the hold while she is still flooding. Her deep keel timbers are better than yours, so you pry one loose. The water follows you in and costs you 12 hull. You come up with the chart.',
        outcome: 'Went below the wreck, stripped a deep keel, paid 12 hull for it.',
        piece: 'wreck',
        gain: byId('keel'),
        damage: 12,
      },
      {
        text: 'Free the captain. Cut him loose and take him aboard.',
        preview:
          'You cut the lashing. He is half dead, but he is a sailor. He knows the lines and knows where she stowed her powder. You lose 8 hull pulling him clear, gain a hand, and take the chart.',
        outcome: 'Cut the captain loose, took him aboard, lost 8 hull.',
        piece: 'wreck',
        gain: byId('blackpowder'),
        damage: 8,
        crewDelta: 1,
      },
      {
        text: 'Leave her. Take only the chart and what is already loose.',
        preview:
          'You take nothing but the chart off the wheelhouse door and some running rigging coiled where it stayed dry. No one hurt, no one bought, and you take the chart.',
        outcome: 'Left the wreck alone, took her chart and spare rigging.',
        piece: 'wreck',
        gain: byId('rigging'),
      },
    ],
  },

  gallows: {
    island: 'gallows',
    title: 'Gallows Cay',
    telling:
      'It is low, flat and green, and the only thing standing on it is a post with a chart nailed to it. The post is a gallows.',
    adventure:
      'Four words are scratched beneath it: they hang for this here. The chart is half coastline, and half of that is yours.',
    choices: [
      {
        text: 'Take the chart and the spy-glass that came with it.',
        preview: 'You take the chart down and the spy-glass hung beside it. From here on you can read the bearing to every island from your own deck.',
        outcome: "Took the chart and the Navigator's glass off the gallows.",
        piece: 'gallows',
        gain: byId('glass'),
      },
      {
        text: 'Leave it. You are not the only lost crew out here.',
        preview: 'You leave the chart where it hung and take the iron off the post instead. Something here knows you passed, and knows you left.',
        outcome: 'Left the chart where it hung, took iron for the helm.',
        piece: 'gallows',
        gain: byId('helm'),
      },
      {
        text: 'Take the chart and leave your own name nailed under it.',
        preview: 'You nail your own name under the chart so whoever comes looking knows who has it. The powder off the post comes away with you.',
        outcome: 'Took the chart, left a name, took powder.',
        piece: 'gallows',
        gain: byId('blackpowder'),
        sets: 'named-yourself',
      },
    ],
  },

  kitchen: {
    island: 'kitchen',
    title: 'Kitchen Rock',
    telling:
      'Low, black and flat on top, and from a long way off it does look like the back of a stove with something still in it. The smell of wood smoke means somebody is keeping a fire going.',
    adventure:
      'You get as far as the ledge before a woman stands up out of the scrub with a long hook in her hand. Behind her, a pit, a pot, and people keeping a fire.',
    choices: [
      {
        text: 'Trade with them. Meat for a share of the chart.',
        preview: 'You hand over the meat you have. She breaks a corner off the chart for you and throws in a length of her hull plating. Fair trade, and you take the chart.',
        outcome: 'Traded meat for the Kitchen Rock chart and plating.',
        piece: 'kitchen',
        gain: byId('plating'),
      },
      {
        text: 'Ask for water and nothing else. Give them nothing.',
        preview: 'You ask for water and hand over nothing. She gives it to you anyway, and the pumps off her fire, and the chart.',
        outcome: 'Asked for water, took Kitchen Rock chart and pumps.',
        piece: 'kitchen',
        gain: byId('pumps'),
      },
      {
        text: 'Take the pot and go. Leave them the fire.',
        preview: 'The hook catches you on the ledge on the way down and costs you 8 hull. The fire is the thing they needed, and it is still burning behind you when you reach the water, so they let you have the chart to go with it.',
        outcome: 'Took the pot, paid 8 hull for the Kitchen Rock chart.',
        piece: 'kitchen',
        damage: 8,
      },
    ],
  },

  bones: {
    island: 'bones',
    title: 'The Bones',
    telling:
      'The rock is white, and the beach is not entirely sand. It is very regular. It is stacked. Something out here arranged this.',
    adventure:
      'Ribs, in a row, big as your boat, going up into the cliff face where they disappear into black rock. In the middle is a roll of oilcloth with a chart in it.',
    choices: [
      {
        text: 'Take the chart and re-lay the bones the way you found them.',
        preview: 'You put the chart in your coat and put the bones back the way you found them, which takes the whole night. The iron off the post makes your helm answer faster. You take the chart.',
        outcome: 'Took the chart from the Bones, re-laid them, upgraded the helm.',
        piece: 'bones',
        gain: byId('helm'),
      },
      {
        text: 'Take a rib for the boat. The hull is open and you are days out.',
        preview: 'You take a rib and line the split in the hull with it. It holds. It just hurts, and costs you 12 hull to fit. You take the chart.',
        outcome: 'Took a rib from the Bones, patched hull, took the chart.',
        piece: 'bones',
        gain: byId('tight-fit'),
        damage: 12,
      },
      {
        text: "Take the oilcloth. The bones were somebody's before they were a chart.",
        preview: 'You lift the roll out of the middle of the arrangement. Something in the cave above you objects, and finding out how costs you 8 hull. The chart is yours.',
        outcome: 'Took the chart from the Bones, paid 8 hull.',
        piece: 'bones',
        damage: 8,
      },
    ],
  },
}
export function eventFor(id: string): IslandEvent | undefined {
  return EVENTS[id]
}
