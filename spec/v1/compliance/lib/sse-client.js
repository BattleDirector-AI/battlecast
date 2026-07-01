// Minimal SSE client: connects to a producer's HTTP endpoint and emits parsed
// frames. Deliberately dependency-free (Node's built-in http/https only) so
// the compliance harness has no surprises about what it's actually sending
// over the wire.
//
// Emits:
//   'response' (res)         — once headers are received, before any frames
//   'frame'    ({event, data}) — once per blank-line-terminated SSE frame that
//                                 carried at least one `data:` line
//   'error'    (err)
//   'end'                    — server closed the connection

const http = require("http");
const https = require("https");
const { EventEmitter } = require("events");

class SSEClient extends EventEmitter {
  constructor(url) {
    super();
    this.url = new URL(url);
    this.req = null;
    this._buffer = "";
  }

  connect() {
    const mod = this.url.protocol === "https:" ? https : http;
    this.req = mod.get(
      this.url,
      { headers: { Accept: "text/event-stream" } },
      (res) => {
        this.emit("response", res);
        res.setEncoding("utf8");
        res.on("data", (chunk) => this._onChunk(chunk));
        res.on("end", () => this.emit("end"));
      }
    );
    this.req.on("error", (err) => this.emit("error", err));
    return this;
  }

  _onChunk(chunk) {
    // Normalize CRLF so frame boundaries (`\n\n`) match regardless of the
    // producer's line-ending choice.
    this._buffer += chunk.replace(/\r\n/g, "\n");
    let boundary;
    while ((boundary = this._buffer.indexOf("\n\n")) !== -1) {
      const rawFrame = this._buffer.slice(0, boundary);
      this._buffer = this._buffer.slice(boundary + 2);
      this._parseFrame(rawFrame);
    }
  }

  _parseFrame(rawFrame) {
    let eventName = "message";
    const dataLines = [];
    for (const line of rawFrame.split("\n")) {
      if (line.startsWith(":")) continue; // comment/heartbeat
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
      // id: and retry: fields are accepted per the SSE spec but irrelevant
      // to spec-v1 compliance, so they're intentionally ignored here.
    }
    if (dataLines.length === 0) return;
    this.emit("frame", { event: eventName, data: dataLines.join("\n") });
  }

  close() {
    if (this.req) this.req.destroy();
  }
}

module.exports = { SSEClient };
