// Builders for the story panels. They only make elements; main.ts decides when to show them.

import { cardName } from '../game/cards'
import type { Choice } from '../game/run'
import type { Score } from '../game/score'
import { CHART_PIECES, ISLAND_SPECS } from '../game/world'

export function introSheet() {
  const islands = ISLAND_SPECS.map(
    (spec, index) =>
      `<li${index === ISLAND_SPECS.length - 1 ? ' class="last"' : ''}>` +
      `<b>${spec.name}</b><span>${spec.teaser}</span></li>`,
  ).join('')

  const sheet = document.createElement('div')
  sheet.className = 'prologue'
  sheet.innerHTML = `
    <p class="eyebrow">a short trip</p>
    <h1>Flotsam</h1>
    <div class="lede">
      <p>Eleven days lost, and home is torn into ${CHART_PIECES} pieces — each one
      waiting on an island. Sail to whichever you can see, and decide what it is
      worth to you when you get there.</p>
      <p>Scoop up what floats between the islands, and watch the larder: the
      crew eats as you sail.</p>
    </div>
    <ol class="manifest">${islands}</ol>
    <div class="key-groups">
      <div class="key-group">
        <h4>movement</h4>
        <div class="key"><b>W</b> speed up</div>
        <div class="key"><b>S</b> slow down</div>
        <div class="key"><b>A</b><b>D</b> steer</div>
        <div class="key"><b>Mouse</b> look</div>
      </div>
      <div class="key-group">
        <h4>actions</h4>
        <div class="key"><b>E</b> go ashore</div>
        <div class="key"><b>Esc</b> release cursor</div>
      </div>
    </div>`
  return sheet
}

export function seasickWarning() {
  const sheet = document.createElement('div')
  sheet.className = 'prologue warning'
  sheet.innerHTML = `
    <p class="eyebrow">before you cast off</p>
    <h1>Mind the swell</h1>
    <div class="lede">
      <p>Your view rides the deck of a small boat, so it rolls and pitches with
      every wave, and the sea gets rougher the longer you are out there.</p>
      <p><strong>If you start to feel dizzy, sick or uncomfortable, stop playing
      and take a break.</strong> Press <b>Esc</b> to pause at any time.</p>
    </div>`
  return sheet
}

export function sceneBlock(title: string, ...paragraphs: string[]) {
  const block = document.createElement('div')
  block.className = 'scene'
  block.innerHTML = `<h2>${title}</h2>` + paragraphs.map((text) => `<p>${text}</p>`).join('')
  return block
}

export function button(className: string, label: string, onClick: () => void) {
  const element = document.createElement('button')
  element.className = className
  element.textContent = label
  element.addEventListener('click', onClick)
  return element
}

const DELTAS = [
  ['crewDelta', 'crew'],
  ['passengersDelta', 'rescued'],
  ['goldDelta', 'gold'],
  ['provisionsDelta', 'food'],
] as const

/**
 * A choice as a clickable card, listing exactly what it gives and costs.
 * `held` means its card is already on board, so it would add nothing.
 */
export function choiceCard(choice: Choice, affordable: boolean, held: boolean, onPick: () => void) {
  const gains: string[] = []
  const costs: string[] = []

  if (choice.piece) gains.push('a piece of the map')
  if (choice.gain && !held) gains.push(choice.gain.name)
  for (const [field, label] of DELTAS) {
    const amount = choice[field] ?? 0
    if (amount > 0) gains.push(`${amount} ${label}`)
  }

  for (const [field, label] of DELTAS) {
    const amount = choice[field] ?? 0
    if (amount < 0) costs.push(`${-amount} ${label}`)
  }
  if (choice.lose) costs.push(cardName(choice.lose))
  if (choice.damage) costs.push(`${choice.damage} health`)

  let mods = [
    ...gains.map((gain) => `<span class="gain">+ ${gain}</span>`),
    ...costs.map((cost) => `<span class="cost">− ${cost}</span>`),
  ].join('')
  if (choice.gain && held) mods += `<span class="cost">${choice.gain.name} already fitted</span>`

  const card = button('card', '', onPick)
  // an unaffordable choice stays visible, so you can see what you are missing
  if (!affordable) {
    card.disabled = true
    mods += '<span class="cost">not enough to pay</span>'
  }
  card.innerHTML =
    `<span class="text">${choice.text}</span>` +
    `<span class="preview">${choice.preview}</span>` +
    (mods ? `<span class="mods">${mods}</span>` : '')
  return card
}

export function voyageLog(log: string[]) {
  const list = document.createElement('ol')
  list.id = 'log'
  for (const line of log) {
    const item = document.createElement('li')
    item.textContent = line
    list.appendChild(item)
  }
  return list
}

export function scoreSheet(score: Score, best: { best: number; isNew: boolean }) {
  const lines = score.lines
    .map((line) => `<li><span>${line.label}</span><b>${line.value}</b><i>+${line.points}</i></li>`)
    .join('')

  const sheet = document.createElement('div')
  sheet.className = 'tally'
  sheet.innerHTML =
    `<div class="rating">${score.rating}</div>` +
    `<div class="total"><b>${score.total}</b> points</div>` +
    `<div class="best">${best.isNew ? 'a new best' : `best ${best.best}`}</div>` +
    `<ul>${lines}</ul>`
  return sheet
}
