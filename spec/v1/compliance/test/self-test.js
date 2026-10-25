// Self-test for the compliance harness itself: proves it (a) passes the
// reference mock producer (issue #3) and (b) fails a deliberately
// non-compliant stream with a clear, specific message, per the acceptance
// criteria on the harness issue. Run with `npm test` from spec/v1/compliance/.

const path = require("path");
const fs = require("fs");
const net = require("net");
const { spawn } = require("child_process");
const { runCheck } = require("../lib/run-check");
const { StatePayloadValidator } = require("../lib/validator");

const MOCK_PRODUCER = path.resolve(__dirname, "..", "..", "..", "..", "producers", "mock", "server.js");
const BAD_PRODUCER = path.resolve(__dirname, "bad-producer.js");
const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "fixtures");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function startChild(scriptPath, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    child.stdout.once("data", () => {
      if (!settled) {
        settled = true;
        resolve(child);
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (!settled) reject(new Error(`${scriptPath} exited early with code ${code}`));
    });
  });
}

function assert(cond, message) {
  if (!cond) throw new Error(`assertion failed: ${message}`);
}

async function testMockProducerPasses() {
  const port = await getFreePort();
  const child = await startChild(MOCK_PRODUCER, { PORT: String(port), INTERVAL_MS: "200" });
  try {
    const result = await runCheck(`http://localhost:${port}/events`, { samples: 3, timeoutMs: 5000 });
    assert(result.pass === true, `expected mock producer to PASS, got: ${JSON.stringify(result, null, 2)}`);
    console.log("PASS: harness passes the reference mock producer (#3)");
  } finally {
    child.kill();
  }
}

async function testBadMode(mode, { timeoutMs = 2000, samples = 1 } = {}, expectSubstring) {
  const port = await getFreePort();
  const child = await startChild(BAD_PRODUCER, { PORT: String(port), BAD_MODE: mode });
  try {
    const result = await runCheck(`http://localhost:${port}/events`, { samples, timeoutMs });
    assert(result.pass === false, `expected BAD_MODE=${mode} to FAIL, got: ${JSON.stringify(result, null, 2)}`);
    const allMessages = [
      ...result.failures,
      ...result.samples.flatMap((s) => s.errors),
    ].join("\n");
    assert(
      allMessages.includes(expectSubstring),
      `expected FAIL message for BAD_MODE=${mode} to include "${expectSubstring}", got:\n${allMessages}`
    );
    console.log(`PASS: harness fails BAD_MODE=${mode} with a clear message ("${expectSubstring}")`);
  } finally {
    child.kill();
  }
}

async function testEarlyDisconnect() {
  const port = await getFreePort();
  const child = await startChild(BAD_PRODUCER, { PORT: String(port), BAD_MODE: "close-early" });
  try {
    const start = Date.now();
    const result = await runCheck(`http://localhost:${port}/events`, { samples: 5, timeoutMs: 8000 });
    const elapsedMs = Date.now() - start;
    assert(
      elapsedMs < 4000,
      `expected an early producer disconnect to resolve well before the 8000ms timeout, took ${elapsedMs}ms`
    );
    assert(
      result.samples.length === 1 && result.samples[0].valid,
      `expected exactly 1 valid sample before disconnect, got: ${JSON.stringify(result.samples)}`
    );
    console.log(
      `PASS: harness returns promptly (${elapsedMs}ms) instead of waiting out the full timeout when the producer closes the connection early`
    );
  } finally {
    child.kill();
  }
}

async function testOversizedFrame() {
  const port = await getFreePort();
  const child = await startChild(BAD_PRODUCER, { PORT: String(port), BAD_MODE: "oversized-frame" });
  try {
    const result = await runCheck(`http://localhost:${port}/events`, { samples: 1, timeoutMs: 5000 });
    assert(result.pass === false, `expected an oversized unterminated frame to FAIL, got: ${JSON.stringify(result)}`);
    const allMessages = [...result.failures, ...result.samples.flatMap((s) => s.errors)].join("\n");
    assert(
      allMessages.includes("exceeded"),
      `expected FAIL message to mention the buffer size limit, got:\n${allMessages}`
    );
    console.log("PASS: harness aborts (rather than hanging or growing memory unbounded) on an oversized unterminated SSE frame");
  } finally {
    child.kill();
  }
}

