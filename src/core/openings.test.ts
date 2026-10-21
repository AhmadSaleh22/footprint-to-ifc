import { describe, expect, test } from 'vitest'
import { InvalidOpeningError, type OpeningErrorReason } from './errors'
import { normaliseRing } from './footprint'
import { netFaceArea, openingRange, validateOpening, type Opening } from './openings'
import { buildWalls, type Building } from './walls'

type P = { x: number; y: number }
const pts = (...coords: Array<[number, number]>): P[] => coords.map(([x, y]) => ({ x, y }))

const building = (points: P[], thickness = 0.3, height = 12): Building =>
  buildWalls({ crs: 'EPSG:25833', origin: { easting: 0, northing: 0 }, ring: normaliseRing(points), height }, thickness)

const rectangle = (thickness = 0.3): Building => building(pts([0, 0], [10, 0], [10, 20], [0, 20]), thickness)
const lShape = (): Building => building(pts([0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]))

const opening = (over: Partial<Opening> = {}): Opening => ({
  id: 'opening-1',
  wallId: 'wall-0',
  offset: 4.4,
  sill: 0.9,
  width: 1.2,
  height: 1.4,
  ...over,
})

const expectReason = (run: () => void, reason: OpeningErrorReason) => {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidOpeningError)
    expect((error as InvalidOpeningError).reason).toBe(reason)
    return
  }
  throw new Error(`expected InvalidOpeningError(${reason}), nothing was thrown`)
}

const valid = (b: Building, openings: Opening[], candidate: Opening) =>
  expect(() => validateOpening(b, openings, candidate)).not.toThrow()

const invalid = (b: Building, openings: Opening[], candidate: Opening, reason: OpeningErrorReason) =>
  expectReason(() => validateOpening(b, openings, candidate), reason)

describe('InvalidOpeningError', () => {
  test('carries its reason and name, is an Error, and has a default message', () => {
    const error = new InvalidOpeningError('outside-wall')
    expect(error.reason).toBe('outside-wall')
    expect(error.name).toBe('InvalidOpeningError')
    expect(error).toBeInstanceOf(Error)
    expect(error.message.length).toBeGreaterThan(0)
    expect(new InvalidOpeningError('overlaps-opening', 'with opening-2').message).toBe('with opening-2')
  })
})

describe('1. openingRange', () => {
  test('wall-0 of the rectangle is [0.4, 9.6]', () => {
    const { min, max } = openingRange(rectangle().walls[0]!)
    expect(min).toBeCloseTo(0.4, 9)
    expect(max).toBeCloseTo(9.6, 9)
  })

  test('L-shape wall 2 (reflex corner at its end) is [0.4, 5.9]', () => {
    const { min, max } = openingRange(lShape().walls[2]!)
    expect(min).toBeCloseTo(0.4, 9)
    expect(max).toBeCloseTo(5.9, 9)
  })

  test('L-shape wall 3 (reflex corner at its start) is [0.1, 5.6]', () => {
    const { min, max } = openingRange(lShape().walls[3]!)
    expect(min).toBeCloseTo(0.1, 9)
    expect(max).toBeCloseTo(5.6, 9)
  })

  test('a thicker wall shrinks the range: thickness 0.5 gives [0.6, 9.4]', () => {
    const { min, max } = openingRange(rectangle(0.5).walls[0]!)
    expect(min).toBeCloseTo(0.6, 9)
    expect(max).toBeCloseTo(9.4, 9)
  })

  test('a wall too short for the clearances has an empty range (min > max)', () => {
    // 0.3 m wide end wall at thickness 0.1: inner face 0.1 m, minus two clearances
    const short = building(pts([0, 0], [10, 0], [10, 0.3], [0, 0.3]), 0.1).walls[1]!
    const { min, max } = openingRange(short)
    expect(min).toBeGreaterThan(max)
  })
})

describe('2. offset', () => {
  const b = rectangle()
  test('0.41 with width 1 is valid', () => valid(b, [], opening({ offset: 0.41, width: 1 })))
  test('0.35 is outside-wall', () => invalid(b, [], opening({ offset: 0.35, width: 1 }), 'outside-wall'))
  test('8.5 with width 1 is valid', () => valid(b, [], opening({ offset: 8.5, width: 1 })))
  test('8.5 with width 1.2 is outside-wall', () => invalid(b, [], opening({ offset: 8.5, width: 1.2 }), 'outside-wall'))
})

describe('3. sill and height', () => {
  const b = rectangle()
  test('sill 0.2 with height 11.6 is valid', () => valid(b, [], opening({ sill: 0.2, height: 11.6 })))
  test('sill 0.05 is outside-wall (doors are out of scope)', () => invalid(b, [], opening({ sill: 0.05 }), 'outside-wall'))
  test('sill 0 is outside-wall', () => invalid(b, [], opening({ sill: 0 }), 'outside-wall'))
  test('sill 0.2 with height 11.75 is outside-wall', () => invalid(b, [], opening({ sill: 0.2, height: 11.75 }), 'outside-wall'))
})

