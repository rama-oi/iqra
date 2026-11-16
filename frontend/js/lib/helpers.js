import { ICONS } from '../constants/icons.js'

const modulePrefix = 'pb'

export function getPrefix(name) {
  return [modulePrefix, name].join('-')
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch])
}

// <span class="pb-icon"> for a glyph of the icon font (names: constants/icons.js).
// Decorative by default; pass a label when the icon is the only content of a control.
export function icon(name, label) {
  const glyph = ICONS[name]
  if (!glyph) throw new Error(`Unknown icon "${name}"`)
  const a11y = label ? ` role="img" aria-label="${escapeHtml(label)}"` : ' aria-hidden="true"'
  return `<span class="pb-icon"${a11y}>${glyph}</span>`
}
