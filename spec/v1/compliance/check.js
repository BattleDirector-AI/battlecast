#!/usr/bin/env node
// battlecast spec v1 compliance harness — CLI entry point.
//
// Usage:
//   node check.js <sse-url> [--samples N] [--timeout-ms MS]
//   npm run check -- <sse-url>
//
// Connects to a producer's SSE endpoint as battlecast itself would, samples
// its `state` events, and validates each against spec/v1/schema.json plus
// the framing rules in spec/v1/SPEC.md. Exits 0 and prints PASS on
// conformance, exits 1 and prints FAIL with specific per-field/per-event
// messages otherwise.

const { runCheck, DEFAULT_SAMPLES, DEFAULT_TIMEOUT_MS } = require("./lib/run-check");

function parseArgs(argv) {
  const args = { samples: DEFAULT_SAMPLES, timeoutMs: DEFAULT_TIMEOUT_MS, url: null };
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === "--samples") {
      args.samples = Number(rest.shift());
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(rest.shift());
    } else if (!args.url) {
      args.url = arg;
    }
  }
  return args;
}

function printReport(result) {
  console.log(`battlecast spec v1 compliance check: ${result.url}\n`);

  for (const sample of result.samples) {
    if (sample.valid) {
      console.log(`  state event #${sample.index}: PASS`);
    } else {
      console.log(`  state event #${sample.index}: FAIL`);
      for (const err of sample.errors) console.log(`    - ${err}`);
    }
  }

  if (result.failures.length > 0) {
    if (result.samples.length > 0) console.log("");
    for (const failure of result.failures) console.log(`  ${failure}`);
  }

  console.log("");
  console.log(result.pass ? "PASS: producer conforms to spec v1." : "FAIL: producer does not conform to spec v1.");
}

async function main() {
  const { url, samples, timeoutMs } = parseArgs(process.argv.slice(2));
  if (!url) {
    console.error("Usage: node check.js <sse-url> [--samples N] [--timeout-ms MS]");
    process.exit(2);
  }

  const result = await runCheck(url, { samples, timeoutMs });
  printReport(result);
  process.exit(result.pass ? 0 : 1);
}

main();
