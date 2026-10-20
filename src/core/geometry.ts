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

