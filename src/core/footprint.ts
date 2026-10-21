import proj4 from 'proj4'
import { InvalidFootprintError } from './errors'
import { findSelfIntersection, signedArea, type Point } from './geometry'

/** A footprint in local metres. Z-up, right-handed: x = east, y = north. */
export type Footprint = {
  crs: 'EPSG:25833'
  /** Whole metres in EPSG:25833. Added to `ring` to get absolute coordinates. */
  origin: { easting: number; northing: number }
  /** Counter-clockwise, no repeated closing vertex. Metres relative to `origin`. */
  ring: Array<{ x: number; y: number }>
  /** Metres. */
  height: number
}

const UTM33 = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
const toUtm33 = proj4('EPSG:4326', UTM33)

const MIN_EDGE = 0.001 // m
const MIN_AREA = 0.01 // m²
const LON_RANGE = [12, 18] as const // degrees
const LAT_RANGE = [0, 84] as const // degrees

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Steps 6a and 6b: copy the ring and drop vertices closer than 1 mm to the last kept one. */
const dropNearDuplicates = (points: ReadonlyArray<Point>): Point[] => {
  const kept: Point[] = []
  for (const p of points) {
    const last = kept[kept.length - 1]
    if (last === undefined || distance(p, last) >= MIN_EDGE) kept.push({ x: p.x, y: p.y })
  }
  while (kept.length > 1 && distance(kept[kept.length - 1]!, kept[0]!) < MIN_EDGE) kept.pop()
  return kept
}

/** Step 6e: throws when two non-adjacent edges intersect or touch. */
const assertSimple = (ring: ReadonlyArray<Point>): void => {
  const pair = findSelfIntersection(ring)
  if (pair !== null) throw new InvalidFootprintError('self-intersection', `edges ${pair[0]} and ${pair[1]} intersect`)
}

/** Step 6g: rotate so the ring starts at the vertex with the lowest y, ties broken by the lowest x. */
const startAtLowest = (ring: Point[]): Point[] => {
  let start = 0
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i]!
    const s = ring[start]!
    if (p.y < s.y || (p.y === s.y && p.x < s.x)) start = i
  }
  return [...ring.slice(start), ...ring.slice(0, start)]
}

/**
 * Planar normalisation of a footprint ring: removes the closing vertex and vertices closer than 1 mm,
 * rejects degenerate or self-intersecting rings, makes the ring counter-clockwise and starts it at the
 * lowest vertex (lowest y, then lowest x). No vertex is added or moved.
 * @param points Ring vertices in metres, any planar frame with x east and y north, with or without a repeated closing vertex.
 * @returns A new ring in the same frame and unit, counter-clockwise, no repeated closing vertex.
 * @throws InvalidFootprintError `too-few-vertices`, `zero-area` or `self-intersection`.
 */
export function normaliseRing(points: ReadonlyArray<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const ring = dropNearDuplicates(points)
  if (ring.length < 3) throw new InvalidFootprintError('too-few-vertices', `${ring.length} vertices left`)
  const area = signedArea(ring)
  if (Math.abs(area) < MIN_AREA) throw new InvalidFootprintError('zero-area', `area ${area} m²`)
  assertSimple(ring)
  if (area < 0) ring.reverse()
  return startAtLowest(ring)
}

/** Step 1: the single exterior ring of a GeoJSON Polygon Feature, as raw positions. */
const exteriorRing = (feature: unknown): unknown[] => {
  const geometry = isRecord(feature) && feature.type === 'Feature' ? feature.geometry : undefined
  if (!isRecord(geometry) || geometry.type !== 'Polygon') throw new InvalidFootprintError('unsupported-geometry')
  const rings = geometry.coordinates
  if (!Array.isArray(rings) || rings.length !== 1 || !Array.isArray(rings[0])) {
    throw new InvalidFootprintError('unsupported-geometry', 'expected a Polygon with exactly one ring')
  }
  return rings[0] as unknown[]
}

/** Steps 3 and 4: every position must be finite `[longitude, latitude]` inside the zone. */
const readLonLat = (positions: unknown[]): Array<[number, number]> => {
  const lonLat = positions.map((position, i): [number, number] => {
    const lon: unknown = Array.isArray(position) ? position[0] : undefined
    const lat: unknown = Array.isArray(position) ? position[1] : undefined
    if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) {
      throw new InvalidFootprintError('invalid-coordinate', `position ${i} is not [longitude, latitude]`)
    }
    return [lon, lat]
  })
  lonLat.forEach(([lon, lat], i) => {
    const inZone = lon >= LON_RANGE[0] && lon <= LON_RANGE[1] && lat >= LAT_RANGE[0] && lat <= LAT_RANGE[1]
    if (!inZone) throw new InvalidFootprintError('outside-zone', `position ${i} (${lon}, ${lat}) is outside zone 33`)
  })
  return lonLat
}

/**
 * Turns a GeoJSON building footprint into a normalised ring in local metres, with the georeference kept apart.
 * @param feature GeoJSON Feature with a Polygon geometry of one ring. Positions are `[longitude, latitude]` in
 *   degrees (WGS84, RFC 7946), longitude 12 to 18 and latitude 0 to 84. A third value is ignored.
 * @param height Building height in metres, finite and greater than 0.
 * @returns A footprint in EPSG:25833. `ring` is in metres relative to `origin`, x east and y north.
 * @throws InvalidFootprintError With the reason of the first pipeline step that fails.
 */
export function footprintFromGeoJSON(feature: unknown, height: number): Footprint {
  const positions = exteriorRing(feature)
  if (!isFiniteNumber(height) || height <= 0) throw new InvalidFootprintError('invalid-height', `height ${String(height)}`)
  const projected = readLonLat(positions).map((lonLat) => {
    const [x, y] = toUtm33.forward(lonLat)
    return { x: x!, y: y! }
  })
  const ring = normaliseRing(projected)
  const easting = Math.floor(Math.min(...ring.map((p) => p.x)))
  const northing = Math.floor(Math.min(...ring.map((p) => p.y)))
  return {
    crs: 'EPSG:25833',
    origin: { easting, northing },
    ring: ring.map((p) => ({ x: p.x - easting, y: p.y - northing })),
    height,
  }
}
