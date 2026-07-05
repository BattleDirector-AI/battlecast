// Dev-only sanity check for the live race simulator.
//
// Run:  npm run validate-simulator   (from producers/mock/)
//
// Steps simulate.js forward a few thousand ticks and validates every resulting
// snapshot against the same required-field contract used for the static
// fixtures (validate.js). Because the simulator auto-cycles through the session
// phases (qualifying → grid → race → results), a long enough run visits every
// phase; this check additionally asserts that (a) every one of those phases was
// actually observed and validated, and (b) qualifying produced at least one
// `notable.class_best_lap` flag, so the class-best edge the #22 widget relies on
// is exercised. Exits non-zero on any failure.

const { createSimulator, PHASES, classPace } = require("./simulate.js");
const { validate } = require("./validate.js");

// Lap-time realism band, as a fraction of a class's base pace. A completed lap far
// below the class pace means a car is out-lapping its own class (the absolute-noise
// bug: slower classes posting sub-pace laps); far above means an inflated multi-lap
// "out lap". Per-car skill offset (±0.5s) plus the ±4% pace noise keep real laps
// comfortably inside [0.9x, 1.5x]; the pre-fix code produced laps down to ~0.55x.
// The band is probabilistic (unseeded Math.random) but the 0.9x floor keeps a
// deliberate ~0.05 margin over the observed worst legitimate lap (~0.95x), so the
// check is stable in practice; tightening the band or widening the noise clamp
// would erode that margin.
const LAP_MIN_FACTOR = 0.9;
const LAP_MAX_FACTOR = 1.5;

const TICKS = Number(process.env.VALIDATE_TICKS) || 3000;
const DT_SECONDS = Number(process.env.SIM_DT_SECONDS) || 2;

// Drive the phase machine with short, explicit durations (independent of any
// QUALI_SECONDS/... env a tester may have set) so a bounded run is guaranteed to
// cycle through every phase several times. Qualifying stays long enough for cars
// to complete flying laps and set class bests.
const simulator = createSimulator({
  phaseSeconds: { qualifying: 400, grid: 40, race: 400, results: 40 },
});

let failed = 0;
const ticksByMode = new Map();
let qualiClassBestSeen = false;
const lapBandViolations = [];
// last_lap persists for the ~50 ticks between a car's laps, so dedup per
// (car, lap) to keep the report from filling with copies of one bad lap.
const seenLapKeys = new Set();

for (let i = 0; i < TICKS; i++) {
  const payload = simulator.step(DT_SECONDS);
  ticksByMode.set(payload.mode, (ticksByMode.get(payload.mode) || 0) + 1);
  if (payload.mode === "qualifying" && payload.vehicles.some((v) => v.notable && v.notable.class_best_lap)) {
    qualiClassBestSeen = true;
  }

  // Lap-time realism: every completed lap must sit within a sane band of its class
  // base pace. Catches the absolute-noise regression (sub-pace laps / cross-class
  // inversion) and inflated out-laps. Sampled once per (car, lap) via last_lap.
  for (const v of payload.vehicles) {
    if (v.last_lap == null) continue;
    const base = classPace(v.vehicle_class);
    if (v.last_lap < base * LAP_MIN_FACTOR || v.last_lap > base * LAP_MAX_FACTOR) {
      const key = `${v.slot_id}:${v.last_lap}`;
      if (seenLapKeys.has(key)) continue;
      seenLapKeys.add(key);
      if (lapBandViolations.length < 10) {
        lapBandViolations.push(
          `tick ${i} (${payload.mode}): ${v.driver_name} [${v.vehicle_class}] last_lap=${v.last_lap.toFixed(1)}s ` +
            `= ${(v.last_lap / base).toFixed(2)}x base ${base}s`,
        );
      }
    }
  }

  const errors = validate(payload);
  if (errors.length > 0) {
    failed += 1;
    console.error(`FAIL tick ${i} (mode "${payload.mode}"):`);
    for (const err of errors) console.error(`  - ${err}`);
    if (failed >= 5) {
      console.error("\n... stopping after 5 failed ticks.");
      break;
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} tick(s) failed validation out of ${TICKS}.`);
  process.exit(1);
}

// Every phase must have been reached and validated, not just the race.
const missing = PHASES.filter((mode) => !ticksByMode.has(mode));
if (missing.length > 0) {
  console.error(`\nExpected every phase to be visited, but never saw: ${missing.join(", ")}.`);
  console.error(`Observed: ${[...ticksByMode.entries()].map(([m, n]) => `${m}=${n}`).join(", ")}.`);
  process.exit(1);
}

if (!qualiClassBestSeen) {
  console.error("\nQualifying never surfaced a notable.class_best_lap flag — the class-best edge is not exercised.");
  process.exit(1);
}

if (lapBandViolations.length > 0) {
  console.error(
    `\nImplausible lap times (outside [${LAP_MIN_FACTOR}x, ${LAP_MAX_FACTOR}x] of class base pace):`,
  );
  for (const v of lapBandViolations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(`All ${TICKS} simulated ticks valid against spec/v1 required-field contract.`);
console.log(`Phases covered: ${PHASES.map((m) => `${m} (${ticksByMode.get(m)} ticks)`).join(", ")}.`);
console.log("Qualifying surfaced a notable.class_best_lap flag (class-best edge exercised).");
console.log(`Lap times within [${LAP_MIN_FACTOR}x, ${LAP_MAX_FACTOR}x] of class base pace.`);
