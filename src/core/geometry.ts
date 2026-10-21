export type Point = { x: number; y: number }

/**
 * Signed area of a ring, positive when counter-clockwise (x east, y north).
 * Computed relative to the first vertex so absolute UTM values do not cost precision.
 * @param points Ring vertices in metres, at least one.
 * @returns Square metres.
 */
export const signedArea = (points: ReadonlyArray<Point>): number => {
  const o = points[0]!
  let twice = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    twice += (a.x - o.x) * (b.y - o.y) - (b.x - o.x) * (a.y - o.y)
  }
  return twice / 2
}


/**
 * Side of the line a-b that c lies on, from the sign of the float64 cross product (b - a) x (c - a), no tolerance.
 * @param a Point on the line, metres.
 * @param b Another point on the line, metres.
 * @param c Point to classify, metres.
 * @returns 1 to the left of a to b (counter-clockwise), -1 to the right, 0 when the cross product is exactly 0.
 */
export const orientation = (a: Point, b: Point, c: Point): number =>
  Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))

/** True when c, known to be collinear with a-b, lies within the bounding box of a-b. Metres. */
export const withinSegment = (a: Point, b: Point, c: Point): boolean =>
  Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y)

/**
 * True when the closed segments a-b and c-d share at least one point (touching counts). Exact float64 orientation
 * tests with no tolerance, so near-collinear input can be misclassified.
 * @param a First end of the first segment, metres.
 * @param b Second end of the first segment, metres.
 * @param c First end of the second segment, metres.
 * @param d Second end of the second segment, metres.
 */
export const segmentsMeet = (a: Point, b: Point, c: Point, d: Point): boolean => {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  return (
    (o1 === 0 && withinSegment(a, b, c)) ||
    (o2 === 0 && withinSegment(a, b, d)) ||
    (o3 === 0 && withinSegment(c, d, a)) ||
    (o4 === 0 && withinSegment(c, d, b))
  )
}

/**
 * Finds two non-adjacent edges of a ring that intersect or touch. Edge i runs from ring[i] to ring[i + 1];
 * edges i and i + 1 are adjacent, and so are the last and the first.
 * @param ring Ring vertices in metres, no repeated closing vertex.
 * @returns The indexes `[i, j]` with i < j of the first offending pair in scan order, or null when the ring is simple.
 */
export const findSelfIntersection = (ring: ReadonlyArray<Point>): [number, number] | null => {
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % n]!
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (segmentsMeet(a, b, ring[j]!, ring[(j + 1) % n]!)) return [i, j]
    }
  }
  return null
}

/**
 * True when the point lies strictly inside the ring: not outside and not on its boundary.
 * @param ring Ring vertices in metres, either orientation, no repeated closing vertex.
 * @param p Point to test, metres, same frame as the ring.
 */
export const isStrictlyInside = (ring: ReadonlyArray<Point>, p: Point): boolean => {
  let inside = false
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    if (orientation(a, b, p) === 0 && withinSegment(a, b, p)) return false
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) inside = !inside
  }
  return inside
}
