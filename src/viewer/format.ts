import type { Wall } from '../core'

/**
 * Reads the thickness input. An empty or non-numeric text gives null, which means "ignore, do not rebuild".
 * @param text The input's value.
 * @returns The number in metres, or null.
 */
export function parseThickness(text: string): number | null {
  if (text.trim() === '') return null
  const value = Number(text)
  return Number.isNaN(value) ? null : value
}

/**
 * The rows of the wall details panel: each number with 2 decimals and its unit.
 * @param wall A wall from core. Lengths in metres, areas in square metres.
 */
export function formatWallDetails(wall: Wall): Array<{ label: string; value: string }> {
  return [
    { label: 'id', value: wall.id },
    { label: 'length', value: `${wall.length.toFixed(2)} m` },
    { label: 'thickness', value: `${wall.thickness.toFixed(2)} m` },
    { label: 'height', value: `${wall.height.toFixed(2)} m` },
    { label: 'planArea', value: `${wall.planArea.toFixed(2)} m²` },
    { label: 'faceArea', value: `${wall.faceArea.toFixed(2)} m²` },
  ]
}
