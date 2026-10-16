import { describe, it, expect } from 'vitest'
import { normalizeConfig, parseTowerMetricsParam, TOWER_METRIC_FIELDS } from './overlayConfig.js'
import { TOWER_METRIC_HELP } from './configHelp.js'

// `towerMetrics.lapFlash` — the tower lap-time flash toggle (overlay-config.md rule 38).
const lapFlash = (v) =>
  normalizeConfig({ widgets: { tower: { towerMetrics: { lapFlash: v } } } }).widgets.tower
    .towerMetrics.lapFlash

describe('normalizeConfig — towerMetrics.lapFlash (#207)', () => {
  it('defaults on, alongside the existing defaults', () => {
    expect(normalizeConfig({}).widgets.tower.towerMetrics).toEqual({
      interval: true,
      pit: false,
      tire: false,
      fuel: false,
      lapFlash: true,
    })
  })

  it('keeps a boolean and replaces garbage with the default', () => {
    expect(lapFlash(false)).toBe(false)
    expect(lapFlash(true)).toBe(true)
    expect(lapFlash('no')).toBe(true)
    expect(lapFlash(0)).toBe(true)
  })

  it('is one of the editor-iterated tower metric toggles, with help copy (rules 16, 19)', () => {
    expect(TOWER_METRIC_FIELDS).toContain('lapFlash')
    expect(TOWER_METRIC_HELP.lapFlash?.toLowerCase()).toMatch(/lap time/)
  })
})

describe('parseTowerMetricsParam — ?metrics= and lapFlash (#207)', () => {
  it('turns lapFlash on when listed, matching case-insensitively', () => {
    expect(parseTowerMetricsParam('interval,lapflash')?.lapFlash).toBe(true)
    expect(parseTowerMetricsParam('LapFlash')?.lapFlash).toBe(true)
  })

  it('turns lapFlash off when a list omits it', () => {
    expect(parseTowerMetricsParam('interval')?.lapFlash).toBe(false)
  })
})
