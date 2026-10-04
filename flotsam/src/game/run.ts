import { resolve, type Card } from './stats'
import type { Island } from './world'

export type Phase = 'intro' | 'sailing' | 'telling' | 'ashore' | 'home' | 'dead'

export interface Choice {
  /** the line the player clicks */
  text: string
  /** what this choice will do or hand you, in the player's own words. shown on
   * the card before it is picked, so nothing is ever a surprise */
  preview: string
  /** the past-tense log line added to the voyage log once it is picked */
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

  /** change to the crew (positive = you find/take a hand, negative = you lose one) */
  crewDelta?: number
  /** people you take aboard who do not work the sheets */
  passengersDelta?: number
  /** coin, plate, or valuables you take */
  goldDelta?: number
  /** food gained or lost */
  provisionsDelta?: number
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
  /** what you are carrying on deck, not what you have bolted to it */
  crew = 3
  passengers = 0
  gold = 0
  provisions = 8

  private readonly events: RunEvents

  constructor(events: RunEvents) {
    this.events = events
  }

  get stats() {
    return resolve(this.deck, {
      crew: this.crew,
      passengers: this.passengers,
      gold: this.gold,
      provisions: this.provisions,
    })
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

    if (choice.crewDelta !== undefined) this.crew += choice.crewDelta
    if (choice.passengersDelta !== undefined) this.passengers += choice.passengersDelta
    if (choice.goldDelta !== undefined) this.gold += choice.goldDelta
    if (choice.provisionsDelta !== undefined) this.provisions += choice.provisionsDelta

    // do not drop below zero. nobody can hold "negative" people
    if (this.crew < 0) this.crew = 0
    if (this.passengers < 0) this.passengers = 0
    if (this.gold < 0) this.gold = 0
    if (this.provisions < 0) this.provisions = 0

    // if there is no crew left to sail her, the voyage is over
    if (this.crew <= 0 && this.phase !== 'dead') {
      this.phase = 'dead'
      this.events.onSunk(this.log)
      return
    }

    this.sail()
  }
}