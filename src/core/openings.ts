import { InvalidOpeningError } from './errors'
import type { Building, Wall } from './walls'

/** A rectangular window cut through the whole thickness of one wall. Metres. */
export type Opening = {
  /** `opening-${n}`, assigned by the store, starting at opening-1, never reused. */
  id: string
  /** A `Wall.id`. */
  wallId: string
  /** Along the wall's outer edge, from its outer start to the opening's near side. */
  offset: number
  /** Above z = 0, to the bottom of the opening. */
  sill: number
  /** Along the wall. */
  width: number
  height: number
}

const CLEARANCE = 0.1 // m, from the wall's ends, its top and bottom, and between openings
const MIN_SIZE = 0.1 // m

const wallAxis = (wall: Wall): { x: number; y: number } => {
  const [outerStart, outerEnd] = wall.polygon
  return { x: (outerEnd.x - outerStart.x) / wall.length, y: (outerEnd.y - outerStart.y) / wall.length }
}

/**
 * The part of a wall's outer edge where an opening may sit. An opening cuts through the whole thickness, so it must
 * fit where both faces exist: the inner start and inner end are projected onto the outer edge, and at a convex
 * corner the shorter inner face limits the range. A clearance of 0.1 m is kept from both ends.
 * @param wall A wall from core. Plan polygon in metres, local frame.
 * @returns `min` and `max` in metres along the outer edge from the outer start. Empty (`min > max`) on a wall too
 *   short for the clearances.
 */
export function openingRange(wall: Wall): { min: number; max: number } {
  const [outerStart, , innerEnd, innerStart] = wall.polygon
  const axis = wallAxis(wall)
  const along = (p: { x: number; y: number }): number => (p.x - outerStart.x) * axis.x + (p.y - outerStart.y) * axis.y
  return {
    min: Math.max(0, along(innerStart)) + CLEARANCE,
    max: Math.min(wall.length, along(innerEnd)) - CLEARANCE,
  }
}

const gap = (aStart: number, aSize: number, bStart: number, bSize: number): number =>
  Math.max(bStart - (aStart + aSize), aStart - (bStart + bSize))

/**
 * Checks that an opening fits a building, in this order: wall exists, sizes are finite and at least 0.1 m, the
 * opening lies inside the allowed range and 0.1 m clear of the top and bottom (a sill of 0, a door, is out of scope),
 * and it is at least 0.1 m from every other opening on the wall, horizontally or vertically.
 * @param building The building the opening is for. Metres, local frame.
 * @param openings The openings already on the building. An opening with the candidate's id is ignored.
 * @param candidate The opening to check. Metres.
 * @throws InvalidOpeningError `unknown-wall`, `invalid-size`, `outside-wall` or `overlaps-opening`.
 */
export function validateOpening(building: Building, openings: ReadonlyArray<Opening>, candidate: Opening): void {
  const wall = building.walls.find((w) => w.id === candidate.wallId)
  if (wall === undefined) throw new InvalidOpeningError('unknown-wall', `no wall ${candidate.wallId}`)

  const { offset, sill, width, height } = candidate
  if (![offset, sill, width, height].every(Number.isFinite) || width < MIN_SIZE || height < MIN_SIZE) {
    throw new InvalidOpeningError('invalid-size', 'offset, sill, width and height must be finite, width and height at least 0.1 m')
  }

  const range = openingRange(wall)
  if (!(range.min <= offset && offset + width <= range.max && sill >= CLEARANCE && sill + height <= wall.height - CLEARANCE)) {
    throw new InvalidOpeningError('outside-wall', `allowed offsets ${range.min} to ${range.max} m, sill from 0.1 m, top up to ${wall.height - CLEARANCE} m`)
  }

  for (const other of openings) {
    if (other.wallId !== candidate.wallId || other.id === candidate.id) continue
    const apart =
      gap(offset, width, other.offset, other.width) >= CLEARANCE || gap(sill, height, other.sill, other.height) >= CLEARANCE
    if (!apart) throw new InvalidOpeningError('overlaps-opening', `too close to ${other.id}`)
  }
}

/**
 * The outer face area left after the openings.
 * @param wall A wall from core. `faceArea` in square metres.
 * @param openings Any openings; only those on this wall count.
 * @returns Square metres: `wall.faceArea` minus width x height of each opening on the wall.
 */
export function netFaceArea(wall: Wall, openings: ReadonlyArray<Opening>): number {
  return openings.reduce((area, o) => (o.wallId === wall.id ? area - o.width * o.height : area), wall.faceArea)
}
