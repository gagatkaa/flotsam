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
      'You catch her at first light, bow down, stern still fighting for air. She has been dead a long time, but the captain is still at his wheel — he lashed himself to it, so he would go over standing up, and the lashing held.',
    adventure:
      'You come alongside her lee side and climb over the rail. The chart case is still lashed to the cabin table, sealed against the sea. The hold is split open, and the water in it watches you come.',
    choices: [
      {
        text: 'Go below. Risk the flooding hold to strip her timbers.',
        preview:
          'You go down while she still breathes — in with each wave, out with the next. Her keel timber is deeper and truer than yours, so you work one loose and climb out just ahead of the closing water. It costs you 12 health, and you have the chart.',
        outcome: 'Went below the wreck, pried out a deep keel, paid 12 health.',
        piece: 'wreck',
        gain: byId('keel'),
        damage: 12,
      },
      {
        text: 'Free the captain. Cut him loose and take him aboard.',
        preview:
          'You cut the lashing. He is half gone, but he is a sailor, and while you pull him clear he tells you where she kept her powder. It costs you 8 health. You gain a hand, and the chart comes too.',
        outcome: 'Cut the captain loose, took him aboard, lost 8 health.',
        piece: 'wreck',
        gain: byId('blackpowder'),
        damage: 8,
        crewDelta: 1,
      },
      {
        text: 'Leave her. Take only the chart and what is already loose.',
        preview:
          'You take the chart from the wheelhouse door and some rope that stayed dry in its coil. A clean job — no one hurt, nothing owed, and the chart is yours.',
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
      'It is low and flat and green, and the only thing standing on it is a post. A chart is nailed to the post. The post is a gallows, and you know it the moment you see it.',
    adventure:
      'Four words are scratched into the wood beneath it: they hang for this here. You take the chart down, and half the coastline on it is drawn in a hand you recognize — your own.',
    choices: [
      {
        text: 'Take the chart and the spy-glass that came with it.',
        preview:
          'You take the chart down, and the spy-glass hung beside it. From your own deck now you can read the bearing to every island, plain as day.',
        outcome: "Took the chart and the Navigator's glass off the gallows.",
        piece: 'gallows',
        gain: byId('glass'),
      },
      {
        text: 'Leave it. You are not the only lost crew out here.',
        preview:
          'You leave the chart where it hangs and take the iron from the post instead. Something out here marks that you came — and that you let it be.',
        outcome: 'Left the chart where it hung, took iron for the helm.',
        piece: 'gallows',
        gain: byId('helm'),
      },
      {
        text: 'Take the chart and leave your own name nailed under it.',
        preview:
          'You nail your name beneath the chart so the next lost crew knows who took it. The powder stashed at the foot of the post comes with you.',
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
      'Low, black and flat on top, and from a mile off it genuinely looks like a bread oven with something still baking in it. There is smoke from a fire somebody is careful to keep going.',
    adventure:
      'You get to the ledge, and a woman stands up out of the scrub with a long hook in her hand. Behind her: a fire pit, a cooking pot, and a dozen people who have clearly decided you are interesting.',
    choices: [
      {
        text: 'Trade with them. Meat for a share of the chart.',
        preview:
          'You hand over what meat you have. She breaks a corner off the chart for you, then throws in a length of her own hull plating. A fair trade, even by your ledger.',
        outcome: 'Traded meat for the Kitchen Rock chart and plating.',
        piece: 'kitchen',
        gain: byId('plating'),
      },
      {
        text: 'Ask for water and nothing else. Give them nothing.',
        preview:
          'You ask for water, nothing more. She gives it anyway — then the pumps from by the fire, then the chart. It is the kindness that makes you uneasy.',
        outcome: 'Asked for water, took the Kitchen Rock chart and pumps.',
        piece: 'kitchen',
        gain: byId('pumps'),
      },
      {
        text: 'Take the pot and go. Leave them the fire.',
        preview:
          'Her hook catches you at the ledge going down — 8 health you will not get back. But the fire is what they cared about, and it is still burning when you reach the water, so they let the chart go with you.',
        outcome: 'Took the pot, paid 8 health for the Kitchen Rock chart.',
        piece: 'kitchen',
        damage: 8,
      },
    ],
  },

  bones: {
    island: 'bones',
    title: 'The Bones',
    telling:
      'The island is white rock, and the beach is not entirely sand. The beach is stacked. It is arranged, row after row, and something out here did it on purpose.',
    adventure:
      'Ribs, big as your boat, in a row up the cliff until they disappear into black rock. Something enormous died here in a ceremony whose shape you can still read. In the centre sits a roll of oilcloth — and a chart.',
    choices: [
      {
        text: 'Take the chart and re-lay the bones the way you found them.',
        preview:
          'You take the chart, then spend the whole night setting the bones back exactly as you found them. You leave the place tidier than you found it, and the iron from the post makes your helm answer faster.',
        outcome: 'Took the chart from the Bones, re-laid them, upgraded the helm.',
        piece: 'bones',
        gain: byId('helm'),
      },
      {
        text: 'Take a rib for the boat. The hull is open and you are days out.',
        preview:
          'You cut a rib loose and work it into the split in your hull. It holds — but it costs you 12 health to fit, and the rib feels like it knows it has been taken.',
        outcome: 'Took a rib from the Bones, patched the hull, took the chart.',
        piece: 'bones',
        gain: byId('tight-fit'),
        damage: 12,
      },
      {
        text: "Take the oilcloth. The bones were somebody's before they were a chart.",
        preview:
          'You lift the roll from the centre of the ring. Something in the cave above objects — out loud, with rocks — and finding out how costs you 8 health. The chart is yours.',
        outcome: 'Took the chart from the Bones, paid 8 health.',
        piece: 'bones',
        damage: 8,
      },
    ],
  },
}
export function eventFor(id: string): IslandEvent | undefined {
  return EVENTS[id]
}