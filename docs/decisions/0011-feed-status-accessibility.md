# Decision: the feed-status readout is a live region, and Reconnect keeps keyboard focus in the Producer section

**Issues:** #174 (found in code review of PR #172 / #160) · **Milestone:** unassigned
**Status:** Accepted · **Date:** 2026-09-19

Extends `0006-config-producer-feed-status.md` (the readout) and `0007-config-feed-reconnect.md`
(the Reconnect control it fixes an accessibility gap in). Behavior: `.ai/spec/what/overlay-config.md`
rules 34-35.

## Context

0007 gated the Reconnect control on "not connected" (rule 30) and deliberately made it **absent**,
not disabled, once the readout leaves that state — the disappearance itself is part of the
feedback for a sighted operator. That reads correctly for one audience and leaves two others with
nothing:

- **Keyboard operators** lose their position: the button they just activated is removed from the
  DOM in the same tick, and with no explicit focus target the browser drops focus to `<body>` —
  landing them back at the top of a long, dense panel instead of where they were working.
- **Screen-reader operators** get **nothing at all**. `[data-testid="feed-status"]` carries no
  `role` or `aria-live`, so the readout's own text changing — `not connected` → `connecting…` →
  `connected` — is never announced, whether or not anything was pressed (the drop-and-recover
  case, with no button involved, is just as silent).

## Decision

1. **`[data-testid="feed-status"]` gets `role="status"`.** An implicit `aria-live="polite"` region:
   every transition among rule 25's four states is announced as it happens, covering both an
   explicit Reconnect press and an unprompted drop/recovery. This is the fix that matters for a
   screen-reader operator — the live region carries the information whether or not focus ever
   moves.
2. **Activating Reconnect moves focus to that same readout**, rather than letting it fall to
   `<body>`. A keyboard operator ends up exactly where the announcement is coming from, in the
   section they were already working in, rather than at the top of the page.
3. **Focus only moves on the control's OWN activation** — never as a side effect of the same
   `{#if}` unmounting because the feed happened to recover on its own. An operator who is
   elsewhere on the page when the feed reconnects unprompted must not have focus silently pulled
   out from under them; that would be a worse bug than the one being fixed.

## Alternatives rejected

| Option | Why not |
| ------ | ------- |
| Focus management alone (no live region) | Solves nothing for a screen-reader operator — the issue's own framing: "fixing focus without the live region does not help a screen-reader user." The live region is the higher-value half and is not optional. |
| Move focus to the Producer section's `<h2>` or the SSE URL field | Farther from the readout than necessary, and the SSE URL field would invite an edit right after a Reconnect press, which is not the natural next action. The readout is both where the announcement lives and where the control the operator just used was. |
| Move focus on every `feedNotConnected → false` transition, pressed or not | Rejected directly — would steal keyboard focus from whatever the operator is doing elsewhere on the page the moment the feed happens to heal itself, which is strictly worse than the bug being fixed. |

## Consequences

- `[data-testid="feed-status"]` needs `tabindex="-1"` to be a valid programmatic focus target
  without joining the normal tab order (it was never meant to be tab-reachable on its own).
- The Producer-section layout reflow when Reconnect appears/disappears (~1.5-2rem, noted in #174
  as a related concern) is deliberately **out of scope here**: it is a pure layout effect that
  `happy-dom` cannot observe at all (no layout engine — the same category of gap noted against
  #118 and #153), so a fix here would ship with no regression test. Left as unaddressed remainder
  of #174, worth a follow-up issue if it turns out to matter in practice.
