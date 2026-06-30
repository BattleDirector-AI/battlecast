# Contributing to battlecast

Thanks for your interest in battlecast. This document covers the one discipline
that matters most here: **how we test.**

## Fixture-based behavioral testing

battlecast follows **fixture-based behavioral testing**, modeled on
[BattleDirector](https://github.com/BattleDirector-AI/battledirector)'s own
spec-driven development discipline.

The rule: **given a state fixture, assert on the actual rendered content — not on
"it rendered without throwing."**

A test that only proves a component mounted, an SSE event was received, or a
function was called tells you nothing about whether the user-visible output is
correct. Those are syntactic-shape assertions; they stay green while the broadcast
graphic silently regresses.

Instead, every behavioral test should:

1. Start from a **fixture** — a concrete spec-v1 state payload (see `spec/v1/fixtures/`).
2. Drive the widget with that fixture.
3. Assert on the **produced content**: the rendered DOM text, element order,
   highlight state, numeric values shown — the things a viewer would actually see.

Examples of the bar we hold:

- ✅ "Given vehicles in position order `[P1=Hamilton, P2=Verstappen]`, the tower's
  rendered rows read `Hamilton` then `Verstappen`, in that order."
- ✅ "Given `subject` on-camera = Verstappen with `gap_ahead = 0.4s`, the battle box
  shows `0.4` next to Verstappen."
- ✅ "Given no active battle, the battle box renders its explicit idle state."
- ❌ "The tower component mounts without error."
- ❌ "An SSE `state` event handler was called."

## Spec changes

The producer ↔ renderer contract lives in `spec/v1/`. Changes to the contract must
update `spec/v1/SPEC.md`, `spec/v1/schema.json`, and the affected fixtures together,
and must keep the compliance harness (`spec/v1/compliance/`) passing.

## Pull requests

Keep PRs focused. Include or update the fixtures your change is tested against, and
make sure CI is green before requesting review.
