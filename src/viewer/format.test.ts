import { describe, expect, test } from 'vitest'
import { formatWallDetails, parseThickness } from './format'
import { rectangleBuilding } from './testing/buildings'

describe('parseThickness', () => {
  test.each([[''], ['   '], ['abc'], ['--1'], ['1,5']])('"%s" is ignored (null)', (text) => {
    expect(parseThickness(text)).toBeNull()
  })

  test.each([
    ['0.3', 0.3],
    ['10', 10],
    ['  0.25 ', 0.25],
    ['0', 0],
    ['-1', -1],
    ['1e-3', 0.001],
    ['0.0005', 0.0005],
  ])('"%s" is %s', (text, value) => {
    expect(parseThickness(text)).toBe(value)
  })
})

describe('formatWallDetails', () => {
  test('lists id, length, thickness, height, planArea and faceArea with 2 decimals and units', () => {
    const wall = rectangleBuilding().walls[0]!
    expect(formatWallDetails(wall)).toEqual([
      { label: 'id', value: 'wall-0' },
      { label: 'length', value: '10.00 m' },
      { label: 'thickness', value: '0.30 m' },
      { label: 'height', value: '12.00 m' },
      { label: 'planArea', value: '2.91 m²' },
      { label: 'faceArea', value: '120.00 m²' },
    ])
  })
})
