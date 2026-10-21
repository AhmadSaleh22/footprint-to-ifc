import * as THREE from 'three'

const raycaster = new THREE.Raycaster()

/**
 * Casts a ray from the camera through a point on the screen and returns the id of the nearest wall it hits.
 * Only front faces count (the materials are `FrontSide`). The caller keeps the camera's matrices up to date
 * (`updateMatrixWorld`, `updateProjectionMatrix`).
 * @param meshes Wall meshes, each with `userData.id`. Three.js frame, metres.
 * @param camera The camera the scene is drawn with.
 * @param ndc Normalised device coordinates: x and y from -1 (left, bottom) to 1 (right, top).
 * @returns The `userData.id` of the nearest hit mesh, or null when the ray hits no wall.
 */
export function pickWall(meshes: ReadonlyArray<THREE.Mesh>, camera: THREE.Camera, ndc: { x: number; y: number }): string | null {
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera)
  const hit = raycaster.intersectObjects([...meshes], false)[0]
  return (hit?.object.userData.id as string | undefined) ?? null
}
