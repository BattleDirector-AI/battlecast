# Glossary

Domain terms used across the battlecast specs and code.

| Term | Definition |
|---|---|
| **Producer** | Any tool (for any sim) that runs the HTTP + SSE server and streams race-state `state` events. battlecast connects *out* to it. [BattleDirector](https://github.com/BattleDirector-AI/battledirector) is the reference producer but not a requirement. |
| **Consumer** | battlecast itself — the client that opens the SSE connection and renders. |
| **Subject** | The on-camera driver identity (`slot_id` + `driver_name`). Widgets highlight this driver and center the battle box / lower-thirds on them. |
| **slot_id** | The stable per-session identity key for a vehicle. Identity is keyed off `slot_id`, never `driver_name` (two drivers can share a name). |
| **Snapshot / `state` event** | One complete JSON document of current race state, delivered as an SSE event named `state`. Not a delta — the latest snapshot is sufficient to render. |
| **schemaVersion** | The protocol contract version (`"1"`), numbered independently of the app release and any producer version. Bumps only on a breaking change. |
| **Dumb overlay, smart producer** | Core principle: battlecast renders; it never analyzes the race. Derived facts are producer-computed fields; the overlay reads them, never scans `vehicles[]` to derive them. |
| **Widget** | A single overlay graphic selected by URL path: tower, battle, driver, qualifying, racecontrol, onboard, logos (+ takeover slides grid/results, and the `/all` composite, `/config` editor). |
| **Lower-third** | A bottom-of-screen name-tag for the on-camera driver. Subject-driven; fires on a camera cut. Widgets: driver (#21, identity) and qualifying/sector (#22, timing). |
| **Camera cut** | A change of `subject.slot_id` between snapshots (edge-triggered), including `null→X`, `X→Y`, `X→null`. Lower-thirds fire on it. |
| **Dwell** | Trigger mode where a lower-third fires on a cut, shows for `dwellSeconds`, then auto-hides; a new cut resets the dwell in place. Contrast `persistent` (shows whenever subject valid). |
| **Battle intensity** | Opaque producer-computed `[0,1]` value describing how contested the on-camera driver's battle is. Drives the battle box meter. |
| **notable** | Per-vehicle open object of producer-set booleans (`class_best_lap`, `session_best_lap`, `personal_best_lap`) flagging lap notability. The overlay fires on the flag, never derives it. |
| **target_lap / delta_to_target** | Producer-provided "time to beat" (seconds) and the vehicle's delta to it. The producer decides what "target" means; the overlay just displays it. |
| **gap_to_leader** | Producer-provided time gap from a vehicle to the overall classification leader; `0` for the leader. |
| **interval_ahead** | Producer-provided time gap (seconds) to the car immediately *ahead* (`position − 1`); the tower's "interval" column. Distinct from `gap_to_leader`; not re-derivable class-relatively, so rendered verbatim. |
| **pit_stops / in_pit** | Per-vehicle completed pit-stop count and an in-pit boolean flag; drive the tower's pit indicator (race-only). |
| **tire_compound / tire_wear** | Per-vehicle current-tire compound label (verbatim) and normalized `[0,1]` wear; drive the tower's tire indicator. |
| **fuel** | Per-vehicle normalized `[0,1]` fuel *or* hybrid energy remaining (producer decides which); a neutral tower resource bar. |
| **towerMetrics** | Per-tower config toggles `{interval,pit,tire,fuel}` (interval on, rest off by default) selecting which richer-tower indicators show. `?metrics=` overrides on the standalone `/tower`. |
| **Tower clamp** | The CSS bound guaranteeing the standings tower never exceeds its configured `h` (shipped in 0.7.0). The permanent safety net beneath overflow selection. See [[tower-overflow]]. |
| **Row budget** | How many rows the tower slot can show beneath its header; when none fit, only the header shows. |
| **Pinned rows** | Cars that always keep a tower row when the field overflows: `pinTop` leaders (`pinScope` overall or per-class) plus the subject car when `pinSubject`. De-duplicated by `slot_id`. |
| **Cycling window** | The rows left after pins, cycling through the non-pinned field in position order, `perPageSeconds` per page. Membership is frozen per page turn for stability; no page indicator. |
| **maxRows** | Per-tower cap: `"auto"` (derive from `h`) or an integer. |
| **Autocycle** | LMU's name for the pinned-top-plus-cycling-window tower behavior; battlecast's `perPageSeconds` is its dwell knob. |
| **Race strategy suppression** | In qualifying/practice the tower suppresses pit, tire-wear, and fuel outright (race features on a lap board); tire compound and the interval column stay. |
| **Session-progress readout** | The "Session Info" clock / `LAP X OF Y` counter rendered in the **standings-tower header** — distinct from the Race Control flag/FCY/SC widget. |
| **?class= filter** | Cross-route URL knob (`/tower`, `/all`, `/grid`, `/results`) narrowing the rendered field to one `vehicle_class`; class-rank badges stay computed from the full field. |
| **telemetry** | Optional `subject.telemetry` sub-object of the on-camera driver's live inputs (throttle, brake, speed, gear). High-churn; drives the on-board HUD. |
| **Canonical km/h** | Speed is always emitted in km/h; the on-board HUD converts to mph in the view (`× 0.621371`) when `speedUnit: mph`. |
| **FCY (Full Course Yellow)** | Whole-course caution (`session.full_course_yellow`), distinct from a local `yellow` `flag`. |
| **Safety Car / SC** | `session.safety_car` — a safety/pace car is deployed; independent of FCY. |
| **basis** | Optional `session` field (`"time"` \| `"laps"`) that overrides the timed-vs-lap progress readout; resolves the endurance "time-certain + N laps" case producer-side. |
| **Profile** | A named saved layout config (`data/profiles/<name>.json`) selected via `?profile=`. Carries geometry/visibility/rotation/motion. |
| **configVersion** | The overlay-config contract version (`"1"`), independent of `schemaVersion` and the app release. |
| **Canvas** | The fixed logical layout space (default 1920×1080) that widget geometry is absolute-px against; scaled uniformly to the Browser Source viewport. |
| **hideWhenIdle** | Per-widget opt-in to drop a *supporting* widget from the render while it has nothing meaningful to show. |
| **Companion server** | The optional `battlecast serve` process: serves the built app (SPA fallback) + config/asset API. The write/serve side of overlay config. |
| **OBS Browser Source** | The OBS input that loads a battlecast overlay URL. Runs Chromium/CEF, which reports `prefers-reduced-motion: reduce` — hence the overlay animates by default and ignores that media query. |
| **Compliance harness** | `spec/v1/compliance/` — lets third-party producer authors self-check their SSE endpoint against `schema.json`. |
