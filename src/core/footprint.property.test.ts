import fc from 'fast-check'
import proj4 from 'proj4'
import { describe, expect, test } from 'vitest'
import { footprintFromGeoJSON, normaliseRing } from './footprint'
import { signedArea } from './geometry'
import { starPolygon } from './testing/generators'

type P = { x: number; y: number }

const UTM33 = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'

const oracleSignedArea = (points: P[]): number => {
  const o = points[0]!
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += (a.x - o.x) * (b.y - o.y) - (b.x - o.x) * (a.y - o.y)
  }
  return sum / 2
}

const freeze = (points: P[]): P[] => {
  points.forEach((p) => Object.freeze(p))
  return Object.freeze(points) as P[]
}

describe('normaliseRing properties', () => {
  test('invariants 1, 2, 3, 6, 7, 8 on reversed and rotated star polygons', () => {
    fc.assert(
      fc.property(starPolygon, ({ ccw, variant }) => {
        const canonical = normaliseRing(ccw)
        const input = freeze(variant)
        const out = normaliseRing(input)

        // 1
        expect(out.length).toBeGreaterThanOrEqual(3)
        // 2
        expect(oracleSignedArea(out)).toBeGreaterThan(0)
        // 3
        for (let i = 0; i < out.length; i++) {
          const a = out[i]!
          const b = out[(i + 1) % out.length]!
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(0.001)
        }
        // 6: every output vertex is an input vertex, none added
        expect(out).toHaveLength(input.length)
        for (const v of out) expect(input.some((p) => p.x === v.x && p.y === v.y)).toBe(true)
        // 7: reversing or rotating the input gives exactly the same output
        expect(out).toEqual(canonical)
        // 8: no shared objects (the input is frozen, so a mutation would have thrown)
        for (const v of out) expect(input.includes(v)).toBe(false)
      }),
    )
  })
})

describe('footprintFromGeoJSON properties', () => {
  const LON0 = 13.4
  const LAT0 = 52.5
  const M_PER_DEG_LAT = 111_320
  const M_PER_DEG_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180)

  test('invariants 4 and 5 on star polygons around 13.4°E 52.5°N', () => {
    fc.assert(
      fc.property(starPolygon, fc.boolean(), ({ variant }, closeRing) => {
        const lonLat = variant.map((p) => [LON0 + (p.x - 500) / M_PER_DEG_LON, LAT0 + (p.y - 500) / M_PER_DEG_LAT])
        const coordinates = closeRing ? [...lonLat, lonLat[0]!] : lonLat
        const feature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } }

        const fp = footprintFromGeoJSON(feature, 10)

        // 4
        expect(Number.isInteger(fp.origin.easting)).toBe(true)
        expect(Number.isInteger(fp.origin.northing)).toBe(true)
        const minX = Math.min(...fp.ring.map((p) => p.x))
        const minY = Math.min(...fp.ring.map((p) => p.y))
        expect(minX).toBeGreaterThanOrEqual(0)
        expect(minX).toBeLessThan(1)
        expect(minY).toBeGreaterThanOrEqual(0)
        expect(minY).toBeLessThan(1)

        // 5: independent projection, matched one to one (rotation and reversal change the order)
        const expected = lonLat.map((p) => proj4('EPSG:4326', UTM33, p as [number, number]))
        expect(fp.ring).toHaveLength(expected.length)
        const unmatched = [...expected]
        for (const v of fp.ring) {
          const e = v.x + fp.origin.easting
          const n = v.y + fp.origin.northing
          const i = unmatched.findIndex(([ue, un]) => Math.hypot(ue! - e, un! - n) <= 1e-6)
          expect(i).toBeGreaterThanOrEqual(0)
          unmatched.splice(i, 1)
        }
        expect(unmatched).toHaveLength(0)
      }),
    )
  })
})

describe('signedArea precision', () => {
  const nonWhole = (min: number, max: number) =>
    fc.double({ min, max, noNaN: true }).filter((v) => !Number.isInteger(v))

  test('shifting a star polygon to UTM-sized coordinates does not change its area', () => {
    fc.assert(
      fc.property(starPolygon, nonWhole(300_000, 500_000), nonWhole(5_700_000, 5_900_000), ({ ccw }, dx, dy) => {
        const shifted = ccw.map((p) => ({ x: p.x + dx, y: p.y + dy }))
        expect(Math.abs(signedArea(shifted) - signedArea(ccw))).toBeLessThan(1e-5)
      }),
    )
  })
})
