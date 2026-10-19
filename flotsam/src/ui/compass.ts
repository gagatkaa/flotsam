const COMPASS_HALF = 130
const CARDINALS = ['N', 'E', 'S', 'W']
const HEADING_WORDS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export interface CompassMark {
  name: string
  bearing: number
  range: number
  spent: boolean
  target: boolean
  tint: string
}

export interface CompassElements {
  tape: HTMLElement
  head: HTMLElement
  word: HTMLElement
}

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
    const offset = ((mark.bearing - heading + 540) % 360) - 180
    if (Math.abs(offset) > COMPASS_HALF + 5) continue

    const tinted = !mark.spent && !mark.target
    const style = `left:${xFor(offset)}px${tinted ? `;color:${mark.tint}` : ''}`
    islands.push(
      `<span class="island ${mark.spent ? 'spent' : 'open'}${mark.target ? ' target' : ''}" style="${style}">` +
        `<em>${mark.name} ${mark.range}m</em><i></i></span>`,
    )
  }

  tape.innerHTML = ticks.join('') + islands.join('')
  head.textContent = `${String(Math.round(heading) % 360).padStart(3, '0')}°`
  word.textContent = HEADING_WORDS[Math.round(heading / 45) % 8]
}