// The optional `session` object (issue #90) is additive: fixtures that carry it
// must validate against schema.json, and — the core backward-compat guarantee —
// a payload with NO `session` must still validate. Assert all three directly
// against the schema via the harness's own ajv validator, not just trust
// additionalProperties.
function testSessionFixturesValidateAgainstSchema() {
  const validator = new StatePayloadValidator();
  const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));

  const full = load("race-session-fcy.json");
  let result = validator.validate(full);
  assert(result.valid, `expected race-session-fcy.json (full session) to validate, got: ${result.errors.join("; ")}`);

  const partial = load("race-session-partial.json");
  result = validator.validate(partial);
  assert(
    result.valid,
    `expected race-session-partial.json (partial session) to validate, got: ${result.errors.join("; ")}`
  );

  const noSession = load("race-close-battle.json");
  assert(!("session" in noSession), "race-close-battle.json is the no-session base and must NOT carry a session object");
  result = validator.validate(noSession);
  assert(result.valid, `expected a payload with NO session to still validate, got: ${result.errors.join("; ")}`);

  console.log(
    "PASS: session fixtures (full + partial) validate against schema.json, and a payload with NO session still validates (#90)"
  );
}

// The optional `subject.telemetry` sub-object (issue #102) is additive: fixtures
// that carry it must validate against schema.json, and — the core backward-compat
// guarantee — a payload with NO `subject.telemetry` must still validate. Assert all
// three directly against the schema via the harness's own ajv validator.
function testTelemetryFixturesValidateAgainstSchema() {
  const validator = new StatePayloadValidator();
  const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));

  const full = load("race-onboard-telemetry.json");
  assert(
    full.subject && full.subject.telemetry && typeof full.subject.telemetry.throttle === "number",
    "race-onboard-telemetry.json must carry a full subject.telemetry block"
  );
  let result = validator.validate(full);
  assert(result.valid, `expected race-onboard-telemetry.json (full telemetry) to validate, got: ${result.errors.join("; ")}`);

  const partial = load("race-onboard-partial.json");
  assert(
    partial.subject && partial.subject.telemetry && !("brake" in partial.subject.telemetry),
    "race-onboard-partial.json must carry a PARTIAL subject.telemetry (some fields omitted)"
  );
  result = validator.validate(partial);
  assert(
    result.valid,
    `expected race-onboard-partial.json (partial telemetry) to validate, got: ${result.errors.join("; ")}`
  );

  const noTelemetry = load("race-close-battle.json");
  assert(
    !(noTelemetry.subject && "telemetry" in noTelemetry.subject),
    "race-close-battle.json is the no-telemetry base and must NOT carry a subject.telemetry object"
  );
  result = validator.validate(noTelemetry);
  assert(result.valid, `expected a payload with NO subject.telemetry to still validate, got: ${result.errors.join("; ")}`);

  console.log(
    "PASS: telemetry fixtures (full + partial) validate against schema.json, and a payload with NO subject.telemetry still validates (#102)"
  );
}

