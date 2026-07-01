import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeLogoFilename,
  assertProfileName,
  assertProfileBody,
  contentTypeForFile,
  ValidationError,
} from '../lib/validation.js'

test('sanitizeLogoFilename strips paths, lowercases, and constrains the stem', () => {
  assert.equal(sanitizeLogoFilename('Logo.PNG'), 'logo.png')
  assert.equal(sanitizeLogoFilename('../../etc/passwd.png'), 'passwd.png')
  assert.equal(sanitizeLogoFilename('C:\\team\\Sponsor Name!.JPG'), 'sponsor-name-.jpg')
  assert.equal(sanitizeLogoFilename('a/b/c.webp'), 'c.webp')
})

test('sanitizeLogoFilename rejects non-image and nameless inputs', () => {
  assert.throws(() => sanitizeLogoFilename('malware.exe'), ValidationError)
  assert.throws(() => sanitizeLogoFilename('noextension'), ValidationError)
  assert.throws(() => sanitizeLogoFilename(''), ValidationError)
  assert.throws(() => sanitizeLogoFilename('.png'), ValidationError) // no usable stem
})

test('assertProfileName allows safe ids and rejects traversal/illegal', () => {
  assert.equal(assertProfileName('race-01_A'), 'race-01_A')
  assert.throws(() => assertProfileName('bad..name'), ValidationError)
  assert.throws(() => assertProfileName('has/slash'), ValidationError)
  assert.throws(() => assertProfileName(''), ValidationError)
  assert.throws(() => assertProfileName('a'.repeat(65)), ValidationError)
})

test('assertProfileBody accepts objects, rejects arrays/primitives/bad widgets', () => {
  assert.doesNotThrow(() => assertProfileBody({ configVersion: '1' }))
  assert.throws(() => assertProfileBody([]), ValidationError)
  assert.throws(() => assertProfileBody('nope'), ValidationError)
  assert.throws(() => assertProfileBody({ widgets: [] }), ValidationError)
})

test('contentTypeForFile maps known image extensions and rejects others', () => {
  assert.equal(contentTypeForFile('a.png'), 'image/png')
  assert.equal(contentTypeForFile('a.JPG'), 'image/jpeg')
  assert.equal(contentTypeForFile('a.svg'), 'image/svg+xml')
  assert.equal(contentTypeForFile('a.txt'), null)
})