describe('4. invalid size and unknown wall', () => {
  const b = rectangle()
  test.each([
    ['width 0.05', { width: 0.05 }],
    ['height NaN', { height: Number.NaN }],
    ['offset Infinity', { offset: Number.POSITIVE_INFINITY }],
    ['sill NaN', { sill: Number.NaN }],
    ['height 0.05', { height: 0.05 }],
    ['negative width', { width: -1 }],
  ])('%s is invalid-size', (_name, over) => invalid(b, [], opening(over), 'invalid-size'))

  test('wall-99 is unknown-wall', () => invalid(b, [], opening({ wallId: 'wall-99' }), 'unknown-wall'))

  test('the first failing rule decides: unknown-wall beats invalid-size, invalid-size beats outside-wall', () => {
    invalid(b, [], opening({ wallId: 'wall-99', width: 0 }), 'unknown-wall')
    invalid(b, [], opening({ width: 0, offset: -5 }), 'invalid-size')
    invalid(b, [opening({ id: 'opening-2' })], opening({ offset: -5 }), 'outside-wall')
  })
})

describe('5. overlaps', () => {
  const b = rectangle()
  const first = opening({ id: 'opening-1', offset: 2, width: 1, sill: 0.9, height: 1.4 })

  test('offsets 2 and 3.05 (width 1) overlap', () => {
    invalid(b, [first], opening({ id: 'opening-2', offset: 3.05, width: 1 }), 'overlaps-opening')
  })
  test('offsets 2 and 3.2 are valid', () => {
    valid(b, [first], opening({ id: 'opening-2', offset: 3.2, width: 1 }))
  })
  test('stacked at the same offset with sills 0.5 and 2.2 (height 1.5) are valid', () => {
    const low = opening({ id: 'opening-1', sill: 0.5, height: 1.5 })
    valid(b, [low], opening({ id: 'opening-2', sill: 2.2, height: 1.5 }))
  })
  test('stacked with sills 0.5 and 2.05 overlap', () => {
    const low = opening({ id: 'opening-1', sill: 0.5, height: 1.5 })
    invalid(b, [low], opening({ id: 'opening-2', sill: 2.05, height: 1.5 }), 'overlaps-opening')
  })
  test('the order of the two rectangles does not matter', () => {
    invalid(b, [opening({ id: 'opening-2', offset: 3.05, width: 1 })], opening({ ...first }), 'overlaps-opening')
  })
  test('openings on other walls never overlap', () => {
    valid(b, [opening({ id: 'opening-2', wallId: 'wall-2' })], opening({ id: 'opening-1', wallId: 'wall-0' }))
  })
  test('an opening with the candidate id is ignored, so a list containing it can be re-validated', () => {
    valid(b, [first], first)
  })
  test('a rectangle inside another overlaps', () => {
    invalid(b, [first], opening({ id: 'opening-2', offset: 2.2, width: 0.5, sill: 1.1, height: 0.5 }), 'overlaps-opening')
  })
})

describe('validateOpening', () => {
  test('does not mutate its arguments', () => {
    const b = rectangle()
    const list = Object.freeze([Object.freeze(opening({ id: 'opening-1', offset: 2 }))])
    const candidate = Object.freeze(opening({ id: 'opening-2', offset: 6 }))
    expect(() => validateOpening(b, list, candidate)).not.toThrow()
  })
})

describe('1. invariant: valid openings lie inside the range', () => {
  test('an opening at the range limits plus a hair is valid and satisfies the inequalities', () => {
    const b = rectangle()
    const range = openingRange(b.walls[0]!)
    const o = opening({ offset: range.min + 0.01, width: range.max - range.min - 0.02 })
    valid(b, [], o)
    expect(range.min).toBeLessThanOrEqual(o.offset)
    expect(o.offset + o.width).toBeLessThanOrEqual(range.max)
  })
})

describe('6. netFaceArea', () => {
  const wall = rectangle().walls[0]!
  test('with no openings it is the face area', () => {
    expect(netFaceArea(wall, [])).toBeCloseTo(120, 9)
  })
  test('one 1.2 x 1.4 opening gives 118.32', () => {
    expect(netFaceArea(wall, [opening()])).toBeCloseTo(118.32, 9)
  })
  test('openings on other walls do not count; several on this wall add up', () => {
    const more = [opening(), opening({ id: 'opening-2', offset: 1, width: 1, height: 1 }), opening({ id: 'opening-3', wallId: 'wall-2', width: 5 })]
    expect(netFaceArea(wall, more)).toBeCloseTo(120 - 1.68 - 1, 9)
  })
})
