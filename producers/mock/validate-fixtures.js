// Dev-only structural validator for spec/v1 fixtures.
//
// Run:  npm run validate-fixtures   (from producers/mock/)
//
// Checks every fixture this mock producer replays in `fixtures` mode against
// the required-field contract in spec/v1/schema.json. Exits non-zero on any
// failure so it can gate CI / manual verification.

const fs = require("fs");
const path = require("path");
const { validate } = require("./validate.js");

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "spec", "v1", "fixtures");
const FIXTURE_FILES = [
  "race-close-battle.json",
  "race-no-battle.json",
  "race-idle-battle.json",
  "race-class-best.json",
  "qualifying-target.json",
];

let failed = 0;
for (const name of FIXTURE_FILES) {
  const full = path.join(FIXTURES_DIR, name);
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (e) {
    console.error(`FAIL ${name}: could not parse — ${e.message}`);
    failed += 1;
    continue;
  }
  const errors = validate(payload);
  if (errors.length === 0) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}:`);
    for (const err of errors) console.error(`  - ${err}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed validation.`);
  process.exit(1);
}
console.log(`\nAll ${FIXTURE_FILES.length} fixture(s) valid against spec/v1 required-field contract.`);
