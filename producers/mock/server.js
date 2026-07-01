// battlecast mock producer — reference HTTP + SSE server for frontend dev.
//
// Run:   npm start            (from producers/mock/)
//   or:  node producers/mock/server.js
//
// Then connect battlecast (or any SSE client) to:
//   http://localhost:8080/events
//
// Behaviour: implements the producer side of spec v1 (see spec/v1/SPEC.md). The
// producer is the SERVER; battlecast connects out to it as a client. On GET
// /events we open a text/event-stream and emit `state` events on a fixed
// interval, replaying the spec-v1 fixtures from spec/v1/fixtures/ in a loop so
// the standings tower and battle box can be exercised against real snapshots.
//
// Env overrides: PORT (default 8080), INTERVAL_MS (default 750).

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8080;
const INTERVAL_MS = Number(process.env.INTERVAL_MS) || 750;
const SSE_PATH = "/events";

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "spec", "v1", "fixtures");

// Fixtures to replay, in cycle order. These are the source of truth for test
// data; the server does not synthesise payloads of its own.
const FIXTURE_FILES = [
  "race-close-battle.json",
  "race-no-battle.json",
  "race-idle-battle.json",
];

function loadFixtures() {
  return FIXTURE_FILES.map((name) => {
    const full = path.join(FIXTURES_DIR, name);
    const raw = fs.readFileSync(full, "utf8");
    return { name, payload: JSON.parse(raw) };
  });
}

const fixtures = loadFixtures();
if (fixtures.length === 0) {
  console.error("No fixtures loaded; aborting.");
  process.exit(1);
}

function sendState(res, fixture) {
  // SSE framing: named `state` event, one complete JSON snapshot per event.
  res.write("event: state\n");
  res.write(`data: ${JSON.stringify(fixture.payload)}\n\n`);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain", Allow: "GET" });
    res.end("Method Not Allowed\n");
    return;
  }

  if (req.url !== SSE_PATH) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`Not Found. SSE endpoint is GET ${SSE_PATH}\n`);
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  console.log(`[mock] client connected: ${req.socket.remoteAddress}`);

  let i = 0;
  // Emit the first snapshot immediately so a freshly connected client can
  // render without waiting a full interval.
  sendState(res, fixtures[i % fixtures.length]);
  i += 1;

  const timer = setInterval(() => {
    sendState(res, fixtures[i % fixtures.length]);
    i += 1;
  }, INTERVAL_MS);

  req.on("close", () => {
    clearInterval(timer);
    console.log("[mock] client disconnected");
  });
});

server.listen(PORT, () => {
  console.log(`[mock] battlecast mock producer listening on http://localhost:${PORT}`);
  console.log(`[mock] SSE endpoint: GET http://localhost:${PORT}${SSE_PATH}`);
  console.log(`[mock] emitting 'state' every ${INTERVAL_MS}ms, cycling ${fixtures.length} fixture(s): ${fixtures.map((f) => f.name).join(", ")}`);
});
