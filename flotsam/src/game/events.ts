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
        text: 'Take the chart. The sooner you are home the fewer people find out.',
        outcome: 'Took the chart off the gallows.',
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

  garden: {
    island: 'garden',
    title: 'The Garden',
    telling:
      'Green. Actual green, in the middle of all this white water, and the crew ' +
      'stop talking before you have said anything. You can see it is not wild. ' +
      'There are rows. Somebody has been standing in these rows, turning ground ' +
      'over, for a long time and by themselves.',
    adventure:
      'The rows go right up to a stone hut with a door that has been repaired four ' +
      'or five separate times. Inside: a table, a chart with most of it torn off, ' +
      'and a bed with somebody in it who is not dead and would rather you left. ' +
      'They have been here alone a long time and they have clearly been eating what ' +
      'the garden gives. There is fruit on the table, cut open, for you.',
    choices: [
      {
        text: 'Trade seeds for a share of the chart. Plant them and leave.',
        outcome: 'Traded seeds at the Garden for a share of the chart.',
        piece: 'garden',
        gain: byId('buoyancy'),
        sets: 'traded-garden',
      },
      {
        text: 'Take the whole chart off the table. Let them keep the fruit.',
        outcome: "Took the Garden's chart off the table. Left them the fruit.",
        piece: 'garden',
        damage: 10,
        sets: 'robbed-garden',
      },
      {
        text: 'Eat what is on the table first. Ask questions after.',
        outcome: "Ate the Garden's food and took the chart.",
        piece: 'garden',
        gain: byId('keel'),
        damage: 14,
        sets: 'ate-first',
      },
      {
        text: 'Show them your half of the wreck chart. Compare the two.',
        outcome: 'Compared notes with the Garden and found they agreed.',
        piece: 'garden',
        gain: byId('glass'),
        sets: 'compared-notes',
        requires: 'robbed-wreck',
      },
    ],
  },

  bell: {
    island: 'bell',
    title: 'Bell Island',
    telling:
      'A tower with no bell in it, which is not a thing you build. The tower is ' +
      'good work, proper stone, four storeys, and the top of it is open to the ' +
      'sky. Nothing in it. And yet something in the tower is making a sound, low ' +
      'and slow, every eleven seconds or so, like something enormous breathing.',
    adventure:
      'You go up. On the second landing there is a winch, and a drum, and a ' +
      'length of chain running up through the floor to the open top. Every eleven ' +
      'seconds the drum turns and pays out chain. On the fourth floor you find the ' +
      'other end of it: a bell the size of your boat, green with verdigris, and ' +
      'the note it makes carries a very long way. Somebody built this to be heard ' +
      'from offshore.',
    choices: [
      {
        text: 'Take the chain off the drum. Silence it.',
        outcome: 'Took the chain off the Bell Island drum. It stopped.',
        piece: 'bell',
        gain: byId('ballast'),
        sets: 'silenced-bell',
      },
      {
        text: 'Ring it. Properly. Let whatever is listening know you are here.',
        outcome: 'Rang the bell. Let them hear it.',
        piece: 'bell',
        gain: byId('studding'),
        damage: 20,
        sets: 'rang-bell',
      },
      {
        text: 'Take the chart from the winch room and leave the bell alone.',
        outcome: 'Took the Bell Island chart. Left the bell ringing.',
        piece: 'bell',
        gain: byId('rigging'),
        sets: 'left-bell',
      },
      {
        text: 'Cut the chain and drop the bell into the sea.',
        outcome: 'Cut the chain and dropped the bell.',
        piece: 'bell',
        damage: 12,
        sets: 'drowned-bell',
        requires: 'killed-wreck',
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
