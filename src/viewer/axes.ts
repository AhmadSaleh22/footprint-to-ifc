import { Vector3 } from 'three'

/**
 * Maps a core point to Three.js: core (x, y, z) becomes Three.js (x, z, -y). Core is Z-up and right-handed with
 * x east and y north; Three.js is Y-up, so north is -z. The determinant is +1, so the building is not mirrored.
 * @param p Plan position in metres, core frame (x east, y north).
 * @param z Height above the ground in metres, core frame.
 * @returns A new vector in metres, Three.js frame.
 */
export const toThree = (p: { x: number; y: number }, z: number): Vector3 => new Vector3(p.x, z, -p.y)