// The additive vehicle identity fields `car_number` / `make` / `model` (0.6.0 HUD
// identity) are optional: a fixture carrying them must validate, and a payload
// WITHOUT them must still validate (backward-compat).
function testVehicleIdentityFieldsValidateAgainstSchema() {
  const validator = new StatePayloadValidator();
  const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));

  const withIdentity = load("race-onboard-telemetry.json");
  const subjectVehicle = withIdentity.vehicles.find((v) => v.slot_id === withIdentity.subject.slot_id);
  assert(
    subjectVehicle &&
      typeof subjectVehicle.car_number === "string" &&
      typeof subjectVehicle.make === "string" &&
      typeof subjectVehicle.model === "string",
    "race-onboard-telemetry.json's on-camera vehicle must carry car_number/make/model"
  );
  let result = validator.validate(withIdentity);
  assert(result.valid, `expected race-onboard-telemetry.json (vehicle identity) to validate, got: ${result.errors.join("; ")}`);

  const noIdentity = load("race-close-battle.json");
  assert(
    noIdentity.vehicles.every((v) => !("car_number" in v) && !("make" in v) && !("model" in v)),
    "race-close-battle.json is the no-identity base and its vehicles must NOT carry car_number/make/model"
  );
  result = validator.validate(noIdentity);
  assert(result.valid, `expected a payload with NO vehicle identity fields to still validate, got: ${result.errors.join("; ")}`);

  console.log(
    "PASS: vehicle identity fields (car_number/make/model) validate against schema.json, and a payload without them still validates (0.6.0 HUD identity)"
  );
}

// The additive per-vehicle metrics (slice 3 of #20) — `interval_ahead`, `pit_stops`,
// `in_pit`, `tire_compound`, `tire_wear`, `fuel` — are optional: fixtures that carry them
// must validate, a fixture that carries only SOME must validate, and — the core
// backward-compat guarantee — a payload with NONE must still validate. Assert all three
// directly against the schema via the harness's own ajv validator.
function testTowerMetricsFixturesValidateAgainstSchema() {
  const validator = new StatePayloadValidator();
  const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));

  const full = load("race-tower-metrics.json");
  const fullSubjectVeh = full.vehicles.find((v) => v.slot_id === full.subject.slot_id);
  assert(
    fullSubjectVeh &&
      typeof fullSubjectVeh.interval_ahead === "number" &&
      typeof fullSubjectVeh.pit_stops === "number" &&
      typeof fullSubjectVeh.in_pit === "boolean" &&
      typeof fullSubjectVeh.tire_compound === "string" &&
      typeof fullSubjectVeh.tire_wear === "number" &&
      typeof fullSubjectVeh.fuel === "number",
    "race-tower-metrics.json's subject vehicle must carry the full metric set (interval_ahead/pit_stops/in_pit/tire_compound/tire_wear/fuel)"
  );
  assert(
    full.vehicles.some((v) => v.in_pit === true),
    "race-tower-metrics.json must include a vehicle with in_pit: true"
  );
  let result = validator.validate(full);
  assert(result.valid, `expected race-tower-metrics.json (full metrics) to validate, got: ${result.errors.join("; ")}`);

  const partial = load("race-tower-partial.json");
  const partialSubjectVeh = partial.vehicles.find((v) => v.slot_id === partial.subject.slot_id);
  assert(
    partialSubjectVeh && "tire_compound" in partialSubjectVeh && !("fuel" in partialSubjectVeh),
    "race-tower-partial.json's subject vehicle must carry a PARTIAL metric set (some fields present, others omitted)"
  );
  result = validator.validate(partial);
  assert(
    result.valid,
    `expected race-tower-partial.json (partial metrics) to validate, got: ${result.errors.join("; ")}`
  );

  const noMetrics = load("race-close-battle.json");
  const METRIC_KEYS = ["interval_ahead", "pit_stops", "in_pit", "tire_compound", "tire_wear", "fuel"];
  assert(
    noMetrics.vehicles.every((v) => METRIC_KEYS.every((k) => !(k in v))),
    "race-close-battle.json is the no-metrics base and its vehicles must NOT carry any of the new metrics"
  );
  result = validator.validate(noMetrics);
  assert(result.valid, `expected a payload with NO vehicle metrics to still validate, got: ${result.errors.join("; ")}`);

  console.log(
    "PASS: tower metrics (interval_ahead/pit_stops/in_pit/tire_compound/tire_wear/fuel) validate against schema.json — full + partial, and a payload with none still validates (slice 3 of #20)"
  );
}

