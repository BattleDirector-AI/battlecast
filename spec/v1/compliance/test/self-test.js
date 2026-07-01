// Self-test for the compliance harness itself: proves it (a) passes the
// reference mock producer (issue #3) and (b) fails a deliberately
// non-compliant stream with a clear, specific message, per the acceptance
// criteria on the harness issue. Run with `npm test` from spec/v1/compliance/.

const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const { runCheck } = require("../lib/run-check");

const MOCK_PRODUCER = path.resolve(__dirname, "..", "..", "..", "..", "producers", "mock", "server.js");
const BAD_PRODUCER = path.resolve(__dirname, "bad-producer.js");

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

async function main() {
  await testMockProducerPasses();
  await testBadMode("missing-field", {}, "must have required property 'relationship'");
  await testBadMode("bad-type", {}, "/vehicles/0/position");
  await testBadMode("wrong-event-name", { timeoutMs: 1000 }, "MUST set the SSE `event:` field to `state`");
  await testBadMode("malformed-json", {}, "data is not valid JSON");

  console.log("\nAll compliance harness self-tests passed.");
}

main().catch((err) => {
  console.error(`\nself-test FAILED: ${err.message}`);
  process.exit(1);
});
