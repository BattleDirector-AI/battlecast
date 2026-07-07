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

async function main() {
  testSessionFixturesValidateAgainstSchema();
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