// The lap-deficit fields (ADR 0012) — `laps_behind_leader`, `laps_behind_ahead`,
// `laps_behind_class_leader` — are optional integers >= 0. The lapped fixture carries all
// three and must validate; a payload with none must still validate; and the schema must
// REJECT a negative, fractional, or string deficit, so a producer's bad value fails the
// harness rather than slipping through `additionalProperties: true` untyped.
function testLapDeficitFieldsValidateAgainstSchema() {
  const validator = new StatePayloadValidator();
  const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));
  const LAP_KEYS = ["laps_behind_leader", "laps_behind_ahead", "laps_behind_class_leader"];

  const lapped = load("race-tower-lapped.json");
  assert(
    lapped.vehicles.some((v) => v.laps_behind_leader >= 1 && v.laps_behind_class_leader === 0) &&
      lapped.vehicles.some((v) => v.laps_behind_class_leader >= 1),
    "race-tower-lapped.json must carry a car lapped overall but on its class lead lap, and a car laps down on its class leader"
  );
  let result = validator.validate(lapped);
  assert(result.valid, `expected race-tower-lapped.json to validate, got: ${result.errors.join("; ")}`);

  const none = load("race-tower-metrics.json");
  assert(
    none.vehicles.every((v) => LAP_KEYS.every((k) => !(k in v))),
    "race-tower-metrics.json is the no-lap-fields base and must NOT carry any laps_behind_* field"
  );
  result = validator.validate(none);
  assert(result.valid, `expected a payload with NO lap-deficit fields to still validate, got: ${result.errors.join("; ")}`);

  for (const key of LAP_KEYS) {
    for (const bad of [-1, 1.5, "1"]) {
      const payload = JSON.parse(JSON.stringify(lapped));
      payload.vehicles[2][key] = bad;
      result = validator.validate(payload);
      assert(!result.valid, `expected ${key}: ${JSON.stringify(bad)} to FAIL schema validation, but it validated`);
      assert(
        result.errors.some((e) => e.includes(`/vehicles/2/${key}`)),
        `expected the ${key}: ${JSON.stringify(bad)} error to name /vehicles/2/${key}, got: ${result.errors.join("; ")}`
      );
    }
  }

  console.log(
    "PASS: lap-deficit fields (laps_behind_leader/ahead/class_leader) validate against schema.json, a payload with none still validates, and negative/fractional/string values are rejected (ADR 0012)"
  );
}

// The local-yellow fields (ADR 0016) — per-vehicle `yellow_involved` (boolean) and
// `session.sector_flags` (array of strings) — are optional. The local-yellow fixture carries
// both and must validate; a payload with neither must still validate; and the schema must
// REJECT a string/number `yellow_involved` and a non-array or non-string `sector_flags`, so a
// producer's bad value fails the harness rather than slipping through untyped.
function testLocalYellowFieldsValidateAgainstSchema() {
  const validator = new StatePayloadValidator();
  const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));

  const yellow = load("race-local-yellow.json");
  assert(
    yellow.vehicles.some((v) => v.yellow_involved === true) &&
      Array.isArray(yellow.session?.sector_flags) &&
      yellow.session.sector_flags.includes("yellow"),
    "race-local-yellow.json must carry an involved car and a yellow sector"
  );
  let result = validator.validate(yellow);
  assert(result.valid, `expected race-local-yellow.json to validate, got: ${result.errors.join("; ")}`);

  const none = load("race-tower-metrics.json");
  assert(
    none.vehicles.every((v) => !("yellow_involved" in v)) && !("sector_flags" in (none.session ?? {})),
    "race-tower-metrics.json is the no-yellow-fields base and must NOT carry yellow_involved or sector_flags"
  );
  result = validator.validate(none);
  assert(result.valid, `expected a payload with NO local-yellow fields to still validate, got: ${result.errors.join("; ")}`);

  const rejects = (mutate, where, label) => {
    const payload = JSON.parse(JSON.stringify(yellow));
    mutate(payload);
    const r = validator.validate(payload);
    assert(!r.valid, `expected ${label} to FAIL schema validation, but it validated`);
    assert(
      r.errors.some((e) => e.includes(where)),
      `expected the ${label} error to name ${where}, got: ${r.errors.join("; ")}`
    );
  };
  for (const bad of ["true", 1]) {
    rejects((p) => (p.vehicles[2].yellow_involved = bad), "/vehicles/2/yellow_involved", `yellow_involved: ${JSON.stringify(bad)}`);
  }
  rejects((p) => (p.session.sector_flags = "yellow"), "/session/sector_flags", 'sector_flags: "yellow"');
  rejects((p) => (p.session.sector_flags = ["green", 2, "green"]), "/session/sector_flags/1", "sector_flags: [\"green\", 2, \"green\"]");

  console.log(
    "PASS: local-yellow fields (yellow_involved, session.sector_flags) validate against schema.json, a payload with neither still validates, and wrongly typed values are rejected (ADR 0016)"
  );
}

