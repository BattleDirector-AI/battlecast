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

/** Lap TIME (seconds) -> 'M:SS.mmm' (e.g. 90.912 -> '1:30.912'); sub-minute laps
 *  render as bare seconds ('58.204'). Used by the qualifying/sector lower-third. */
export function fmtLapTime(seconds) {
  if (seconds == null || isNaN(seconds) || Number(seconds) < 0) return '—'
  const s = Number(seconds)
  const mins = Math.floor(s / 60)
  const secs = s - mins * 60
  if (mins === 0) return secs.toFixed(3)
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`
}

/** Sector time (seconds) -> three-decimal string, e.g. 28.401 -> '28.401'. */
export function fmtSector(seconds) {
  if (seconds == null || isNaN(seconds)) return '—'
  return Number(seconds).toFixed(3)
}

/** Signed delta-to-target (seconds) -> '+0.176' / '-0.234' / '0.000'. */
export function fmtDelta(seconds) {
  if (seconds == null || isNaN(seconds)) return '—'
  const s = Number(seconds)
  return s > 0 ? `+${s.toFixed(3)}` : s.toFixed(3)
}

/** Position delta glyph + color. delta>0 gained, <0 lost, 0/undef steady. */
export function deltaGlyph(delta) {
  if (delta == null || delta === 0) return { glyph: '–', color: 'var(--bc-text-3)' }
  if (delta > 0) return { glyph: '▲', color: 'var(--bc-up)' }
  return { glyph: '▼', color: 'var(--bc-down)' }
}
