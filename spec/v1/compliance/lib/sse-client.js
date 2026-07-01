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

// Guards against a misbehaving producer that never sends a blank-line frame
// terminator (or sends one enormous line): without a cap the buffer would
// grow unbounded until the process runs out of memory.
const MAX_BUFFER_BYTES = 1_000_000;

class SSEClient extends EventEmitter {
  constructor(url) {
    super();
    this.url = new URL(url);
    this.req = null;
    this._buffer = "";
    this._sawFirstChunk = false;
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
    if (!this._sawFirstChunk) {
      this._sawFirstChunk = true;
      // Strip a leading UTF-8 BOM so it doesn't corrupt the first `event:`
      // line's prefix match.
      if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
    }
    this._buffer += chunk;
    // Normalize CRLF so frame boundaries (`\n\n`) match regardless of the
    // producer's line-ending choice. Done on the accumulated buffer (not the
    // incoming chunk alone) so a `\r\n` split across two chunks still
    // normalizes correctly instead of leaving a stray `\r` embedded in a
    // field value.
    this._buffer = this._buffer.replace(/\r\n/g, "\n");

    if (this._buffer.length > MAX_BUFFER_BYTES) {
      this.emit(
        "error",
        new Error(
          `SSE buffer exceeded ${MAX_BUFFER_BYTES} bytes without a blank-line frame terminator`
        )
      );
      this.close();
      return;
    }

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