function testFinishStatusFieldValidatesAgainstSchema() {
  const validator = new StatePayloadValidator();
  const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));

  const finish = load("race-finish.json");
  const codes = finish.vehicles.map((v) => v.finish_status);
  assert(
    codes.filter((c) => c === 1).length === 3 && codes.includes(0) && codes.includes(2),
    "race-finish.json must carry three finished cars (1), one running (0), and one DNF (2)"
  );
  let result = validator.validate(finish);
  assert(result.valid, `expected race-finish.json to validate, got: ${result.errors.join("; ")}`);

  const dq = JSON.parse(JSON.stringify(finish));
  dq.vehicles[4].finish_status = 3;
  dq.vehicles[3].finish_status = null;
  result = validator.validate(dq);
  assert(result.valid, `expected finish_status 3 and null to validate, got: ${result.errors.join("; ")}`);

  const none = load("race-tower-metrics.json");
  assert(
    none.vehicles.every((v) => !("finish_status" in v)),
    "race-tower-metrics.json is the no-finish-status base and must NOT carry finish_status"
  );
  result = validator.validate(none);
  assert(result.valid, `expected a payload with NO finish_status to still validate, got: ${result.errors.join("; ")}`);

  for (const [bad, label] of [["1", 'the string "1"'], [true, "true"], [1.5, "1.5"], [-1, "-1"]]) {
    const payload = JSON.parse(JSON.stringify(finish));
    payload.vehicles[0].finish_status = bad;
    const r = validator.validate(payload);
    assert(!r.valid, `expected finish_status ${label} to FAIL schema validation, but it validated`);
    assert(
      r.errors.some((e) => e.includes("/vehicles/0/finish_status")),
      `expected the finish_status ${label} error to name /vehicles/0/finish_status, got: ${r.errors.join("; ")}`
    );
  }

  console.log(
    "PASS: finish_status validates against schema.json as a non-negative integer code, a payload without it still validates, and wrongly typed values are rejected (ADR 0017)"
  );
}

