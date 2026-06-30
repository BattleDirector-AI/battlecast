import { describe, it, expect } from 'vitest'
import Counter from './lib/Counter.svelte'

describe('app smoke test', () => {
  it('compiles the Counter component to a callable', () => {
    expect(typeof Counter).toBe('function')
  })
})
