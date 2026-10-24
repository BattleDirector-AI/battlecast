/* Info panel — the header string and the line list, pure and DOM-free.
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 76-77, protocol-contract.md rule 23,
 * ADR 0024. `eventHeader(event)` (how/renderer.md) returns the header exactly as rendered, or
 * null when no part holds; `infoLines(infoLinesField, configLines)` returns the panel's line
 * list. The rendered panel is asserted in routes/info/InfoPanel.test.js; this file pins the
 * per-field tables cheaply.
 *
 * The module is loaded through a non-static specifier so a missing module fails each test
 * with a message naming it, rather than failing the whole file at import time.
 */
import { describe, it, expect } from 'vitest'
import fixture from '../../../spec/v1/fixtures/event-info.json'

const MODULE = './infoPanel.js'
async function load(name) {
  let mod
  try {
    mod = await import(/* @vite-ignore */ MODULE)
  } catch (err) {
    throw new Error(`could not load app/src/lib/infoPanel.js: ${String(err?.message).split('\n')[0]}`, {
      cause: err,
    })
  }
  expect(typeof mod[name], `infoPanel.js must export ${name}`).toBe('function')
  return mod[name]
}
const eventHeader = async (event) => (await load('eventHeader'))(event)
const infoLines = async (field, config) => (await load('infoLines'))(field, config)

describe('eventHeader — the header (rule 76)', () => {
  it('joins round, name and track from event-info.json, uppercased, with " · " between', async () => {
    expect(await eventHeader(structuredClone(fixture.event))).toBe('ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS')
  })

  it.each([
    ['name and track only', { name: 'Spa 6 Hours', track: 'Spa-Francorchamps' }, 'SPA 6 HOURS · SPA-FRANCORCHAMPS'],
    ['round and track only', { round: 3, track: 'Spa-Francorchamps' }, 'ROUND 3 · SPA-FRANCORCHAMPS'],
    ['round and name only', { round: 12, name: 'Le Mans' }, 'ROUND 12 · LE MANS'],
    ['round only', { round: 3 }, 'ROUND 3'],
    ['name only', { name: 'Spa 6 Hours' }, 'SPA 6 HOURS'],
    ['track only', { track: 'Monza' }, 'MONZA'],
  ])('leaves out absent parts and their separators: %s', async (_label, event, header) => {
    expect(await eventHeader(event)).toBe(header)
  })

  it('trims each part and keeps the whitespace inside it as sent', async () => {
    expect(await eventHeader({ name: '  Spa  6 Hours ', track: '\tSpa-Francorchamps\n' })).toBe(
      'SPA  6 HOURS · SPA-FRANCORCHAMPS',
    )
  })

  it('uppercases every part, an all-lowercase one included', async () => {
    expect(await eventHeader({ name: 'Imola', track: 'circuito di imola' })).toBe('IMOLA · CIRCUITO DI IMOLA')
  })

  it.each([
    ['0', 0],
    ['negative', -1],
    ['fractional', 2.5],
    ['a numeric string', '3'],
    ['true', true],
    ['null', null],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an array', [3]],
  ])('treats a round that is %s as absent, still reading name and track', async (_label, round) => {
    expect(await eventHeader({ round, name: 'Spa 6 Hours', track: 'Spa-Francorchamps' })).toBe(
      'SPA 6 HOURS · SPA-FRANCORCHAMPS',
    )
  })

  it.each([
    ['blank', '   '],
    ['empty', ''],
    ['a number', 6],
    ['null', null],
    ['an object', { en: 'Spa' }],
  ])('treats a name or track that is %s as absent', async (_label, bad) => {
    expect(await eventHeader({ round: 3, name: bad, track: 'Monza' })).toBe('ROUND 3 · MONZA')
    expect(await eventHeader({ round: 3, name: 'Monza 1000', track: bad })).toBe('ROUND 3 · MONZA 1000')
  })

  it.each([
    ['absent', undefined],
    ['null', null],
    ['a string', 'Spa 6 Hours'],
    ['an array', ['Spa 6 Hours']],
    ['an empty object', {}],
    ['an object with no valid part', { round: 0, name: ' ', track: 7 }],
  ])('returns null when event is %s', async (_label, event) => {
    expect(await eventHeader(event)).toBeNull()
  })
})

describe('infoLines — the line list (rule 77)', () => {
  it('lists event-info.json’s lines in array order, then the configured lines', async () => {
    expect(await infoLines(structuredClone(fixture.info_lines), ['Follow us @battlecast'])).toEqual([
      'Live from the Ardennes',
      'Race 2 starts at 15:00 CET',
      'Kevin Estre leads the Porsche charge into the final hour',
      'Follow us @battlecast',
    ])
  })

  it('trims each producer line and keeps its case and inner text verbatim', async () => {
    expect(await infoLines(['  Safety car DEPLOYED  on lap 14 ', '\tpit lane OPEN\n'], [])).toEqual([
      'Safety car DEPLOYED  on lap 14',
      'pit lane OPEN',
    ])
  })

  it('skips blank and non-string entries without stopping the ones around them', async () => {
    expect(await infoLines(['A', '', '   ', 42, null, { text: 'B' }, ['C'], true, 'D'], [])).toEqual(['A', 'D'])
  })

  it.each([
    ['absent', undefined],
    ['null', null],
    ['a string', 'Live from the Ardennes'],
    ['an object', { 0: 'Live' }],
  ])('gives no producer lines when info_lines is %s, keeping the configured ones', async (_label, field) => {
    expect(await infoLines(field, ['Follow us @battlecast', 'Sponsored by Example'])).toEqual([
      'Follow us @battlecast',
      'Sponsored by Example',
    ])
  })

  it('drops a line equal to an earlier one, keeping its first place (producer before config)', async () => {
    expect(await infoLines(['A', 'B', ' A ', 'C'], ['B', 'D', 'C', 'E'])).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('compares exactly: lines differing only in case are both kept', async () => {
    expect(await infoLines(['Live'], ['LIVE'])).toEqual(['Live', 'LIVE'])
  })

  it('is empty with no producer lines and no configured lines', async () => {
    expect(await infoLines(null, [])).toEqual([])
  })
})