// `session.multiclass` (protocol-contract.md rule 20) is optional: the single-class fixture
// carries `false` and the multi-class grid fixture `true`, both must validate, as must null and
// a payload without it; and the schema must REJECT a string or number, so a producer that sends
// `"false"` or `0` fails the harness rather than reading as "the producer does not say".
function testMulticlassFieldValidatesAgainstSchema() {
  const validator = new StatePayloadValidator();
  const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));

  const single = load("race-single-class.json");
  assert(
    single.session?.multiclass === false && single.vehicles.every((v) => v.vehicle_class === "Default"),
    "race-single-class.json must carry session.multiclass: false and one shared class"
  );
  let result = validator.validate(single);
  assert(result.valid, `expected race-single-class.json to validate, got: ${result.errors.join("; ")}`);

  const multi = load("grid-multiclass.json");
  assert(multi.session?.multiclass === true, "grid-multiclass.json must carry session.multiclass: true");
  result = validator.validate(multi);
  assert(result.valid, `expected grid-multiclass.json to validate, got: ${result.errors.join("; ")}`);

  const nulled = JSON.parse(JSON.stringify(single));
  nulled.session.multiclass = null;
  result = validator.validate(nulled);
  assert(result.valid, `expected session.multiclass: null to validate, got: ${result.errors.join("; ")}`);

  const none = load("race-local-yellow.json");
  assert(!("multiclass" in (none.session ?? {})), "race-local-yellow.json must NOT carry session.multiclass");
  result = validator.validate(none);
  assert(result.valid, `expected a session with NO multiclass to still validate, got: ${result.errors.join("; ")}`);

  for (const [bad, label] of [["false", 'the string "false"'], [0, "0"], [1, "1"]]) {
    const payload = JSON.parse(JSON.stringify(single));
    payload.session.multiclass = bad;
    const r = validator.validate(payload);
    assert(!r.valid, `expected session.multiclass ${label} to FAIL schema validation, but it validated`);
    assert(
      r.errors.some((e) => e.includes("/session/multiclass")),
      `expected the multiclass ${label} error to name /session/multiclass, got: ${r.errors.join("; ")}`
    );
  }

  console.log(
    "PASS: session.multiclass validates against schema.json as a boolean or null, a session without it still validates, and wrongly typed values are rejected"
  );
}

// `race_events` (protocol-contract.md rule 22, ADR 0023) is an optional top-level array. The
// race-events fixture carries one entry of each type and must validate, as must null and a
// payload without it; and the schema must REJECT an entry without an id, and an entry missing
// the field its type requires, so a producer's malformed event fails the harness.
function testRaceEventsValidateAgainstSchema() {
  const validator = new StatePayloadValidator();
  const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));

  const events = load("race-events.json");
  const types = (events.race_events ?? []).map((e) => e.type);
  assert(
    ["fastest_lap", "leader_change", "retirement", "penalty"].every((t) => types.includes(t)),
    "race-events.json must carry at least one event of each type"
  );
  let result = validator.validate(events);
  assert(result.valid, `expected race-events.json to validate, got: ${result.errors.join("; ")}`);

  const nulled = JSON.parse(JSON.stringify(events));
  nulled.race_events = null;
  result = validator.validate(nulled);
  assert(result.valid, `expected race_events: null to validate, got: ${result.errors.join("; ")}`);

  const none = load("race-finish.json");
  assert(!("race_events" in none), "race-finish.json must NOT carry race_events");
  result = validator.validate(none);
  assert(result.valid, `expected a payload with NO race_events to still validate, got: ${result.errors.join("; ")}`);

  const unknownType = JSON.parse(JSON.stringify(events));
  unknownType.race_events.push({ id: "ev-x", type: "overtake", driver_name: "Kevin Estre" });
  result = validator.validate(unknownType);
  assert(result.valid, `expected an event of a type this revision does not define to validate, got: ${result.errors.join("; ")}`);

  const rejects = (mutate, where, label) => {
    const payload = JSON.parse(JSON.stringify(events));
    mutate(payload);
    const r = validator.validate(payload);
    assert(!r.valid, `expected ${label} to FAIL schema validation, but it validated`);
    assert(
      r.errors.some((e) => e.includes(where)),
      `expected the ${label} error to name ${where}, got: ${r.errors.join("; ")}`
    );
  };
  rejects((p) => (p.race_events = { id: "ev-1" }), "/race_events", "race_events: {…}");
  rejects((p) => delete p.race_events[0].id, "/race_events/0", "an event without an id");
  rejects((p) => (p.race_events[0].id = ""), "/race_events/0/id", 'an event with id ""');
  rejects((p) => delete p.race_events[0].lap_time, "/race_events/0", "a fastest_lap without lap_time");
  rejects((p) => (p.race_events[3].finish_status = 1), "/race_events/3/finish_status", "a retirement with finish_status 1");
  rejects((p) => delete p.race_events[4].penalty, "/race_events/4", "a penalty without penalty");

  console.log(
    "PASS: race_events validates against schema.json, null and a payload without it still validate, an unknown type is allowed, and an event missing its id or its type's field is rejected (ADR 0023)"
  );
}

