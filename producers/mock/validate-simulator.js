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

const { createSimulator, PHASES } = require("./simulate.js");
const { validate } = require("./validate.js");

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

for (let i = 0; i < TICKS; i++) {
  const payload = simulator.step(DT_SECONDS);
  ticksByMode.set(payload.mode, (ticksByMode.get(payload.mode) || 0) + 1);
  if (payload.mode === "qualifying" && payload.vehicles.some((v) => v.notable && v.notable.class_best_lap)) {
    qualiClassBestSeen = true;
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

console.log(`All ${TICKS} simulated ticks valid against spec/v1 required-field contract.`);
console.log(`Phases covered: ${PHASES.map((m) => `${m} (${ticksByMode.get(m)} ticks)`).join(", ")}.`);
console.log("Qualifying surfaced a notable.class_best_lap flag (class-best edge exercised).");
