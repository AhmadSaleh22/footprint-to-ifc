import fc from 'fast-check'
import { expect, test } from 'vitest'

test('placeholder: addition is commutative', () => {
  fc.assert(fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a))
  expect(true).toBe(true)
})