// `event` and `info_lines` (protocol-contract.md rule 23, ADR 0024) are optional top-level
// fields. The event-info fixture carries both and must validate, as must null, a partial
// `event`, and a payload without either; and the schema must REJECT a `round` that is not an
// integer of at least 1, an `event` that is not an object, and a non-string line, so a
// producer's malformed event metadata fails the harness.
function testEventAndInfoLinesValidateAgainstSchema() {
  const validator = new StatePayloadValidator();
  const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));

  const info = load("event-info.json");
  assert(
    info.event && typeof info.event.name === "string" && Number.isInteger(info.event.round) && typeof info.event.track === "string",
    "event-info.json must carry an event with a name, an integer round and a track"
  );
  assert(
    Array.isArray(info.info_lines) && info.info_lines.length >= 2,
    "event-info.json must carry at least two info_lines"
  );
  let result = validator.validate(info);
  assert(result.valid, `expected event-info.json to validate, got: ${result.errors.join("; ")}`);

  const accepts = (mutate, label) => {
    const payload = JSON.parse(JSON.stringify(info));
    mutate(payload);
    const r = validator.validate(payload);
    assert(r.valid, `expected ${label} to validate, got: ${r.errors.join("; ")}`);
  };
  accepts((p) => (p.event = null), "event: null");
  accepts((p) => (p.info_lines = null), "info_lines: null");
  accepts((p) => (p.event = { track: "Monza" }), "an event with only a track");
  accepts((p) => (p.event = { name: "Spa 6 Hours", round: null, track: null }), "an event with null fields");
  accepts((p) => (p.info_lines = []), "an empty info_lines");

  const none = load("race-finish.json");
  assert(!("event" in none) && !("info_lines" in none), "race-finish.json must NOT carry event or info_lines");
  result = validator.validate(none);
  assert(result.valid, `expected a payload with NO event or info_lines to still validate, got: ${result.errors.join("; ")}`);

  const rejects = (mutate, where, label) => {
    const payload = JSON.parse(JSON.stringify(info));
    mutate(payload);
    const r = validator.validate(payload);
    assert(!r.valid, `expected ${label} to FAIL schema validation, but it validated`);
    assert(
      r.errors.some((e) => e.includes(where)),
      `expected the ${label} error to name ${where}, got: ${r.errors.join("; ")}`
    );
  };
  rejects((p) => (p.event.round = 0), "/event/round", "round 0");
  rejects((p) => (p.event.round = 2.5), "/event/round", "round 2.5");
  rejects((p) => (p.event.round = "3"), "/event/round", 'round "3"');
  rejects((p) => (p.event = "Spa 6 Hours"), "/event", 'event: "Spa 6 Hours"');
  rejects((p) => (p.event.name = 6), "/event/name", "a numeric event name");
  rejects((p) => (p.info_lines = "Live from the Ardennes"), "/info_lines", "info_lines: a string");
  rejects((p) => p.info_lines.push(42), "/info_lines/3", "a numeric info line");

  console.log(
    "PASS: event and info_lines validate against schema.json, null, partial and absent forms still validate, and a bad round, a non-object event and a non-string line are rejected (ADR 0024)"
  );
}

