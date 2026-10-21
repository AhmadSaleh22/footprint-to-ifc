import { describe, expect, test } from 'vitest'
import { toThree } from './axes'

describe('toThree', () => {
  test('1. maps core (x, y, z) to Three.js (x, z, -y)', () => {
    const v = toThree({ x: 1, y: 2 }, 3)
    expect([v.x, v.y, v.z]).toEqual([1, 3, -2])
  })

  test('1. the images of the core unit vectors form a matrix with determinant +1 (no mirroring)', () => {
    const ex = toThree({ x: 1, y: 0 }, 0)
    const ey = toThree({ x: 0, y: 1 }, 0)
    const ez = toThree({ x: 0, y: 0 }, 1)
    // determinant of the matrix with these three images as columns
    const det =
      ex.x * (ey.y * ez.z - ez.y * ey.z) - ey.x * (ex.y * ez.z - ez.y * ex.z) + ez.x * (ex.y * ey.z - ey.y * ex.z)
    expect(det).toBe(1)
  })

  test('core north is Three.js -z, core up is Three.js +y', () => {
    expect(toThree({ x: 0, y: 5 }, 0).z).toBe(-5)
    expect(toThree({ x: 0, y: 0 }, 7).y).toBe(7)
  })

  test('returns a new vector each time', () => {
    expect(toThree({ x: 1, y: 1 }, 1)).not.toBe(toThree({ x: 1, y: 1 }, 1))
  })
})
