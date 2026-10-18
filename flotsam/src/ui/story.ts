// Builders for the story panels: the opening page, the island scenes, the
// choice cards and the closing log. They only make elements; main.ts decides
// when to show them.

import { cardName } from '../game/cards'
import type { Choice } from '../game/run'
import { CHART_PIECES, ISLAND_SPECS } from '../game/world'

/** the opening page: the situation, the islands, then the keys */
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

/** one page of the log: a title and its paragraphs */
export function sceneBlock(title: string, ...paragraphs: string[]) {
  const block = document.createElement('div')
  block.className = 'scene'
  block.innerHTML = `<h2>${title}</h2>` + paragraphs.map((text) => `<p>${text}</p>`).join('')
  return block
}

/** a button with the given class that runs `onClick` */
export function button(className: string, label: string, onClick: () => void) {
  const element = document.createElement('button')
  element.className = className
  element.textContent = label
  element.addEventListener('click', onClick)
  return element
}

/** the resources a choice changes, as [Choice field, label] */
const DELTAS = [
  ['crewDelta', 'crew'],
  ['passengersDelta', 'rescued'],
  ['goldDelta', 'gold'],
  ['provisionsDelta', 'food'],
] as const

/**
 * A choice as a clickable card. Every choice says what it will hand over and
 * what it will cost, in prose and then in hard numbers, so the decision is
 * never a guess.
 */
export function choiceCard(choice: Choice, onPick: () => void) {
  const gains: string[] = []
  const costs: string[] = []

  if (choice.piece) gains.push('a piece of the map')
  if (choice.gain) gains.push(choice.gain.name)
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

  const mods = [
    ...gains.map((gain) => `<span class="gain">+ ${gain}</span>`),
    ...costs.map((cost) => `<span class="cost">− ${cost}</span>`),
  ].join('')

  const card = button('card', '', onPick)
  card.innerHTML =
    `<span class="text">${choice.text}</span>` +
    `<span class="preview">${choice.preview}</span>` +
    (mods ? `<span class="mods">${mods}</span>` : '')
  return card
}

/** every choice made on the voyage, in order */
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
