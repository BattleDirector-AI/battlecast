// battlecast mock producer — reference HTTP + SSE server for frontend dev.
//
// Run:   npm start                     (live race simulator, the default)
//   or:  npm run start:fixtures        (deterministic fixture cycling)
//   or:  node producers/mock/server.js [simulate|fixtures]
//
// Then connect battlecast (or any SSE client) to:
//   http://localhost:8080/events
//
// Behaviour: implements the producer side of spec v1 (see spec/v1/SPEC.md). The
// producer is the SERVER; battlecast connects out to it as a client. On GET
// /events we open a text/event-stream and emit `state` events.
//
// Two modes:
//   simulate (default) — one continuously evolving multi-class race, shared
//     by every connected client (like a real broadcast), driven by
//     simulate.js. Running order, gaps, and battles emerge and change over
//     time instead of replaying a handful of fixed scenarios.
//   fixtures — the original deterministic behavior: each connection
//     independently cycles through the spec-v1 fixtures in
//     spec/v1/fixtures/, which remain the source of truth for the app's
//     behavioral tests (see CONTRIBUTING.md).
//
// Env overrides: PORT (default 8080), INTERVAL_MS (default 750),
// SIM_DT_SECONDS (default 2 — sim-seconds of race time advanced per tick).

const http = require("http");
const fs = require("fs");
const path = require("path");
const { createSimulator } = require("./simulate.js");

const PORT = Number(process.env.PORT) || 8080;
const INTERVAL_MS = Number(process.env.INTERVAL_MS) || 750;
const SIM_DT_SECONDS = Number(process.env.SIM_DT_SECONDS) || 2;
const SSE_PATH = "/events";
const MODE = (process.argv[2] || process.env.MODE || "simulate").toLowerCase();

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "spec", "v1", "fixtures");

// Fixtures replayed in `fixtures` mode, in cycle order. These are the source
// of truth for test data; the server does not synthesise payloads of its own
// in this mode.
const FIXTURE_FILES = [
  "race-close-battle.json",
  "race-no-battle.json",
  "race-idle-battle.json",
  "race-class-best.json",
  "qualifying-target.json",
];

function loadFixtures() {
  return FIXTURE_FILES.map((name) => {
    const full = path.join(FIXTURES_DIR, name);
    const raw = fs.readFileSync(full, "utf8");
    return { name, payload: JSON.parse(raw) };
  });
}

function frame(payload) {
  // SSE framing: named `state` event, one complete JSON snapshot per event.
  return `event: state\ndata: ${JSON.stringify(payload)}\n\n`;
}

function startServer(onRequest) {
  const server = http.createServer(onRequest);
  server.listen(PORT, () => {
    console.log(`[mock] battlecast mock producer listening on http://localhost:${PORT}`);
    console.log(`[mock] SSE endpoint: GET http://localhost:${PORT}${SSE_PATH}`);
  });
  return server;
}

function rejectNonSse(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain", Allow: "GET" });
    res.end("Method Not Allowed\n");
    return true;
  }
  if (req.url !== SSE_PATH) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`Not Found. SSE endpoint is GET ${SSE_PATH}\n`);
    return true;
  }
  return false;
}

function openSse(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
}

// ---- simulate mode: one shared race, broadcast to every connected client ----
function runSimulateMode() {
  const simulator = createSimulator();
  let latest = simulator.step(SIM_DT_SECONDS);
  const clients = new Set();

  setInterval(() => {
    latest = simulator.step(SIM_DT_SECONDS);
    const payload = frame(latest);
    for (const res of clients) res.write(payload);
  }, INTERVAL_MS);

  startServer((req, res) => {
    if (rejectNonSse(req, res)) return;
    openSse(res);
    console.log(`[mock] client connected: ${req.socket.remoteAddress}`);
    clients.add(res);
    res.write(frame(latest));

    req.on("close", () => {
      clients.delete(res);
      console.log("[mock] client disconnected");
    });
  });

  console.log(
    `[mock] mode: simulate — one live multi-class race, ${SIM_DT_SECONDS}s of race time per ${INTERVAL_MS}ms tick`,
  );
}

// ---- fixtures mode: each connection independently cycles the fixtures ----
function runFixturesMode() {
  const fixtures = loadFixtures();
  if (fixtures.length === 0) {
    console.error("No fixtures loaded; aborting.");
    process.exit(1);
  }

  startServer((req, res) => {
    if (rejectNonSse(req, res)) return;
    openSse(res);
    console.log(`[mock] client connected: ${req.socket.remoteAddress}`);

    let i = 0;
    // Emit the first snapshot immediately so a freshly connected client can
    // render without waiting a full interval.
    res.write(frame(fixtures[i % fixtures.length].payload));
    i += 1;

    const timer = setInterval(() => {
      res.write(frame(fixtures[i % fixtures.length].payload));
      i += 1;
    }, INTERVAL_MS);

    req.on("close", () => {
      clearInterval(timer);
      console.log("[mock] client disconnected");
    });
  });

  console.log(
    `[mock] mode: fixtures — cycling ${fixtures.length} fixture(s): ${fixtures.map((f) => f.name).join(", ")}`,
  );
}

if (MODE === "fixtures") {
  runFixturesMode();
} else if (MODE === "simulate") {
  runSimulateMode();
} else {
  console.error(`[mock] unknown mode "${MODE}" — expected "simulate" or "fixtures"`);
  process.exit(1);
}
