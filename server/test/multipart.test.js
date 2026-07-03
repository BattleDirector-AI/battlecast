import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMultipart, boundaryFromContentType, firstFilePart } from '../lib/multipart.js'

test('boundaryFromContentType extracts quoted and unquoted boundaries', () => {
  assert.equal(boundaryFromContentType('multipart/form-data; boundary=abc123'), 'abc123')
  assert.equal(boundaryFromContentType('multipart/form-data; boundary="a b c"'), 'a b c')
  assert.equal(boundaryFromContentType('text/plain'), null)
})

test('parseMultipart extracts a file part with its bytes intact', () => {
  const boundary = 'XBOUNDARYX'
  const bytes = Buffer.from([0, 1, 2, 254, 255, 13, 10]) // includes CR/LF bytes
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="logo.png"\r\n` +
        `Content-Type: image/png\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  const parts = parseMultipart(body, boundary)
  assert.equal(parts.length, 1)
  assert.equal(parts[0].name, 'file')
  assert.equal(parts[0].filename, 'logo.png')
  assert.equal(parts[0].contentType, 'image/png')
  assert.deepEqual(parts[0].data, bytes, 'binary payload is preserved exactly')
})

test('parseMultipart handles multiple parts and picks the file part', () => {
  const boundary = 'B'
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nhello\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="s.svg"\r\n` +
        `Content-Type: image/svg+xml\r\n\r\n<svg/>\r\n--${boundary}--\r\n`,
    ),
  ])
  const parts = parseMultipart(body, boundary)
  assert.equal(parts.length, 2)
  const file = firstFilePart(parts)
  assert.equal(file.filename, 's.svg')
  assert.equal(file.data.toString(), '<svg/>')
})

test('parseMultipart returns [] when the boundary is absent', () => {
  assert.deepEqual(parseMultipart(Buffer.from('nothing here'), 'MISSING'), [])
  assert.deepEqual(parseMultipart(Buffer.from('x'), null), [])
})
