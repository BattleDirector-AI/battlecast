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
//   simulate (default) — one continuously evolving multi-class session, shared
//     by every connected client (like a real broadcast), driven by
//     simulate.js. It auto-cycles through qualifying → grid → race → results →
//     (loop): running order, gaps, and battles emerge and change over time, and
//     each phase classifies the field on its own terms, instead of replaying a
//     handful of fixed scenarios. Phase transitions are logged below.
//   fixtures — the original deterministic behavior: each connection
//     independently cycles through the spec-v1 fixtures in
//     spec/v1/fixtures/, which remain the source of truth for the app's
//     behavioral tests (see CONTRIBUTING.md).
//
// Env overrides: PORT (default 8080), INTERVAL_MS (default 750),
// SIM_DT_SECONDS (default 2 — sim-seconds of race time advanced per tick), and
// the per-phase durations in SIM seconds QUALI_SECONDS (300), GRID_SECONDS (30),
// RACE_SECONDS (300), RESULTS_SECONDS (30) — see simulate.js / README.md.
//
// PHASE (or a 3rd CLI arg, e.g. `simulate race`) locks simulate mode to one session
// type — qualifying|grid|race|results — for eye-testing, instead of cycling them.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { createSimulator, PHASES } = require("./simulate.js");

const PORT = Number(process.env.PORT) || 8080;
const INTERVAL_MS = Number(process.env.INTERVAL_MS) || 750;
const SIM_DT_SECONDS = Number(process.env.SIM_DT_SECONDS) || 2;
const SSE_PATH = "/events";
const MODE = (process.argv[2] || process.env.MODE || "simulate").toLowerCase();

// Optional single-phase lock for eye-testing one session type (simulate mode only):
//   node producers/mock/server.js simulate race   — or   PHASE=race make dev
// Locks the simulator to that phase (qualifying|grid|race|results) instead of cycling.
// An unrecognized value is ignored with a warning (normal cycling).
const LOCK_PHASE_RAW = (process.argv[3] || process.env.PHASE || "").trim().toLowerCase();
const LOCK_PHASE = LOCK_PHASE_RAW && PHASES.includes(LOCK_PHASE_RAW) ? LOCK_PHASE_RAW : null;
if (LOCK_PHASE_RAW && !LOCK_PHASE) {
  console.warn(`[mock] ignoring PHASE="${LOCK_PHASE_RAW}" — expected one of: ${PHASES.join(", ")}`);
}

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "spec", "v1", "fixtures");

// Fixtures replayed in `fixtures` mode, in cycle order. These are the source
// of truth for test data; the server does not synthesise payloads of its own
// in this mode.
const FIXTURE_FILES = [
  "race-close-battle.json",
  "race-no-battle.json",
  "race-idle-battle.json",
  "race-pre-class-best.json",
  "race-class-best.json",
  "qualifying-target.json",
  "qualifying-sector-a.json",
  "qualifying-no-timing.json",
  "race-session-fcy.json",
  "race-session-partial.json",
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
  const simulator = createSimulator({
    // Log every phase transition (and the opening phase) on the mock's prefixed
    // stdout so a tester watching the overlay can see qualifying → grid → race →
    // results boundaries as they happen.
    onPhaseChange: (phase, simClock) => {
      console.log(`[mock] phase → ${phase} (sim-clock ${simClock}s)`);
    },
    // When set, lock the simulator to a single session type for eye-testing.
    lockPhase: LOCK_PHASE,
  });

  // Sub-step the simulator several times per cadence interval and broadcast on a
  // subject change AS SOON as it happens, rather than only on the fixed interval.
  // This honors the spec's non-normative latency SHOULD (spec/v1/SPEC.md): on a
  // camera cut the producer emits promptly (here within one sub-step, ≤ ~150 ms)
  // so battlecast's lower-thirds fire crisply against the live mock. Steady state
  // still emits at ~INTERVAL_MS; the total sim-time advanced per real second is
  // unchanged (SUBSTEPS × STEP_DT === SIM_DT_SECONDS), and the director's on-camera
  // dwell is time-based in simulate.js, so cut frequency is unchanged too.
  const SUBSTEPS = Math.max(1, Math.ceil(INTERVAL_MS / 150));
  const STEP_MS = Math.max(1, Math.round(INTERVAL_MS / SUBSTEPS));
  const STEP_DT = SIM_DT_SECONDS / SUBSTEPS;

  let latest = simulator.step(STEP_DT);
  let lastSubject = latest.subject && latest.subject.slot_id != null ? latest.subject.slot_id : null;
  let lastMode = latest.mode;
  let msSinceEmit = 0;
  const clients = new Set();

  const broadcast = () => {
    const payload = frame(latest);
    for (const res of clients) res.write(payload);
  };

  setInterval(() => {
    latest = simulator.step(STEP_DT);
    msSinceEmit += STEP_MS;
    const subject = latest.subject && latest.subject.slot_id != null ? latest.subject.slot_id : null;
    // A camera cut OR a phase transition (mode change) is a meaningful change
    // worth emitting promptly, so the new phase's first snapshot and the re-cut
    // it carries reach the overlay within one sub-step rather than a full tick.
    const cut = subject !== lastSubject || latest.mode !== lastMode;
    // Emit on a camera cut immediately, or once the cadence interval has elapsed.
    if (cut || msSinceEmit >= INTERVAL_MS) {
      lastSubject = subject;
      lastMode = latest.mode;
      msSinceEmit = 0;
      broadcast();
    }
  }, STEP_MS);

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
    `[mock] mode: simulate — ` +
      (LOCK_PHASE
        ? `LOCKED to the ${LOCK_PHASE} phase (looping fresh legs)`
        : `one live multi-class session cycling qualifying → grid → race → results`) +
      `, ${SIM_DT_SECONDS}s of race time per ${INTERVAL_MS}ms tick ` +
      `(sub-stepped ${SUBSTEPS}× every ${STEP_MS}ms; emits promptly on a subject or phase change)`,
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
