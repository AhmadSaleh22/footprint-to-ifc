// Draws the walls that buildWalls produces for a footprint, so the mitres can be checked by eye.
//
//   pnpm exec tsx scripts/debug-walls-svg.ts [--thickness 0.3] [--height 12] [--geojson PATH] [--out PATH]
//
// Defaults: the step 01 fixture, thickness 0.3 m, height 12 m, output out/debug-walls.svg (ignored by git).
// Not type-checked by `pnpm typecheck` (only src/ is) and not covered by tests.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { footprintFromGeoJSON } from '../src/core/footprint'
import { buildWalls } from '../src/core/walls'

const args = process.argv.slice(2)
const option = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1]! : fallback
}

const thickness = Number(option('thickness', '0.3'))
const height = Number(option('height', '12'))
const geojsonPath = option('geojson', 'fixtures/berlin-lod2-building.geojson')
const outPath = option('out', 'out/debug-walls.svg')

const footprint = footprintFromGeoJSON(JSON.parse(readFileSync(geojsonPath, 'utf8')), height)
const building = buildWalls(footprint, thickness)

// SVG y points down, the building's y points north: flip y. Local metres, scaled to about 900 px on the long side.
const all = building.walls.flatMap((wall) => wall.polygon)
const minX = Math.min(...all.map((p) => p.x))
const maxX = Math.max(...all.map((p) => p.x))
const minY = Math.min(...all.map((p) => p.y))
const maxY = Math.max(...all.map((p) => p.y))
const margin = 2 // m
const scale = 900 / Math.max(maxX - minX, maxY - minY)
const drawingWidth = (maxX - minX + 2 * margin) * scale
const width = Math.max(drawingWidth, 900) // wide enough for the caption
const sx = (x: number): number => (x - minX + margin) * scale + (width - drawingWidth) / 2
const sy = (y: number): number => (maxY - y + margin) * scale
const heightPx = (maxY - minY + 2 * margin) * scale
const font = Math.max(10, 0.6 * scale)

const path = (points: ReadonlyArray<{ x: number; y: number }>): string =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(' ') + ' Z'

const fills = ['#cfe3f7', '#f7e3cf']
const parts: string[] = []
building.walls.forEach((wall) => {
  parts.push(`<path d="${path(wall.polygon)}" fill="${fills[wall.index % 2]}" stroke="#1d3557" stroke-width="1"/>`)
})
building.walls.forEach((wall) => {
  const cx = wall.polygon.reduce((s, p) => s + p.x, 0) / 4
  const cy = wall.polygon.reduce((s, p) => s + p.y, 0) / 4
  parts.push(
    `<text x="${sx(cx).toFixed(2)}" y="${sy(cy).toFixed(2)}" font-size="${font.toFixed(1)}" text-anchor="middle" fill="#111">${wall.id}</text>`,
  )
})
parts.push(`<path d="${path(building.inner)}" fill="none" stroke="#e63946" stroke-width="1.5" stroke-dasharray="6 3"/>`)
building.footprint.ring.forEach((p, i) => {
  parts.push(`<circle cx="${sx(p.x).toFixed(2)}" cy="${sy(p.y).toFixed(2)}" r="3" fill="#1d3557"/>`)
  parts.push(
    `<text x="${(sx(p.x) + 5).toFixed(2)}" y="${(sy(p.y) - 5).toFixed(2)}" font-size="${(font * 0.8).toFixed(1)}" fill="#1d3557">${i}</text>`,
  )
})
building.inner.forEach((p) => {
  parts.push(`<circle cx="${sx(p.x).toFixed(2)}" cy="${sy(p.y).toFixed(2)}" r="2.5" fill="#e63946"/>`)
})

const total = building.walls.reduce((sum, wall) => sum + wall.planArea, 0)
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${heightPx.toFixed(0)}" viewBox="0 0 ${width.toFixed(2)} ${heightPx.toFixed(2)}" font-family="sans-serif">`,
  `<rect width="100%" height="100%" fill="#ffffff"/>`,
  ...parts,
  `<text x="8" y="${(font + 4).toFixed(1)}" font-size="${font.toFixed(1)}" fill="#111">${building.walls.length} walls, thickness ${thickness} m, total plan area ${total.toFixed(6)} m² (blue: walls, red dashed: inner ring, numbers: footprint vertices)</text>`,
  `</svg>`,
].join('\n')

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, svg + '\n')
console.log(`${building.walls.length} walls, total plan area ${total.toFixed(6)} m²`)
console.log(`wrote ${outPath}`)
