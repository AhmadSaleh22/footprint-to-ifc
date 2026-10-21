import { InvalidBuildingError, InvalidFootprintError } from './errors'
import { normaliseRing, type Footprint } from './footprint'
import { findSelfIntersection, isStrictlyInside, segmentsMeet, signedArea, type Point } from './geometry'

/** One straight wall along a footprint edge. Local metres, x east, y north, same frame as the footprint ring. */
export type Wall = {
  /** `wall-${index}`, stable for the same footprint. */
  id: string
  /** The footprint edge this wall runs along: ring[index] to ring[index + 1]. */
  index: number
  /** Plan outline, counter-clockwise: outer start, outer end, inner end, inner start. Metres. */
  polygon: [Point, Point, Point, Point]
  /** Metres, length of the outer edge. */
  length: number
  /** Metres. */
  thickness: number
  /** Metres, from the footprint. */
  height: number
  /** Square metres, area of `polygon`. */
  planArea: number
  /** Square metres, length x height: the outer face before openings. */
  faceArea: number
}

/** A footprint with walls. Local metres, x east, y north. */
export type Building = {
  /** A copy of the input footprint. */
  footprint: Footprint
  /** Metres. */
  thickness: number
  /** The footprint offset inward by `thickness`, with mitred corners. Local metres, same vertex order as the ring. */
  inner: Point[]
  /** One per footprint edge, in ring order. */
  walls: Wall[]
}

const MIN_THICKNESS = 0.001 // m, the same minimum as an edge
const MIN_INNER_EDGE = 0.001 // m
const MIN_MITRE_DENOMINATOR = 1e-6 // 1 + n1·n2, a mitre of about 1,400 times the thickness

const copy = (p: Point): Point => ({ x: p.x, y: p.y })

const tooLarge = (check: string, detail: string): InvalidBuildingError =>
  new InvalidBuildingError('thickness-too-large', `${check}: ${detail}`)

/** Step 1: the footprint must be what step 01 produces. */
const assertValidFootprint = (footprint: Footprint): void => {
  let normalised: Point[]
  try {
    normalised = normaliseRing(footprint.ring)
  } catch (error) {
    if (error instanceof InvalidFootprintError) throw new InvalidBuildingError('invalid-footprint', error.message)
    throw error
  }
  const { ring } = footprint
  const same = normalised.length === ring.length && ring.every((p, i) => p.x === normalised[i]!.x && p.y === normalised[i]!.y)
  if (!same) throw new InvalidBuildingError('invalid-footprint', 'ring is not normalised: orientation, start vertex or duplicate vertices')
  if (!Number.isFinite(footprint.height) || footprint.height <= 0) {
    throw new InvalidBuildingError('invalid-footprint', `height ${String(footprint.height)}`)
  }
}

/** Step 3: inward unit normal of every edge ring[i] to ring[i + 1]. The ring is counter-clockwise, so inward is left. */
const inwardNormals = (ring: ReadonlyArray<Point>): Point[] =>
  ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
  })

/** Step 4: the footprint offset inward by `thickness`, with mitred corners. */
const mitredRing = (ring: ReadonlyArray<Point>, thickness: number): Point[] => {
  const normals = inwardNormals(ring)
  return ring.map((vertex, i) => {
    const n1 = normals[(i - 1 + ring.length) % ring.length]!
    const n2 = normals[i]!
    const denominator = 1 + n1.x * n2.x + n1.y * n2.y
    if (!(denominator >= MIN_MITRE_DENOMINATOR)) throw tooLarge('4', `corner ${i} is too sharp (1 + n1·n2 = ${denominator})`)
    const scale = thickness / denominator
    const inner = { x: vertex.x + scale * (n1.x + n2.x), y: vertex.y + scale * (n1.y + n2.y) }
    if (!Number.isFinite(inner.x) || !Number.isFinite(inner.y)) throw tooLarge('4', `inner vertex ${i} is not finite`)
    return inner
  })
}

