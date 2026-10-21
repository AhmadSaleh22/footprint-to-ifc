import { expect } from 'vitest'
import { buildWalls, type Building } from '../walls'

// Test-only. Every check here is written separately from src/core/geometry.ts, so the walls are not checked
// against the code that produced them.

type P = { x: number; y: number }

const cross = (o: P, a: P, b: P): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** Shoelace area relative to the first vertex. Positive when counter-clockwise. */
export const oracleArea = (points: ReadonlyArray<P>): number => {
  const o = points[0]!
  let twice = 0
  points.forEach((a, i) => {
    twice += cross(o, a, points[(i + 1) % points.length]!)
  })
  return twice / 2
}

const distanceToSegment = (p: P, a: P, b: P): number => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

const distanceToLine = (p: P, a: P, b: P): number => Math.abs(cross(a, b, p)) / Math.hypot(b.x - a.x, b.y - a.y)

/** Winding number of a ring around a point. Not 0 means inside. Valid when the point is not on the ring. */
const windingNumber = (ring: ReadonlyArray<P>, p: P): number => {
  let winding = 0
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]!
    if (a.y <= p.y && b.y > p.y && cross(a, b, p) > 0) winding++
    else if (a.y > p.y && b.y <= p.y && cross(a, b, p) < 0) winding--
  })
  return winding
}

const strictlyInside = (ring: ReadonlyArray<P>, p: P): boolean => {
  const onBoundary = ring.some((a, i) => distanceToSegment(p, a, ring[(i + 1) % ring.length]!) < 1e-12)
  return !onBoundary && windingNumber(ring, p) !== 0
}

/** True when the closed segments share a point, with a parametric solution instead of orientation signs. */
const segmentsShareAPoint = (a: P, b: P, c: P, d: P): boolean => {
  const r = { x: b.x - a.x, y: b.y - a.y }
  const s = { x: d.x - c.x, y: d.y - c.y }
  const denominator = r.x * s.y - r.y * s.x
  const ca = { x: c.x - a.x, y: c.y - a.y }
  if (Math.abs(denominator) < 1e-300) {
    if (Math.abs(ca.x * r.y - ca.y * r.x) > 1e-12 * Math.hypot(r.x, r.y)) return false
    const rr = r.x * r.x + r.y * r.y
    const t0 = (ca.x * r.x + ca.y * r.y) / rr
    const t1 = t0 + (s.x * r.x + s.y * r.y) / rr
    return Math.max(Math.min(t0, t1), 0) <= Math.min(Math.max(t0, t1), 1)
  }
  const t = (ca.x * s.y - ca.y * s.x) / denominator
  const u = (ca.x * r.y - ca.y * r.x) / denominator
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

const unitNormals = (polygon: ReadonlyArray<P>): P[] =>
  polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
  })

/** Largest gap over all separating axes (unit normals of every edge of both polygons). Negative = overlap depth. */
const largestGap = (p: ReadonlyArray<P>, q: ReadonlyArray<P>): number => {
  let best = -Infinity
  for (const axis of [...unitNormals(p), ...unitNormals(q)]) {
    const a = p.map((v) => v.x * axis.x + v.y * axis.y)
    const b = q.map((v) => v.x * axis.x + v.y * axis.y)
    best = Math.max(best, Math.min(...b) - Math.max(...a), Math.min(...a) - Math.max(...b))
  }
  return best
}

/** Invariants 1 to 7 of specs/02-walls.md, checked on a Building returned by buildWalls. */
export function expectBuildingInvariants(building: Building): void {
  const { footprint, inner, walls, thickness } = building
  const ring = footprint.ring
  const n = ring.length

  // 1
  expect(walls).toHaveLength(n)
  walls.forEach((wall, i) => {
    expect(wall.index).toBe(i)
    expect(wall.id).toBe(`wall-${i}`)
  })
  expect(inner).toHaveLength(n)

  // 2
  for (const wall of walls) {
    const q = wall.polygon
    expect(wall.planArea).toBeGreaterThan(0)
    expect(Math.abs(wall.planArea - oracleArea(q))).toBeLessThan(1e-6)
    for (let k = 0; k < 4; k++) expect(cross(q[k]!, q[(k + 1) % 4]!, q[(k + 2) % 4]!)).toBeGreaterThan(0)
  }

  // 3: shared edges are exactly equal and are distinct objects
  walls.forEach((wall, i) => {
    const next = walls[(i + 1) % n]!
    expect([wall.polygon[1].x, wall.polygon[1].y]).toEqual([next.polygon[0].x, next.polygon[0].y])
    expect([wall.polygon[2].x, wall.polygon[2].y]).toEqual([next.polygon[3].x, next.polygon[3].y])
    expect(wall.polygon[1]).not.toBe(next.polygon[0])
    expect(wall.polygon[2]).not.toBe(next.polygon[3])
  })

  // 4: each inner vertex is `thickness` away from the lines of both edges that meet at it
  inner.forEach((v, i) => {
    const before = [ring[(i - 1 + n) % n]!, ring[i]!] as const
    const after = [ring[i]!, ring[(i + 1) % n]!] as const
    expect(Math.abs(distanceToLine(v, ...before) - thickness)).toBeLessThan(1e-6)
    expect(Math.abs(distanceToLine(v, ...after) - thickness)).toBeLessThan(1e-6)
  })

  // 5: inner vertices strictly inside, no inner edge meets an outer edge
  for (const v of inner) expect(strictlyInside(ring, v)).toBe(true)
  inner.forEach((a, i) => {
    const b = inner[(i + 1) % n]!
    ring.forEach((c, j) => {
      expect(segmentsShareAPoint(a, b, c, ring[(j + 1) % n]!), `inner edge ${i} meets outer edge ${j}`).toBe(false)
    })
  })

  // 6: no two walls overlap (adjacent pairs included)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      expect(largestGap(walls[i]!.polygon, walls[j]!.polygon), `walls ${i} and ${j}`).toBeGreaterThanOrEqual(-1e-9)
    }
  }

  // 7
  expect(buildWalls(footprint, thickness)).toEqual(building)
}
