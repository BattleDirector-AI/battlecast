// Deliberately non-compliant SSE producer, used only by test/self-test.js to
// prove the harness actually catches spec-v1 violations rather than always
// passing. Not a real reference implementation — see producers/mock/ for
// that.
//
// Env: PORT (required), BAD_MODE — one of:
//   missing-field     valid JSON, but `relationship` is absent entirely
//   bad-type          `vehicles[0].position` is 0 (schema minimum is 1)
//   wrong-event-name  otherwise-valid payload sent as `event: update`
//   malformed-json    `data:` payload is not parseable JSON

const http = require("http");

const PORT = Number(process.env.PORT);
const BAD_MODE = process.env.BAD_MODE || "missing-field";

const basePayload = {
  schemaVersion: "1",
  mode: "race",
  vehicles: [
    { slot_id: "car-1", driver_name: "Test Driver", vehicle_class: "GT3", position: 1 },
  ],
  subject: { slot_id: "car-1", driver_name: "Test Driver" },
  relationship: { battle_intensity: 0.5 },
};

function buildFrame() {
  if (BAD_MODE === "missing-field") {
    const { relationship, ...rest } = basePayload;
    return { event: "state", data: JSON.stringify(rest) };
  }
  if (BAD_MODE === "bad-type") {
    const payload = JSON.parse(JSON.stringify(basePayload));
    payload.vehicles[0].position = 0;
    return { event: "state", data: JSON.stringify(payload) };
  }
  if (BAD_MODE === "wrong-event-name") {
    return { event: "update", data: JSON.stringify(basePayload) };
  }
  if (BAD_MODE === "malformed-json") {
    return { event: "state", data: "{not valid json" };
  }
  throw new Error(`unknown BAD_MODE: ${BAD_MODE}`);
}

const server = http.createServer((req, res) => {
  if (req.url !== "/events") {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const frame = buildFrame();
  const emit = () => {
    res.write(`event: ${frame.event}\n`);
    res.write(`data: ${frame.data}\n\n`);
  };
  emit();
  const timer = setInterval(emit, 200);
  req.on("close", () => clearInterval(timer));
});

server.listen(PORT, () => {
  console.log(`[bad-producer] listening on http://localhost:${PORT}/events (BAD_MODE=${BAD_MODE})`);
});
