// Core compliance check, independent of CLI concerns so it can be invoked
// programmatically (see test/self-test.js) as well as from check.js.

const { SSEClient } = require("./sse-client");
const { StatePayloadValidator } = require("./validator");

const DEFAULT_SAMPLES = 3;
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * @param {string} url producer SSE endpoint, e.g. http://localhost:8080/events
 * @param {{samples?: number, timeoutMs?: number}} [opts]
 * @returns {Promise<{pass: boolean, url: string, failures: string[], samples: Array<{index: number, valid: boolean, errors: string[]}>}>}
 */
function runCheck(url, opts = {}) {
  const samples = opts.samples || DEFAULT_SAMPLES;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const validator = new StatePayloadValidator();
    const client = new SSEClient(url);

    const failures = [];
    const results = [];
    let otherEventNames = new Set();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      client.close();

      if (results.length === 0) {
        if (otherEventNames.size > 0) {
          failures.unshift(
            `no \`state\`-named SSE events observed within ${timeoutMs}ms; ` +
              `received event(s) named ${[...otherEventNames].map((n) => `"${n}"`).join(", ")} instead — ` +
              "producer MUST set the SSE `event:` field to `state` (see SPEC.md 'Transport and message framing')"
          );
        } else {
          failures.unshift(
            `no SSE \`state\` events received within ${timeoutMs}ms — check the URL is a producer's SSE endpoint and that it emits \`event: state\` frames`
          );
        }
      }

      const invalidCount = results.filter((r) => !r.valid).length;
      resolve({
        pass: results.length > 0 && invalidCount === 0 && failures.length === 0,
        url,
        failures,
        samples: results,
      });
    };

    const timeoutHandle = setTimeout(finish, timeoutMs);

    client.on("response", (res) => {
      const contentType = res.headers["content-type"] || "";
      if (!contentType.includes("text/event-stream")) {
        failures.push(
          `HTTP response Content-Type was "${contentType || "(none)"}", expected "text/event-stream" ` +
            "(see SPEC.md 'Transport and message framing')"
        );
      }
      if (res.statusCode !== 200) {
        failures.push(`HTTP response status was ${res.statusCode}, expected 200`);
      }
      if (failures.length > 0) finish();
    });

    client.on("frame", ({ event, data }) => {
      if (settled) return;
      if (event !== "state") {
        otherEventNames.add(event);
        return;
      }

      const index = results.length;
      let payload;
      try {
        payload = JSON.parse(data);
      } catch (err) {
        results.push({
          index,
          valid: false,
          errors: [`data is not valid JSON: ${err.message}`],
        });
        if (results.length >= samples) finish();
        return;
      }

      const { valid, errors } = validator.validate(payload);
      results.push({ index, valid, errors });
      if (results.length >= samples) finish();
    });

    client.on("error", (err) => {
      failures.push(`connection error: ${err.message}`);
      finish();
    });

    client.on("end", () => {
      if (settled) return;
      if (results.length > 0 && results.length < samples) {
        failures.push(
          `producer closed the connection after ${results.length} state event(s), fewer than the requested ${samples} sample(s)`
        );
      }
      finish();
    });

    client.connect();
  });
}

module.exports = { runCheck, DEFAULT_SAMPLES, DEFAULT_TIMEOUT_MS };
