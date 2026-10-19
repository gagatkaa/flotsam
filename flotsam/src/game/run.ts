import { resolve, STARTING_LOAD, type Card } from './stats'
import { CHART_PIECES, type Island } from './world'

export type Phase = 'intro' | 'sailing' | 'telling' | 'ashore' | 'charted' | 'home' | 'dead'

export interface Choice {
  text: string
  /** shown on the card before it is picked */
  preview: string
  /** the line added to the voyage log once it is picked */
  outcome: string
  gain?: Card
  /** id of a card to remove from the deck */
  lose?: string
  /** hull damage, before frailty */
  damage?: number
  /** the chart piece this choice gives; omit it and the island gives nothing */
  piece?: string
  /** a flag other islands can read */
  sets?: string
  /** only offered once this flag is set */
  requires?: string
  /** hidden once this flag is set */
  blockedBy?: string

  crewDelta?: number
  passengersDelta?: number
  goldDelta?: number
  provisionsDelta?: number
}

export interface IslandEvent {
  title: string
  /** what the island is, before you set foot on it */
  telling: string
  /** what you find ashore */
  adventure: string
  choices: Choice[]
}

export interface RunEvents {
  onDepart(): void
  onTell(event: IslandEvent, island: Island): void
  onAshore(event: IslandEvent, island: Island): void
  onVisited(island: Island): void
  /** returns whether the boat is still afloat */
  onDamage(amount: number): boolean
  onCharted(): void
  onHome(log: string[]): void
  onSunk(log: string[]): void
}

export class Run {
  phase: Phase = 'intro'
  deck: Card[] = []
  visited = new Set<string>()
  pieces = new Set<string>()
  log: string[] = []
  flags = new Set<string>()
  crew = STARTING_LOAD.crew
  passengers = STARTING_LOAD.passengers
  gold = STARTING_LOAD.gold
  provisions = STARTING_LOAD.provisions
  /** seconds spent at the helm, for the closing score */
  sailTime = 0

  /** the island you are standing on, between landing and choosing */
  private ashoreAt: Island | null = null

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

  canAfford(choice: Choice) {
    return this.gold >= -(choice.goldDelta ?? 0) && this.provisions >= -(choice.provisionsDelta ?? 0)
  }

  addCargo(provisions = 0, gold = 0) {
    this.provisions += provisions
    this.gold += gold
  }

  /** returns false if there was nothing left to eat */
  eat() {
    if (this.provisions === 0) return false
    this.provisions--
    return true
  }

  counts(): Map<Card, number> {
    const counts = new Map<Card, number>()
    for (const card of this.deck) counts.set(card, (counts.get(card) ?? 0) + 1)
    return counts
  }

  sail() {
    this.phase = 'sailing'
    this.events.onDepart()
  }

  land(event: IslandEvent, island: Island) {
    this.phase = 'telling'
    this.ashoreAt = island
    this.events.onTell(event, island)
  }

  /** back to the boat without choosing; the island keeps its story for later */
  leave() {
    if (this.phase !== 'telling' && this.phase !== 'ashore') return
    this.ashoreAt = null
    this.sail()
  }

  decide(event: IslandEvent, island: Island) {
    if (this.phase !== 'telling') return
    this.phase = 'ashore'
    this.events.onAshore(event, island)
  }

  reachHome() {
    if (this.phase !== 'charted') return
    this.phase = 'home'
    this.events.onHome(this.log)
  }

  sink() {
    this.phase = 'dead'
    this.events.onSunk(this.log)
  }

  resolve(choice: Choice) {
    const island = this.ashoreAt
    if (this.phase !== 'ashore' || !island || !this.canAfford(choice)) return

    this.ashoreAt = null
    this.visited.add(island.id)
    this.events.onVisited(island)

    this.log.push(choice.outcome)

    if (choice.gain && !this.deck.includes(choice.gain)) this.deck.push(choice.gain)
    if (choice.lose) this.deck = this.deck.filter((card) => card.id !== choice.lose)
    const afloat = choice.damage ? this.events.onDamage(choice.damage) : true
    if (choice.sets) this.flags.add(choice.sets)
    if (choice.piece) this.pieces.add(choice.piece)

    this.crew = Math.max(0, this.crew + (choice.crewDelta ?? 0))
    this.passengers = Math.max(0, this.passengers + (choice.passengersDelta ?? 0))
    this.gold = Math.max(0, this.gold + (choice.goldDelta ?? 0))
    this.provisions = Math.max(0, this.provisions + (choice.provisionsDelta ?? 0))

    // a hull that gave out or nobody left to sail her
    if (!afloat || this.crew === 0) {
      this.sink()
      return
    }

    if (this.pieces.size >= CHART_PIECES) {
      this.phase = 'charted'
      this.events.onCharted()
      return
    }

    this.sail()
  }
}
