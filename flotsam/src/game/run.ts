import { resolve, STARTING_LOAD, type Card } from './stats'
import { CHART_PIECES, type Island } from './world'

export type Phase = 'intro' | 'sailing' | 'telling' | 'ashore' | 'charted' | 'home' | 'dead'

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
  /** shown as the title when you land */
  title: string
  /** the story telling: what the island is before you set foot on it */
  telling: string
  /** the adventure: what you go ashore and find */
  adventure: string
  choices: Choice[]
}

/** what the run tells the outside world (the HUD and the ship) as it moves along */
export interface RunEvents {
  onDepart(): void
  onTell(event: IslandEvent, island: Island): void
  onAshore(event: IslandEvent, island: Island): void
  onDamage(amount: number): void
  onCharted(): void
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
  /** islands you have landed on */
  visited = new Set<string>()
  /** map pieces: the thing you're actually collecting */
  pieces = new Set<string>()
  /** every choice you've made, in order, for the closing log */
  log: string[] = []
  /** flags set by choices, read by other islands' choices */
  flags = new Set<string>()
  /** what you are carrying on deck, not what you have bolted to it */
  crew = STARTING_LOAD.crew
  passengers = STARTING_LOAD.passengers
  gold = STARTING_LOAD.gold
  provisions = STARTING_LOAD.provisions
  /** seconds spent at the helm, for the closing score */
  sailTime = 0

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

  /** whether you hold enough gold and food to pay what a choice asks */
  canAfford(choice: Choice) {
    return this.gold >= -(choice.goldDelta ?? 0) && this.provisions >= -(choice.provisionsDelta ?? 0)
  }

  /** stow something fished out of the water */
  addCargo(provisions = 0, gold = 0) {
    this.provisions += provisions
    this.gold += gold
  }

  /** the crew eats a day's food. Returns false if there was nothing left to eat */
  eat() {
    if (this.provisions === 0) return false
    this.provisions--
    return true
  }

  /** how many copies of each card are in the deck */
  counts(): Map<Card, number> {
    const counts = new Map<Card, number>()
    for (const card of this.deck) counts.set(card, (counts.get(card) ?? 0) + 1)
    return counts
  }

  /** cast off, at the start or after an event */
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

  /** sail for home with the whole chart in hand. There is no choice to make */
  reachHome() {
    this.phase = 'home'
    this.events.onHome(this.log)
  }

  /** the voyage is over, whether the hull gave out or the crew did */
  sink() {
    this.phase = 'dead'
    this.events.onSunk(this.log)
  }

  /** the player took an option: apply it, then cast off */
  resolve(choice: Choice) {
    // only one choice per landing, and only one you can pay for
    if (this.phase !== 'ashore' || !this.canAfford(choice)) return

    this.log.push(choice.outcome)

    if (choice.gain && !this.deck.includes(choice.gain)) this.deck.push(choice.gain)
    if (choice.lose) this.deck = this.deck.filter((card) => card.id !== choice.lose)
    if (choice.damage) this.events.onDamage(choice.damage)
    if (choice.sets) this.flags.add(choice.sets)
    if (choice.piece) this.pieces.add(choice.piece)

    // nobody can hold "negative" people, so every count stops at zero
    this.crew = Math.max(0, this.crew + (choice.crewDelta ?? 0))
    this.passengers = Math.max(0, this.passengers + (choice.passengersDelta ?? 0))
    this.gold = Math.max(0, this.gold + (choice.goldDelta ?? 0))
    this.provisions = Math.max(0, this.provisions + (choice.provisionsDelta ?? 0))

    // with no crew left to sail her, the voyage is over
    if (this.crew === 0) {
      this.sink()
      return
    }

    // the whole chart in hand means you can go home from where you are
    if (this.pieces.size >= CHART_PIECES) {
      this.phase = 'charted'
      this.events.onCharted()
      return
    }

    this.sail()
  }
}
