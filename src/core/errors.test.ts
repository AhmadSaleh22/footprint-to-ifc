import { expect, test } from 'vitest'
import { InvalidFootprintError } from './errors'

test('InvalidFootprintError carries its reason', () => {
  const error = new InvalidFootprintError('zero-area')
  expect(error.reason).toBe('zero-area')
  expect(error.name).toBe('InvalidFootprintError')
})

test('InvalidFootprintError is an Error and survives instanceof checks', () => {
  const error = new InvalidFootprintError('outside-zone', 'longitude 11.9')
  expect(error).toBeInstanceOf(Error)
  expect(error).toBeInstanceOf(InvalidFootprintError)
  expect(error.message).toBe('longitude 11.9')
})

test('InvalidFootprintError has a non-empty default message', () => {
  const error = new InvalidFootprintError('self-intersection')
  expect(error.message.length).toBeGreaterThan(0)
})
