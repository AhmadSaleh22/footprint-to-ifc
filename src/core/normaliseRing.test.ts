import { describe, expect, test } from 'vitest'
import { InvalidFootprintError } from './errors'
import { normaliseRing } from './footprint'

type P = { x: number; y: number }

const ring = (...coords: Array<[number, number]>): P[] => coords.map(([x, y]) => ({ x, y }))

const signedArea = (points: P[]): number => {
  const o = points[0]!
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += (a.x - o.x) * (b.y - o.y) - (b.x - o.x) * (a.y - o.y)
  }
  return sum / 2
}

const expectReason = (input: P[], reason: string) => {
  try {
    normaliseRing(input)
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidFootprintError)
    expect((error as InvalidFootprintError).reason).toBe(reason)
    return
  }
  throw new Error(`expected InvalidFootprintError(${reason}), nothing was thrown`)
}

const deepFreeze = (points: P[]): P[] => {
  points.forEach((p) => Object.freeze(p))
  return Object.freeze(points) as P[]
}

const RECT = ring([0, 0], [10, 0], [10, 20], [0, 20])

describe('orientation, closing vertex, start vertex', () => {
  test('1. clockwise rectangle becomes counter-clockwise from the lowest-y, lowest-x vertex', () => {
    const out = normaliseRing(ring([0, 0], [0, 20], [10, 20], [10, 0]))
    expect(out).toEqual(RECT)
    expect(Math.abs(signedArea(out) - 200)).toBeLessThan(1e-9)
  })

  test('2. counter-clockwise rectangle with a repeated closing vertex gives the same 4 vertices', () => {
    expect(normaliseRing(ring([0, 0], [10, 0], [10, 20], [0, 20], [0, 0]))).toEqual(RECT)
  })

  test('start vertex ties on y are broken by the lowest x', () => {
    expect(normaliseRing(ring([10, 0], [10, 20], [0, 20], [0, 0]))).toEqual(RECT)
  })
})

describe('near-duplicate vertices', () => {
  test('3. an exactly repeated (10,0) is dropped', () => {
    expect(normaliseRing(ring([0, 0], [10, 0], [10, 0], [10, 20], [0, 20]))).toEqual(RECT)
  })

  test('3. (10.0005,0) inserted after (10,0) is dropped and (10,0) is kept', () => {
    expect(normaliseRing(ring([0, 0], [10, 0], [10.0005, 0], [10, 20], [0, 20]))).toEqual(RECT)
  })

  test('3. (10.0015,0) inserted after (10,0) is kept', () => {
    const out = normaliseRing(ring([0, 0], [10, 0], [10.0015, 0], [10, 20], [0, 20]))
    expect(out).toEqual(ring([0, 0], [10, 0], [10.0015, 0], [10, 20], [0, 20]))
  })

  test('a near-duplicate of the first vertex at the end drops the last vertex, not the first', () => {
    expect(normaliseRing(ring([0, 0], [10, 0], [10, 20], [0, 20], [0.0005, 0]))).toEqual(RECT)
  })

  test('several trailing near-duplicates of the first vertex are all dropped', () => {
    const out = normaliseRing(ring([0, 0], [10, 0], [10, 20], [0, 20], [0.0004, 0], [0.0002, 0]))
    expect(out).toEqual(RECT)
  })
})

describe('self-intersection', () => {
  test('4. crossing ring (area 50) throws self-intersection', () => {
    expectReason(ring([0, 0], [10, 10], [10, 0], [0, 20]), 'self-intersection')
  })

  test('5. a vertex touching a non-adjacent edge throws self-intersection', () => {
    expectReason(ring([0, 0], [10, 0], [10, 10], [5, 0], [0, 10]), 'self-intersection')
  })

  test('5. doubling-back ring (area 25) throws self-intersection', () => {
    expectReason(ring([0, 0], [10, 0], [5, 0], [5, 10]), 'self-intersection')
  })

  test('adjacent collinear edges that continue in the same direction are allowed', () => {
    const out = normaliseRing(ring([0, 0], [5, 0], [10, 0], [10, 10], [0, 10]))
    expect(out).toEqual(ring([0, 0], [5, 0], [10, 0], [10, 10], [0, 10]))
  })

  test('the closing edge doubling back over the first edge throws', () => {
    // closing edge (5,0)->(0,0) runs back over the first edge (0,0)->(10,0)
    expectReason(ring([0, 0], [10, 0], [10, 10], [5, 0]), 'self-intersection')
  })

  test('the closing edge continuing the first edge in the same direction is allowed', () => {
    // closing edge (0,0)->(5,0) and first edge (5,0)->(10,0) are collinear and point the same way
    const out = normaliseRing(ring([5, 0], [10, 0], [10, 10], [0, 10], [0, 0]))
    expect(out).toEqual(ring([0, 0], [5, 0], [10, 0], [10, 10], [0, 10]))
  })

  test('two non-adjacent edges that cross in a larger ring throw self-intersection', () => {
    expectReason(ring([0, 0], [20, 0], [20, 20], [5, 20], [5, -5], [0, 5]), 'self-intersection')
  })
})

describe('too few vertices and zero area', () => {
  test('6. two vertices throw too-few-vertices', () => {
    expectReason(ring([0, 0], [10, 0]), 'too-few-vertices')
  })

  test('6. three vertices that collapse to two throw too-few-vertices', () => {
    expectReason(ring([0, 0], [10, 0], [10, 0.0005]), 'too-few-vertices')
  })

  test('6. a spike (0,0) (10,0) (0,0) throws too-few-vertices', () => {
    expectReason(ring([0, 0], [10, 0], [0, 0]), 'too-few-vertices')
  })

  test('empty input throws too-few-vertices', () => {
    expectReason([], 'too-few-vertices')
  })

  test('7. collinear vertices throw zero-area', () => {
    expectReason(ring([0, 0], [5, 0], [10, 0]), 'zero-area')
  })

  test('area just below 0.01 m² throws zero-area, just above passes', () => {
    expectReason(ring([0, 0], [1, 0], [0, 0.019]), 'zero-area')
    expect(normaliseRing(ring([0, 0], [1, 0], [0, 0.021]))).toHaveLength(3)
  })

  test('zero-area is reported before self-intersection (symmetric bow-tie has area 0)', () => {
    expectReason(ring([0, 0], [1, 1], [1, 0], [0, 1]), 'zero-area')
  })

  test('the area threshold applies at UTM-sized coordinates', () => {
    const e = 391_234.123456
    const n = 5_818_765.654321
    // areas 0.0105 m² and 0.0095 m², either side of the 0.01 m² threshold
    expect(normaliseRing(ring([e, n], [e + 1, n], [e, n + 0.021]))).toHaveLength(3)
    expectReason(ring([e, n], [e + 1, n], [e, n + 0.019]), 'zero-area')
  })
})

describe('input handling', () => {
  test('the input is not mutated (frozen input does not throw, order unchanged)', () => {
    const input = deepFreeze(ring([0, 20], [10, 20], [10, 0], [0, 0], [0, 20]))
    const snapshot = JSON.stringify(input)
    normaliseRing(input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  test('the output shares no objects with the input', () => {
    const input = ring([0, 0], [10, 0], [10, 20], [0, 20])
    const out = normaliseRing(input)
    for (const p of out) expect(input.includes(p)).toBe(false)
  })
})
