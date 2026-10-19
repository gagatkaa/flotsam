export interface VoyageResult {
  home: boolean
  pieces: number
  crew: number
  passengers: number
  gold: number
  provisions: number
  hull: number
  /** time spent under sail, in seconds */
  seconds: number
}

export interface ScoreLine {
  label: string
  value: string
  points: number
}

export interface Score {
  total: number
  rating: string
  lines: ScoreLine[]
}

/** a voyage home earns one point per second under par */
const PAR_SECONDS = 240

const HOME_RATINGS: [number, string][] = [
  [1000, 'Legend of the Reef'],
  [800, 'Captain of the Strays'],
  [600, 'Seasoned Sailor'],
  [0, 'Lucky Drifter'],
]

function lostRating(pieces: number) {
  if (pieces >= 3) return 'So Close to Home'
  if (pieces >= 1) return 'Lost with the Chart'
  return 'Lost at Sea'
}

export function scoreVoyage(result: VoyageResult): Score {
  const minutes = Math.floor(result.seconds / 60)
  const seconds = String(Math.floor(result.seconds % 60)).padStart(2, '0')

  const lines: ScoreLine[] = [
    { label: 'map pieces', value: String(result.pieces), points: result.pieces * 100 },
    { label: 'crew', value: String(result.crew), points: result.crew * 50 },
    { label: 'rescued', value: String(result.passengers), points: result.passengers * 75 },
    { label: 'gold', value: String(result.gold), points: result.gold * 2 },
    { label: 'food', value: String(result.provisions), points: result.provisions * 10 },
    { label: 'health', value: String(Math.round(result.hull)), points: Math.round(result.hull) * 2 },
  ]
  if (result.home) {
    lines.push({
      label: 'time',
      value: `${minutes}:${seconds}`,
      points: Math.max(0, Math.round(PAR_SECONDS - result.seconds)),
    })
  }

  const total = lines.reduce((sum, line) => sum + line.points, 0)
  const rating = result.home
    ? HOME_RATINGS.find(([threshold]) => total >= threshold)![1]
    : lostRating(result.pieces)

  return { total, rating, lines }
}

const BEST_KEY = 'flotsam-best-score'

/** save this score if it is the best on this browser */
export function recordBest(total: number): { best: number; isNew: boolean } {
  try {
    const previous = Number(localStorage.getItem(BEST_KEY)) || 0
    if (total > previous) localStorage.setItem(BEST_KEY, String(total))
    return { best: Math.max(total, previous), isNew: total > previous }
  } catch {
    // storage can be blocked, e.g. in private windows
    return { best: total, isNew: false }
  }
}
