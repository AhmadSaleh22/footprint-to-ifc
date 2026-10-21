import { describe, expect, test } from 'vitest'
import { findSelfIntersection, isStrictlyInside, segmentsMeet } from './geometry'

type P = { x: number; y: number }
const ring = (...coords: Array<[number, number]>): P[] => coords.map(([x, y]) => ({ x, y }))

describe('findSelfIntersection', () => {
  test('returns null for a simple ring', () => {
    expect(findSelfIntersection(ring([0, 0], [10, 0], [10, 20], [0, 20]))).toBeNull()
  })

  test('returns null for a triangle, where every pair of edges is adjacent', () => {
    expect(findSelfIntersection(ring([0, 0], [10, 0], [0, 10]))).toBeNull()
  })

  test('returns the two edges of a crossing, smaller index first', () => {
    expect(findSelfIntersection(ring([0, 0], [10, 10], [10, 0], [0, 20]))).toEqual([0, 2])
  })

  test('reports a vertex touching a non-adjacent edge', () => {
    expect(findSelfIntersection(ring([0, 0], [10, 0], [10, 10], [5, 0], [0, 10]))).toEqual([0, 2])
  })

  test('does not report edges that only share a vertex, including the last and the first', () => {
    expect(findSelfIntersection(ring([0, 0], [4, 0], [4, 4], [2, 6], [0, 4]))).toBeNull()
  })

  test('reports collinear overlapping non-adjacent edges', () => {
    // edge 4 runs (7,0) to (3,0) and overlaps edge 0 (0,0) to (5,0) between x = 3 and x = 5
    const input = ring([0, 0], [5, 0], [5, 1], [7, 1], [7, 0], [3, 0], [3, -1], [0, -1])
    expect(findSelfIntersection(input)).toEqual([0, 4])
  })

  test('does not mutate its input', () => {
    const input = Object.freeze(ring([0, 0], [10, 10], [10, 0], [0, 20]).map((p) => Object.freeze(p)))
    expect(() => findSelfIntersection(input)).not.toThrow()
  })
})

describe('segmentsMeet', () => {
  test('crossing, touching at an end, and disjoint segments', () => {
    const origin = { x: 0, y: 0 }
    const right = { x: 10, y: 0 }
    expect(segmentsMeet(origin, right, { x: 5, y: -5 }, { x: 5, y: 5 })).toBe(true)
    expect(segmentsMeet(origin, right, { x: 5, y: -5 }, { x: 5, y: 0 })).toBe(true)
    expect(segmentsMeet(origin, { x: 5, y: 0 }, { x: 6, y: 0 }, { x: 9, y: 0 })).toBe(false)
    expect(segmentsMeet(origin, right, { x: 0, y: 1 }, { x: 10, y: 1 })).toBe(false)
  })
})

describe('isStrictlyInside', () => {
  const square = ring([0, 0], [10, 0], [10, 10], [0, 10])

  test('inside, outside', () => {
    expect(isStrictlyInside(square, { x: 5, y: 5 })).toBe(true)
    expect(isStrictlyInside(square, { x: 11, y: 5 })).toBe(false)
    expect(isStrictlyInside(square, { x: 5, y: -1 })).toBe(false)
  })

  test('a point on an edge or on a vertex is not strictly inside', () => {
    expect(isStrictlyInside(square, { x: 5, y: 0 })).toBe(false)
    expect(isStrictlyInside(square, { x: 10, y: 5 })).toBe(false)
    expect(isStrictlyInside(square, { x: 0, y: 0 })).toBe(false)
  })

  test('works for a concave ring and for either orientation', () => {
    const l = ring([0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10])
    expect(isStrictlyInside(l, { x: 2, y: 8 })).toBe(true)
    expect(isStrictlyInside(l, { x: 8, y: 8 })).toBe(false)
    expect(isStrictlyInside([...l].reverse(), { x: 2, y: 8 })).toBe(true)
  })
})
