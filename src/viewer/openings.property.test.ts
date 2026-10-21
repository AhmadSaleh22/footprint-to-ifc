import * as THREE from 'three'
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { openingRange, validateOpening, type Building, type Opening, InvalidOpeningError } from '../core'
import { toThree } from './axes'
import { wallGeometry } from './meshes'
import { fixtureBuilding } from './testing/buildings'
import { uniform } from '../core/testing/generators'
import { closedProblems, signedVolume, trianglesOf } from './testing/geometry'

const building: Building = fixtureBuilding()
const HEIGHT = building.footprint.height
const VOLUME_TOLERANCE = 1e-4 // m³

/** Four uniform draws in [0, 1] per attempted opening; the real values come from the wall's range. */
const attempts = fc.array(fc.array(fc.tuple(uniform(0, 1), uniform(0, 1), uniform(0, 1), uniform(0, 1)), { minLength: 1, maxLength: 4 }), {
  minLength: building.walls.length,
  maxLength: building.walls.length,
})

/** Turns the draws into openings that are valid: an attempt that overlaps an earlier one is dropped. */
const openingsFrom = (draws: Array<Array<[number, number, number, number]>>): Opening[] => {
  const list: Opening[] = []
  let n = 0
  building.walls.forEach((wall, w) => {
    const { min, max } = openingRange(wall)
    for (const [uOffset, uWidth, uSill, uHeight] of draws[w]!) {
      const offset = min + uOffset * Math.max(0, max - min - 0.1)
      const width = 0.1 + uWidth * Math.min(3, Math.max(0, max - offset - 0.1))
      const sill = 0.1 + uSill * (HEIGHT - 0.4)
      const height = 0.1 + uHeight * Math.max(0, HEIGHT - 0.1 - sill - 0.1)
      const candidate: Opening = { id: `opening-${n + 1}`, wallId: wall.id, offset, sill, width, height }
      try {
        validateOpening(building, list, candidate)
      } catch (error) {
        if (error instanceof InvalidOpeningError) continue
        throw error
      }
      list.push(candidate)
      n++
    }
  })
  return list
}

const rayHits = (geometry: THREE.BufferGeometry, origin: THREE.Vector3, direction: THREE.Vector3): boolean => {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ side: THREE.FrontSide }))
  mesh.updateMatrixWorld()
  return new THREE.Raycaster(origin, direction.clone().normalize()).intersectObject(mesh, false).length > 0
}

describe('11. random valid openings on the fixture building', () => {
  test('keep invariants 1 to 4 (range, closed geometry, volume, rays)', () => {
    fc.assert(
      fc.property(attempts, (draws) => {
        const openings = openingsFrom(draws as Array<Array<[number, number, number, number]>>)
        expect(openings.length).toBeGreaterThanOrEqual(building.walls.length) // at least one per wall
        for (const wall of building.walls) {
          const own = openings.filter((o) => o.wallId === wall.id)
          const range = openingRange(wall)

          // 1
          for (const o of own) {
            expect(range.min).toBeLessThanOrEqual(o.offset)
            expect(o.offset + o.width).toBeLessThanOrEqual(range.max)
          }

          const geometry = wallGeometry(wall, own)
          const triangles = trianglesOf(geometry)

          // 2
          expect(triangles).toHaveLength(12 + 20 * own.length)
          expect(closedProblems(triangles)).toEqual([])

          // 3
          const expected = wall.planArea * wall.height - own.reduce((sum, o) => sum + o.width * o.height * wall.thickness, 0)
          const error = Math.abs(signedVolume(triangles) - expected)
          expect(error, `volume error ${error} on ${wall.id} with ${own.length} openings`).toBeLessThan(VOLUME_TOLERANCE)

          // 4: a ray from 0.5 m outside the opening centre, along the exact inward normal, passes through
          const [p0, p1] = wall.polygon
          const axis = { x: (p1.x - p0.x) / wall.length, y: (p1.y - p0.y) / wall.length }
          const inward = { x: -axis.y, y: axis.x }
          for (const o of own) {
            const u = o.offset + o.width / 2
            const centre = { x: p0.x + u * axis.x, y: p0.y + u * axis.y }
            const direction = toThree({ x: inward.x, y: inward.y }, 0)
            const origin = (v: number) => toThree({ x: centre.x - 0.5 * inward.x, y: centre.y - 0.5 * inward.y }, v)
            expect(rayHits(geometry, origin(o.sill + o.height / 2), direction), `${o.id} is open`).toBe(false)
            // control: same u, at v = sill / 2, solid wall below the opening. Another, stacked opening can sit
            // there, so the control only applies where no other opening covers that point.
            const covered = own.some(
              (other) => other !== o && other.offset <= u && u <= other.offset + other.width && other.sill <= o.sill / 2 && o.sill / 2 <= other.sill + other.height,
            )
            if (!covered) expect(rayHits(geometry, origin(o.sill / 2), direction), `${o.id} control hits`).toBe(true)
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})
