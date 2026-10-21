import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { InvalidBuildingError } from './errors'
import { normaliseRing, type Footprint } from './footprint'
import { expectBuildingInvariants } from './testing/building-invariants'
import { gentleStarPolygon, starPolygon, uniform } from './testing/generators'
import { buildWalls } from './walls'

type P = { x: number; y: number }

/** Every generated ring goes through normaliseRing, so it satisfies the step 01 invariants. */
const footprintOf = (points: P[]): Footprint => ({
  crs: 'EPSG:25833',
  origin: { easting: 0, northing: 0 },
  ring: normaliseRing(points),
  height: 10,
})

/** Reverses the ring and starts it at another vertex, so normaliseRing has work to do. */
const shuffled = (points: P[], reverse: boolean, start: number): P[] => {
  const ordered = reverse ? [...points].reverse() : points
  const s = start % ordered.length
  return [...ordered.slice(s), ...ordered.slice(0, s)]
}

const centre = fc.record({ cx: uniform(0, 1000), cy: uniform(0, 1000) })
const fraction = uniform(0, 1)
const scramble = fc.record({ reverse: fc.boolean(), start: fc.nat(100) })

describe('must succeed', () => {
  test('rectangles with sides 1 to 100 m and thickness below 0.45 x the shorter side', () => {
    fc.assert(
      fc.property(
        uniform(1, 100),
        uniform(1, 100),
        centre,
        fraction,
        scramble,
        (w, h, { cx, cy }, u, { reverse, start }) => {
          const shorter = Math.min(w, h)
          const thickness = 0.01 + u * (0.45 * shorter - 0.01)
          const corners = [{ x: cx, y: cy }, { x: cx + w, y: cy }, { x: cx + w, y: cy + h }, { x: cx, y: cy + h }]
          const building = buildWalls(footprintOf(shuffled(corners, reverse, start)), thickness)
          expectBuildingInvariants(building)
        },
      ),
    )
  })

  test('regular polygons with 3 to 12 sides, circumradius 2 to 100 m and thickness below 0.9 x the inradius', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 12 }),
        uniform(2, 100),
        uniform(0, 2 * Math.PI),
        centre,
        fraction,
        scramble,
        (sides, radius, phase, { cx, cy }, u, { reverse, start }) => {
          const inradius = radius * Math.cos(Math.PI / sides)
          const thickness = 0.01 + u * (0.9 * inradius - 0.01)
          const corners = Array.from({ length: sides }, (_, i) => ({
            x: cx + radius * Math.cos(phase + (2 * Math.PI * i) / sides),
            y: cy + radius * Math.sin(phase + (2 * Math.PI * i) / sides),
          }))
          const building = buildWalls(footprintOf(shuffled(corners, reverse, start)), thickness)
          expectBuildingInvariants(building)
        },
      ),
    )
  })
})

describe('star polygons', () => {
  const RUNS = 200
  const MIN_SUCCESS_RATE = 0.8

  /** Runs the property over a star generator; returns how many cases built a building. */
  const runStars = (stars: typeof starPolygon): number => {
    let succeeded = 0
    fc.assert(
      fc.property(stars, uniform(0.01, 1), ({ variant }, thickness) => {
        let building
        try {
          building = buildWalls(footprintOf(variant), thickness)
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidBuildingError)
          expect((error as InvalidBuildingError).reason).toBe('thickness-too-large')
          return
        }
        succeeded++
        expectBuildingInvariants(building)
      }),
      { numRuns: RUNS },
    )
    return succeeded
  }

  test('spiky stars, thickness 0.01 to 1 m: each case throws thickness-too-large or satisfies the invariants', () => {
    const succeeded = runStars(starPolygon)
    console.info(`spiky stars: ${succeeded} of ${RUNS} runs succeeded (no threshold)`)
  })

  test(`gentle stars, thickness 0.01 to 1 m: each case throws thickness-too-large or satisfies the invariants, and at least ${MIN_SUCCESS_RATE * 100}% succeed`, () => {
    const succeeded = runStars(gentleStarPolygon)
    const rate = succeeded / RUNS
    console.info(`gentle stars: ${succeeded} of ${RUNS} runs succeeded (${(rate * 100).toFixed(1)}%)`)
    expect(rate, `success rate ${rate}`).toBeGreaterThanOrEqual(MIN_SUCCESS_RATE)
  })
})
