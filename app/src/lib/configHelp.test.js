import { describe, it, expect } from 'vitest'
import { WIDGET_HELP, FIELD_HELP, TOWER_METRIC_HELP, DRIVER_INFO_HELP } from './configHelp.js'
import { WIDGET_KEYS, TOWER_METRIC_FIELDS, DRIVER_INFO_FIELDS } from './overlayConfig.js'

/* Coverage, not prose review: these bind the help copy to the config surface the
 * editor actually iterates, so a knob added to `overlayConfig.js` without help
 * fails CI instead of shipping undocumented. */

describe('configHelp coverage', () => {
  it('describes every widget the editor renders, and no others', () => {
    expect(Object.keys(WIDGET_HELP).sort()).toEqual([...WIDGET_KEYS].sort())
  })

  it('describes every tower metric toggle, and no others', () => {
    expect(Object.keys(TOWER_METRIC_HELP).sort()).toEqual([...TOWER_METRIC_FIELDS].sort())
  })

  it('describes every driver-info toggle, and no others', () => {
    expect(Object.keys(DRIVER_INFO_HELP).sort()).toEqual([...DRIVER_INFO_FIELDS].sort())
  })

  it('gives each widget a human title distinct from its config key', () => {
    for (const key of WIDGET_KEYS) {
      const entry = WIDGET_HELP[key]
      expect(entry.title, `${key} title`).toBeTruthy()
      // "racecontrol" -> "Race control": the point is a name a broadcaster reads,
      // not the terse key the editor already shows as the checkbox label.
      expect(entry.title.toLowerCase(), `${key} title`).not.toBe(key)
    }
  })

  it('gives each widget a summary that says what appears on stream', () => {
    for (const key of WIDGET_KEYS) {
      const { summary } = WIDGET_HELP[key]
      expect(summary.length, `${key} summary too short to be useful`).toBeGreaterThan(80)
      expect(summary.trim().endsWith('.'), `${key} summary should be a sentence`).toBe(true)
    }
  })
})

describe('configHelp copy is written for broadcasters', () => {
  const allCopy = [
    ...Object.values(WIDGET_HELP).map((w) => w.summary),
    ...Object.values(FIELD_HELP),
    ...Object.values(TOWER_METRIC_HELP),
    ...Object.values(DRIVER_INFO_HELP),
  ]

  it('never leaks protocol or codebase jargon', () => {
    // These are real identifiers from spec/v1 and the renderer. A broadcaster who
    // downloaded the .exe has never seen them; if copy needs one, the copy is wrong.
    const jargon = [
      'slot_id',
      'vehicles[]',
      'schemaVersion',
      'gap_to_leader',
      'interval_ahead',
      'notable',
      'lower-third widget #',
      'ADR',
      'svelte',
    ]
    for (const text of allCopy) {
      for (const term of jargon) {
        expect(text.toLowerCase(), `"${term}" in: ${text.slice(0, 60)}...`).not.toContain(
          term.toLowerCase(),
        )
      }
    }
  })

  it('never cites issue numbers', () => {
    for (const text of allCopy) {
      expect(text, `issue ref in: ${text.slice(0, 60)}...`).not.toMatch(/#\d+/)
    }
  })

  it('has no empty or placeholder entries', () => {
    for (const text of allCopy) {
      // Low bar on purpose: this catches empty/placeholder entries, not terseness.
      // Some toggles ("Show the car number.") are genuinely self-evident, and
      // padding real copy to clear a threshold would make the help worse.
      expect(text.trim().length).toBeGreaterThan(15)
      expect(text).not.toMatch(/\bTODO\b|\bTBD\b|Lorem ipsum/i)
    }
  })
})

describe('configHelp explains the surprising behaviors', () => {
  // The two rules that most often read as bugs. If the copy stops mentioning them,
  // the help has lost the thing it exists for.
  it('warns that pit/tire-wear/fuel are suppressed in qualifying and practice', () => {
    for (const field of ['pit', 'fuel']) {
      expect(TOWER_METRIC_HELP[field].toLowerCase()).toMatch(/qualifying and practice/)
    }
    expect(TOWER_METRIC_HELP.tire.toLowerCase()).toMatch(/qualifying and practice/)
  })

  it('explains that lower-thirds hide themselves between camera cuts', () => {
    for (const key of ['driver', 'qualifying']) {
      expect(WIDGET_HELP[key].summary.toLowerCase()).toMatch(/camera cut/)
      expect(WIDGET_HELP[key].summary.toLowerCase()).toMatch(/hide|wipes away|off screen/)
    }
  })

  it('explains that the producer must already be running', () => {
    expect(FIELD_HELP.producerSrc.toLowerCase()).toMatch(/producer/)
    expect(FIELD_HELP.producerSrc.toLowerCase()).toMatch(/running/)
  })
})
