/* Minimal multipart/form-data parser — just enough to extract file/field parts
 * from a browser FormData upload, with no third-party dependency (matching the
 * repo's zero-dep server ethos). Operates on the raw request Buffer. */

const CRLF = Buffer.from('\r\n')
const CRLFCRLF = Buffer.from('\r\n\r\n')

/** Extract the boundary token from a Content-Type header, or null. */
export function boundaryFromContentType(contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType || ''))
  if (!m) return null
  return (m[1] || m[2] || '').trim() || null
}

function parseHeaders(block) {
  const headers = {}
  for (const line of block.split('\r\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
  }
  return headers
}

/**
 * Parse a multipart body into parts: `{ name, filename, contentType, data }`,
 * where `data` is a Buffer. Returns [] if the boundary is not found. Tolerant of
 * the trailing `--boundary--` terminator and the optional preamble.
 */
export function parseMultipart(buffer, boundary) {
  if (!Buffer.isBuffer(buffer) || !boundary) return []
  const delimiter = Buffer.from(`--${boundary}`)
  const parts = []

  let pos = buffer.indexOf(delimiter)
  if (pos === -1) return parts
  pos += delimiter.length

  while (pos <= buffer.length) {
    // A `--` immediately after the delimiter marks the final boundary.
    if (buffer[pos] === 0x2d && buffer[pos + 1] === 0x2d) break
    // Skip the CRLF that follows the delimiter line.
    if (buffer.slice(pos, pos + 2).equals(CRLF)) pos += 2

    const next = buffer.indexOf(delimiter, pos)
    if (next === -1) break

    // The part spans [pos, next), minus the CRLF that precedes the next delimiter.
    let part = buffer.slice(pos, next)
    if (part.slice(-2).equals(CRLF)) part = part.slice(0, -2)

    const sep = part.indexOf(CRLFCRLF)
    if (sep !== -1) {
      const headers = parseHeaders(part.slice(0, sep).toString('utf8'))
      const disposition = headers['content-disposition'] || ''
      const nameMatch = /name="([^"]*)"/i.exec(disposition)
      const filenameMatch = /filename="([^"]*)"/i.exec(disposition)
      parts.push({
        name: nameMatch ? nameMatch[1] : null,
        filename: filenameMatch ? filenameMatch[1] : null,
        contentType: headers['content-type'] || null,
        data: part.slice(sep + CRLFCRLF.length),
      })
    }
    pos = next + delimiter.length
  }
  return parts
}

/** Convenience: the first part that carries a filename (i.e. a file upload). */
export function firstFilePart(parts) {
  return parts.find((p) => p.filename != null) || null
}
