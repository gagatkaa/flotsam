// The heading-up compass. The notch is where you are looking, so reaching an
// island means "steer until its mark sits under the notch". Cardinal letters and
// degree ticks give it a fixed frame to steer against.

/** how many degrees of the horizon the compass shows on each side of the bow */
const COMPASS_HALF = 130
const CARDINALS = ['N', 'E', 'S', 'W']
const HEADING_WORDS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** an island as the compass shows it */
export interface CompassMark {
  name: string
  bearing: number
  range: number
  /** already landed on, so shown dimmed */
  spent: boolean
  /** the nearest island still to visit, shown in the guiding green */
  target: boolean
  /** the island's own colour as CSS */
  tint: string
}

export interface CompassElements {
  tape: HTMLElement
  head: HTMLElement
  word: HTMLElement
}

/** degrees in 0..360 */
const wrap360 = (degrees: number) => ((degrees % 360) + 360) % 360

export function renderCompass({ tape, head, word }: CompassElements, heading: number, marks: CompassMark[]) {
  const width = tape.clientWidth || 320
  const pxPerDeg = width / (COMPASS_HALF * 2)
  const xFor = (offset: number) => Math.round(width / 2 + offset * pxPerDeg)

  const ticks: string[] = []
  const start = Math.ceil((heading - COMPASS_HALF) / 15) * 15
  for (let deg = start; deg < heading + COMPASS_HALF; deg += 15) {
    const normalized = wrap360(deg)
    const major = normalized % 45 === 0
    const cardinal = normalized % 90 === 0 ? CARDINALS[normalized / 90] : ''
    const label = cardinal || (major ? String(normalized).padStart(3, '0') : '')
    ticks.push(
      `<i class="tick${major ? ' major' : ''}${cardinal ? ' cardinal' : ''}" style="left:${xFor(deg - heading)}px">` +
        (label ? `<b>${label}</b>` : '') +
        `</i>`,
    )
  }

  const islands: string[] = []
  for (const mark of marks) {
    // where the island sits relative to the bow, -180..180
    const offset = ((mark.bearing - heading + 540) % 360) - 180
    if (Math.abs(offset) > COMPASS_HALF + 5) continue

    // open islands read in their own colour; the guiding green of the target
    // and the dimming of spent ones are louder, so they win
    const tinted = !mark.spent && !mark.target
    const style = `left:${xFor(offset)}px${tinted ? `;color:${mark.tint}` : ''}`
    islands.push(
      `<span class="island ${mark.spent ? 'spent' : 'open'}${mark.target ? ' target' : ''}" style="${style}">` +
        `<em>${mark.name} ${mark.range}m</em><i></i></span>`,
    )
  }

  tape.innerHTML = ticks.join('') + islands.join('')
  head.textContent = `${String(Math.round(heading)).padStart(3, '0')}°`
  word.textContent = HEADING_WORDS[Math.round(heading / 45) % 8]
}
