// Dev-only sanity check for the live race simulator.
//
// Run:  npm run validate-simulator   (from producers/mock/)
//
// Steps simulate.js forward a few thousand ticks and validates every
// resulting snapshot against the same required-field contract used for the
// static fixtures (validate.js). Exits non-zero on any failure.

const { createSimulator } = require("./simulate.js");
const { validate } = require("./validate.js");

const TICKS = Number(process.env.VALIDATE_TICKS) || 3000;
const DT_SECONDS = Number(process.env.SIM_DT_SECONDS) || 2;

const simulator = createSimulator();
let failed = 0;

for (let i = 0; i < TICKS; i++) {
  const payload = simulator.step(DT_SECONDS);
  const errors = validate(payload);
  if (errors.length > 0) {
    failed += 1;
    console.error(`FAIL tick ${i}:`);
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
console.log(`All ${TICKS} simulated ticks valid against spec/v1 required-field contract.`);
