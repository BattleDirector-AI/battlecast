import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withServer } from './helpers.js'

test('security: served SVG cannot execute as active content', async () => {
  await withServer(async ({ base }) => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>'
    // SVG logos are allowed (crisp sponsor art), so this uploads fine...
    let res = await fetch(`${base}/api/logos?name=sponsor.svg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.from(svg),
    })
    assert.equal(res.status, 201)

    // ...but when served, it is neutralized against direct-navigation XSS:
    // nosniff + a script-less, sandboxed CSP. (It still renders via <img>.)
    res = await fetch(`${base}/logos/sponsor.svg`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    const csp = res.headers.get('content-security-policy') || ''
    assert.match(csp, /default-src 'none'/)
    assert.match(csp, /sandbox/)
  })
})

test('security: malformed percent-encoding is a 400, not a 500', async () => {
  await withServer(async ({ base }) => {
    // A bare `%` is invalid percent-encoding; decoding must fail as a client error.
    assert.equal((await fetch(`${base}/api/profiles/%`)).status, 400)
    assert.equal((await fetch(`${base}/logos/%`)).status, 400)
    assert.equal((await fetch(`${base}/api/logos/%`, { method: 'DELETE' })).status, 400)
  })
})

test('security: static assets are served with nosniff', async () => {
  await withServer(async ({ base }) => {
    // Even the 503 path aside, real assets carry nosniff; here we assert on a
    // served logo (a static-like binary response) which also sets it.
    await fetch(`${base}/api/logos?name=x.png`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    })
    const res = await fetch(`${base}/logos/x.png`)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  })
})
