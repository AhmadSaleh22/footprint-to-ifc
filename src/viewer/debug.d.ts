import type { Opening } from '../core'

/** Test hook, set on `window.__viewer` only when the URL has `?debug=1`. */
export interface ViewerDebug {
  /** `renderer.info.memory.geometries`: geometries currently uploaded to the GPU. */
  geometries(): number
  /**
   * Page position in CSS pixels (ready for `page.mouse.click`) of a point on the wall's outer face: the midpoint
   * of its outer edge, at mid-height, 5 cm outward. Null when a ray through that pixel hits a different wall first,
   * or the point is off screen.
   */
  screenPoint(id: string): { x: number; y: number } | null
  selectedId(): string | null
  /** The wall mesh's colour as `#rrggbb`. */
  colorOf(id: string): string
  /** The openings currently on the building. */
  openings(): Opening[]
  /**
   * Page position in CSS pixels of the opening's centre on the wall's outer face. Null when the point is off screen,
   * or when the first hit along the camera ray is closer than the point minus 1 cm, that is, something in front hides
   * it. A hit beyond the point (seen through the hole) or no hit means it is visible.
   */
  openingScreenPoint(id: string): { x: number; y: number } | null
  /** Camera position in metres, Three.js frame. */
  cameraPosition(): [number, number, number]
}

declare global {
  interface Window {
    __viewer?: ViewerDebug
  }
}
