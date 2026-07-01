/* Test harness: boot the app on an ephemeral port against a throwaway data dir,
 * run the assertions, then tear everything down. Uses only Node built-ins +
 * global fetch (Node >= 22). */

import http from 'node:http'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../lib/createApp.js'

export async function withServer(run, { distDir } = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bc-server-'))
  const server = http.createServer(createApp({ dataDir, distDir }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  try {
    await run({ base, dataDir })
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await fs.rm(dataDir, { recursive: true, force: true })
  }
}

/** Build a minimal single-file multipart/form-data body as a Buffer. */
export function multipartBody(boundary, { field = 'file', filename, contentType, bytes }) {
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return Buffer.concat([head, Buffer.from(bytes), tail])
}
