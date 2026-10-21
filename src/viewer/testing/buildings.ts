import geojsonRaw from '../../../fixtures/berlin-lod2-building.geojson?raw'
import { buildWalls, footprintFromGeoJSON, normaliseRing, type Building, type Footprint } from '../../core'

// Test-only buildings shared by the viewer tests. Thickness 0.3 m unless stated.

type P = { x: number; y: number }

const pts = (...coords: Array<[number, number]>): P[] => coords.map(([x, y]) => ({ x, y }))

/** A footprint the way step 01 produces it: the ring goes through normaliseRing. */
export const footprintOf = (points: P[], height = 12): Footprint => ({
  crs: 'EPSG:25833',
  origin: { easting: 0, northing: 0 },
  ring: normaliseRing(points),
  height,
})

export const rectangleBuilding = (thickness = 0.3): Building =>
  buildWalls(footprintOf(pts([0, 0], [10, 0], [10, 20], [0, 20])), thickness)

export const lShapeBuilding = (thickness = 0.3): Building =>
  buildWalls(footprintOf(pts([0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10])), thickness)

export const notchBuilding = (thickness = 0.3): Building =>
  buildWalls(footprintOf(pts([0, 0], [10, 0], [10, 10], [5.1, 10], [5.1, 9], [4.9, 9], [4.9, 10], [0, 10])), thickness)

export const fixtureFootprint = (): Footprint => footprintFromGeoJSON(JSON.parse(geojsonRaw), 12)

export const fixtureBuilding = (thickness = 0.3): Building => buildWalls(fixtureFootprint(), thickness)
