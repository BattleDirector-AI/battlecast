/* Battlecast — display formatters (terse broadcast style). */

/** Driver name -> 'Initial. SURNAME'. Accepts already-formatted strings too. */
export function fmtName(name) {
  if (!name) return ''
  const s = String(name).trim()
  if (s.includes('.')) return s
  const parts = s.split(/\s+/)
  if (parts.length === 1) return parts[0]
  const initial = parts[0][0]
  const surname = parts.slice(1).join(' ')
  return `${initial}. ${surname}`
}

/** Seconds gap -> signed one-decimal string, or 'LEADER' for the leader. */
export function fmtGap(seconds, { leader = false, sign = '+' } = {}) {
  if (leader) return 'LEADER'
  if (seconds == null || isNaN(seconds)) return '—'
  if (seconds <= 0) return 'LEADER'
  return `${sign}${seconds.toFixed(1)}`
}

/** Interval gap (to car ahead) — always '+x.x', or 'LEADER'. */
export function fmtInterval(seconds, { leader = false } = {}) {
  return fmtGap(seconds, { leader })
}

/** Lap readout -> 'L 24/58'. */
export function fmtLap(lap, total) {
  if (lap == null) return ''
  return total ? `L ${lap}/${total}` : `L ${lap}`
}

/** Position delta glyph + color. delta>0 gained, <0 lost, 0/undef steady. */
export function deltaGlyph(delta) {
  if (delta == null || delta === 0) return { glyph: '–', color: 'var(--bc-text-3)' }
  if (delta > 0) return { glyph: '▲', color: 'var(--bc-up)' }
  return { glyph: '▼', color: 'var(--bc-down)' }
}