// `session.weather` (protocol-contract.md rule 24, ADR 0025) is an optional object inside
// `session`. The race-weather fixture carries air and track temperature and conditions and must
// validate, as must null, a partial weather, a payload whose session has no weather, and a
// payload with no session at all; and the schema must REJECT a temperature that is not a number,
// a non-string conditions, and a weather that is not an object.
function testSessionWeatherValidatesAgainstSchema() {
  const validator = new StatePayloadValidator();
  const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));

  const weather = load("race-weather.json");
  const w = weather.session && weather.session.weather;
  assert(
    w && typeof w.air_temp === "number" && typeof w.track_temp === "number" && typeof w.conditions === "string",
    "race-weather.json must carry session.weather with air_temp, track_temp and conditions"
  );
  let result = validator.validate(weather);
  assert(result.valid, `expected race-weather.json to validate, got: ${result.errors.join("; ")}`);

  const accepts = (mutate, label) => {
    const payload = JSON.parse(JSON.stringify(weather));
    mutate(payload);
    const r = validator.validate(payload);
    assert(r.valid, `expected ${label} to validate, got: ${r.errors.join("; ")}`);
  };
  accepts((p) => (p.session.weather = null), "session.weather: null");
  accepts((p) => (p.session.weather = { track_temp: -2.5 }), "a weather with only a (negative) track_temp");
  accepts((p) => (p.session.weather = { air_temp: null, track_temp: null, conditions: null }), "a weather with null fields");
  accepts((p) => (p.session.weather.track_wetness = 0.3), "a weather with a field this revision does not define");
  accepts((p) => delete p.session.weather, "a session without weather");
  accepts((p) => delete p.session, "a payload without session");

  const rejects = (mutate, where, label) => {
    const payload = JSON.parse(JSON.stringify(weather));
    mutate(payload);
    const r = validator.validate(payload);
    assert(!r.valid, `expected ${label} to FAIL schema validation, but it validated`);
    assert(
      r.errors.some((e) => e.includes(where)),
      `expected the ${label} error to name ${where}, got: ${r.errors.join("; ")}`
    );
  };
  rejects((p) => (p.session.weather.air_temp = "22"), "/session/weather/air_temp", 'air_temp "22"');
  rejects((p) => (p.session.weather.track_temp = true), "/session/weather/track_temp", "track_temp true");
  rejects((p) => (p.session.weather.conditions = 3), "/session/weather/conditions", "a numeric conditions");
  rejects((p) => (p.session.weather = "Clear"), "/session/weather", 'weather: "Clear"');

  console.log(
    "PASS: session.weather validates against schema.json, null, partial and absent forms still validate, and a non-numeric temperature, a non-string conditions and a non-object weather are rejected (ADR 0025)"
  );
}

async function main() {
  testSessionFixturesValidateAgainstSchema();
  testTelemetryFixturesValidateAgainstSchema();
  testVehicleIdentityFieldsValidateAgainstSchema();
  testTowerMetricsFixturesValidateAgainstSchema();
  testLapDeficitFieldsValidateAgainstSchema();
  testLocalYellowFieldsValidateAgainstSchema();
  testFinishStatusFieldValidatesAgainstSchema();
  testMulticlassFieldValidatesAgainstSchema();
  testRaceEventsValidateAgainstSchema();
  testEventAndInfoLinesValidateAgainstSchema();
  testSessionWeatherValidatesAgainstSchema();
  await testMockProducerPasses();
  await testBadMode("missing-field", {}, "must have required property 'relationship'");
  await testBadMode("bad-type", {}, "/vehicles/0/position");
  await testBadMode("wrong-event-name", { timeoutMs: 1000 }, "MUST set the SSE `event:` field to `state`");
  await testBadMode("malformed-json", {}, "data is not valid JSON");
  await testEarlyDisconnect();
  await testOversizedFrame();

  console.log("\nAll compliance harness self-tests passed.");
}

main().catch((err) => {
  console.error(`\nself-test FAILED: ${err.message}`);
  process.exit(1);
});
