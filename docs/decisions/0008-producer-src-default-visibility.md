# Decision: `/config` names the URL field's value as the demo producer's when it is

**Issues:** #183 · **Milestone:** unassigned
**Status:** Accepted · **Date:** 2026-09-18

Extends `0006-config-producer-feed-status.md` and `0007-config-feed-reconnect.md`, which gave
`/config` a live readout for whether the configured producer answers. This decision addresses a
failure upstream of that readout: the field can hold the bundled demo producer's address while
looking, in every other way, like a broadcaster's own configured value. Behavior:
`.ai/spec/what/overlay-config.md` rule 31.

## Context

A broadcaster reported (#183) that battlecast rendered nothing even though `/config`, OBS,
their producer, and battlecast itself were all running. The Producer SSE URL field read
`http://localhost:8080/events` — not blank, a concrete value — and their producer's actual
loopback address was different. Nothing on the page said that `8080` was the bundled demo
producer's port rather than theirs.

The root cause is in `normalizeConfig` (`app/src/lib/overlayConfig.js`): `DEFAULT_CONFIG.producer.src`
is not empty, it is the literal `DEFAULT_SRC` string. Any profile that never set its own
`producer.src` — a brand new profile, or one from before the Producer section existed — normalizes
to that same literal value. Rule 27 already gives an **empty** field the identical fallback, so
a truly-blank field and a field baked with the demo address are indistinguishable in their
effect and, it turns out, in how a broadcaster reads them: both look like "there is an address
here," and only one of them is real.

`0006`'s feed-status readout already answers "is this address reachable" — but a broadcaster
correctly pointed at nothing that happens to be listening on `8080` (or who has not yet started
their producer) reads the same "not connected" they'd read for a dozen other misconfigurations,
with no hint that the specific number in the field is the tell.

## Decision

Whenever the URL the feed connects to (rule 27's resolution) equals the literal default
`http://localhost:8080/events`, the Producer section renders an always-visible note next to the
URL field identifying that address as the bundled demo producer's, not a configured one, and
telling the broadcaster to replace it with their own producer's address. The note tracks the
**resolved** URL, not whether the field has been touched or has focus — so it is present for a
brand-new profile, present again the instant the field is cleared back to empty, and absent the
moment the field holds anything else, including a value that happens to differ from the default
by one character.

It is deliberately **not** the feed-status readout. It states which URL is in effect, never
whether that URL currently answers, and it must remain phrased so the two cannot be conflated —
the panel already carries one status line (rule 29) and a second one that could be misread as the
first would recreate the exact problem `0006` fixed for the companion-server line.

Help copy for the field (`configHelp.js`) is updated alongside so a broadcaster who opens the ⓘ
gets the same warning the ADR is about, not just the ambient note.

## Alternatives rejected

| Option | Why not |
| ------ | ------- |
| Stop baking a concrete default into `DEFAULT_CONFIG.producer.src`; leave it `''` | Doesn't fix anything for a profile already saved with the literal `8080` value (exactly #183's case, and every profile saved before this ships), and every reader of `config.producer.src` already treats blank and "the default string" as equivalent (rule 27), so this only relocates where the ambiguity lives rather than removing it. The note fixes both the blank case and the baked-in case with one condition. |
| Help-text only — leave the field/placeholder UI unchanged | Cheaper, and it does put the warning somewhere. But #183's broadcaster had the field in front of them and still missed it; the ⓘ is opt-in (rule 17) and easy to never open on a field that already looks filled in. An always-visible note is read without an extra click, on the exact panel where the mistake is made. |
| Move or duplicate the feed-status readout higher on the page | Rejected on its own terms independent of this issue: rule 29's adjacency to the URL field is deliberate (0006), and a second copy of the same readout elsewhere risks the two drifting or being misread as different things. This decision doesn't touch placement of the existing readout at all. |
| Warn only after a failed connection attempt, keyed to the readout | Ties a naming problem to a networking problem it doesn't need. The field being on the demo address is true and worth saying regardless of whether something happens to be listening on `8080` right now (e.g. before either producer or battlecast is started) — the note is a statement about the *value*, not the *connection*. |

## Consequences

- No config field, no `configVersion` bump: the note is derived, presentation-only state, exactly
  like the feed-status readout it sits beside (rule 29).
- `configHelp.js`'s `producerSrc` entry grows a sentence; `configHelp.test.js`'s coverage checks
  apply unchanged.
- Existing profiles that already carry the literal default (including ones saved before this
  ships) are covered automatically — the condition is a value comparison, not a "was this ever
  edited" flag the profile would need to carry.