/** Step 5a: every inner edge points the same way as its outer edge and is at least 1 mm long. */
const assertEdgesForward = (ring: ReadonlyArray<Point>, inner: ReadonlyArray<Point>): void => {
  inner.forEach((a, i) => {
    const b = inner[(i + 1) % inner.length]!
    const outerStart = ring[i]!
    const outerEnd = ring[(i + 1) % ring.length]!
    const dot = (b.x - a.x) * (outerEnd.x - outerStart.x) + (b.y - a.y) * (outerEnd.y - outerStart.y)
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (!(dot > 0) || !(length >= MIN_INNER_EDGE)) {
      throw tooLarge('5a', `inner edge ${i} reverses or is shorter than 1 mm (length ${length})`)
    }
  })
}

/** Step 5d: the inner ring lies inside the footprint and its edges never meet an outer edge. */
const assertInsideFootprint = (ring: ReadonlyArray<Point>, inner: ReadonlyArray<Point>): void => {
  inner.forEach((vertex, i) => {
    if (!isStrictlyInside(ring, vertex)) throw tooLarge('5d', `inner vertex ${i} is not strictly inside the footprint`)
  })
  inner.forEach((a, i) => {
    const b = inner[(i + 1) % inner.length]!
    ring.forEach((c, j) => {
      if (segmentsMeet(a, b, c, ring[(j + 1) % ring.length]!)) throw tooLarge('5d', `inner edge ${i} meets outer edge ${j}`)
    })
  })
}

/** Step 5: the inner ring must be a valid inset of the footprint. The first failing check decides the message. */
const assertValidInner = (ring: ReadonlyArray<Point>, inner: ReadonlyArray<Point>): void => {
  assertEdgesForward(ring, inner)
  const crossing = findSelfIntersection(inner)
  if (crossing !== null) throw tooLarge('5b', `inner edges ${crossing[0]} and ${crossing[1]} intersect`)
  if (!(signedArea(inner) > 0)) throw tooLarge('5c', 'inner ring is not counter-clockwise')
  assertInsideFootprint(ring, inner)
}

/** Step 6: wall `i` between outer edge i and inner edge i, made of new point objects. */
const wallAt = (i: number, ring: ReadonlyArray<Point>, inner: ReadonlyArray<Point>, thickness: number, height: number): Wall => {
  const next = (i + 1) % ring.length
  const polygon: [Point, Point, Point, Point] = [copy(ring[i]!), copy(ring[next]!), copy(inner[next]!), copy(inner[i]!)]
  const length = Math.hypot(ring[next]!.x - ring[i]!.x, ring[next]!.y - ring[i]!.y)
  return { id: `wall-${i}`, index: i, polygon, length, thickness, height, planArea: signedArea(polygon), faceArea: length * height }
}

/**
 * Turns a footprint into a building: one straight wall per footprint edge, with mitred corners, so the walls
 * cover the band between the footprint and its inward offset exactly once. Edges are never dropped: if a true
 * offset would make an edge disappear, the thickness is rejected.
 * @param footprint A footprint as produced by step 01 (counter-clockwise, normalised). Local metres, x east, y north.
 * @param thickness Wall thickness in metres, finite and at least 0.001.
 * @returns A building in the same frame and unit. The input is not mutated and no objects are shared with it.
 * @throws InvalidBuildingError `invalid-footprint`, `invalid-thickness` or `thickness-too-large`.
 */
export function buildWalls(footprint: Footprint, thickness: number): Building {
  assertValidFootprint(footprint)
  if (!Number.isFinite(thickness) || thickness < MIN_THICKNESS) {
    throw new InvalidBuildingError('invalid-thickness', `thickness ${String(thickness)}`)
  }
  const { ring, height } = footprint
  const inner = mitredRing(ring, thickness)
  assertValidInner(ring, inner)
  return {
    footprint: { crs: footprint.crs, origin: { ...footprint.origin }, ring: ring.map(copy), height },
    thickness,
    inner,
    walls: ring.map((_, i) => wallAt(i, ring, inner, thickness, height)),
  }
}
