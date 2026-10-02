import { resolve, type Card } from './stats'
import type { Island } from './world'

export type Phase = 'intro' | 'sailing' | 'telling' | 'ashore' | 'home' | 'dead'

export interface Choice {
  /** the line the player clicks */
  text: string
  /** shown as consequences once it's picked */
  outcome: string
  /** a card you walk away with */
  gain?: Card
  /** a card you lose. removed from the deck if you hold it */
  lose?: string
  /** hull damage, before frailty */
  damage?: number
  /** the chart piece this choice tears loose. omit it and the island gives nothing */
  piece?: string
  /** set a flag another island can read */
  sets?: string
  /** require a flag to even be offered */
  requires?: string
  /** hide the choice once this flag is set */
  blockedBy?: string
}

export interface IslandEvent {
  island: string
  /** shown as the title when you land */
  title: string
  /** the story telling: what the island is before you set foot on it */
  telling: string
  /** the adventure: what you go ashore and find */
  adventure: string
  choices: Choice[]
}

export interface RunEvents {
  onDepart(): void
  onTell(event: IslandEvent, island: Island): void
  onAshore(event: IslandEvent, island: Island): void
  onDepart(): void
  onDamage(amount: number): void
  onHome(log: string[]): void
  onSunk(log: string[]): void
}

/**
 * The run. There is no destination to choose: you put the tiller where you
 * like and you arrive at whatever you arrive at. Progress is therefore "where
 * have you been" rather than a counter, and every decision writes a flag that
 * other islands read back.
 */
export class Run {
  phase: Phase = 'intro'
  deck: Card[] = []
  /** islands whose event has resolved */
  visited = new Set<string>()
  /** map pieces: the thing you're actually collecting */
  pieces = new Set<string>()
  /** every choice you've made, in order, for the closing log */
  log: string[] = []
  /** flags set by choices, read by other islands' choices */
  flags = new Set<string>()

  private readonly events: RunEvents

  constructor(events: RunEvents) {
    this.events = events
  }

  get stats() {
    return resolve(this.deck)
  }

  counts(): Map<Card, number> {
    const counts = new Map<Card, number>()
    for (const card of this.deck) counts.set(card, (counts.get(card) ?? 0) + 1)
    return counts
  }

  /** cast off after an event */
  sail() {
    this.phase = 'sailing'
    this.events.onDepart()
  }

  /** landed: first the story telling, then the choice */
  land(event: IslandEvent, island: Island) {
    this.phase = 'telling'
    this.visited.add(island.id)
    this.events.onTell(event, island)
  }

  /** read the telling through, now the decision */
  decide(event: IslandEvent, island: Island) {
    this.phase = 'ashore'
    this.events.onAshore(event, island)
  }

  /**
   * Arrived at Homeward with the whole chart. Called directly rather than
   * through resolve(), because Homeward has no choice to make.
   */
  reachHome() {
    this.phase = 'home'
    this.events.onHome(this.log)
  }

  /** the player took an option: apply it, then cast off */
  resolve(choice: Choice) {
    this.log.push(choice.outcome)

    if (choice.gain && !this.deck.includes(choice.gain)) this.deck.push(choice.gain)
    if (choice.lose) this.deck = this.deck.filter((card) => card.id !== choice.lose)
    if (choice.damage) this.events.onDamage(choice.damage)
    if (choice.sets) this.flags.add(choice.sets)

    if (choice.piece) this.pieces.add(choice.piece)

    this.sail()
  }
}