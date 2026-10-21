# 03 – Viewer and picking

## Goal

Show the `Building` from step 02 as a 3D model in the browser with Three.js inside React. Clicking a wall selects it, highlights it and shows its numbers in a side panel. Changing the thickness rebuilds the model without leaking GPU resources.

## Scope of the app

`src/App.tsx` loads `fixtures/berlin-lod2-building.geojson` (`?raw` import), runs `footprintFromGeoJSON` (height 12 m) and `buildWalls` (thickness from the UI, default 0.3 m), and renders:

- a canvas with the model, orbit controls and a ground grid;
- a side panel with a thickness input, the list of walls (one button per wall id) and the selected wall's details;
- an error message when `buildWalls` throws, showing the error's `reason`. No model is shown in that case, and the app does not crash.

## Dependencies

Approved for this step: `three` and `zustand` (runtime), `@types/three` and `@playwright/test` (dev). Plain Three.js, no React Three Fiber.

## Modules

`src/viewer/` holds everything here. It reads from the store and from core types. It never computes building geometry: offsets, lengths and areas come from the `Building`.

- `axes.ts`: `toThree(p: {x, y}, z): THREE.Vector3` maps core `(x, y, z)` to Three.js `(x, z, −y)`, as `CLAUDE.md` states.
- `meshes.ts`:
  - `wallGeometry(wall): THREE.BufferGeometry` builds a closed prism from the wall's plan polygon, from z = 0 to z = `wall.height`: bottom, top and four sides, as non-indexed triangles. Every triangle is counter-clockwise seen from outside, so its normal points outward and Three.js front faces face outward.
  - `buildWallMeshes(building): THREE.Mesh[]` makes one mesh per wall with `userData.id = wall.id`.
  - `disposeMeshes(meshes)` disposes every geometry and material it created.
- `picking.ts`: `pickWall(meshes, camera, ndc): string | null` casts a ray with `THREE.Raycaster` and returns the `userData.id` of the nearest hit, or `null`.
- `camera.ts`: `frameBuilding(camera, building)` places a perspective camera so the whole building fits, looking at its centre from above at an angle.
- `store.ts` (Zustand): `{ thickness, building, error, selectedId, setThickness, select }`. `setThickness` rebuilds with `buildWalls`; on `InvalidBuildingError` it sets `error` and clears `building` and `selectedId`. A selected id that no longer exists after a rebuild is cleared.
- `Viewer.tsx`: owns the `WebGLRenderer`, scene, camera, controls and render loop. When `building` changes, it disposes the old meshes and adds new ones. When the component unmounts, it disposes everything, including the renderer and controls.
- `Panel.tsx`: thickness input, wall list, selected wall details: id, length, thickness, height, `planArea`, `faceArea`, each with its unit and 2 decimals. The wall list is made of buttons, so walls can be selected by keyboard.

## Interaction

- A click selects. A pointer that moves more than 5 px between `pointerdown` and `pointerup` is an orbit drag, not a click.
- Clicking a wall selects it. Clicking empty space clears the selection. Selecting from the list does the same as clicking the wall.
- The selected wall is drawn in a highlight colour; all other walls use the default colour.

## Test hook

With `?debug=1` in the URL, the app sets `window.__viewer` with `geometries()` (from `renderer.info.memory.geometries`), `screenPoint(id)` (the pixel position of a wall's centre, at mid-height, projected through the camera) and `selectedId()`. Without `?debug=1`, `window.__viewer` is undefined.

## Invariants

1. `toThree` has determinant +1: it does not mirror. A counter-clockwise ring in core is counter-clockwise seen from above (+Y down) in Three.js.
2. For every wall, its geometry is closed: every edge belongs to exactly two triangles.
3. For every wall, the signed volume of its geometry, `Σ v0 · (v1 × v2) / 6` over its triangles, equals `planArea × height` within 1e-6 m³. A positive volume means every triangle faces outward; one flipped triangle changes it.
4. The geometry's bounding box spans y from 0 to `height`, and its x and z match the wall polygon through `toThree` within 1e-9 m.
5. One mesh per wall, with `userData.id === wall.id`.
6. After 50 rebuilds, `renderer.info.memory.geometries` is the same as after the first build.

## Acceptance criteria

Unit tests (Vitest, no browser):

1. `toThree`: the images of the core x, y and z unit vectors form a matrix with determinant +1, and `(1, 2)` at z = 3 maps to `(1, 3, −2)`.
2. Rectangle `(0,0) (10,0) (10,20) (0,20)`, thickness 0.3, height 12: wall 0's geometry has 12 triangles, is closed, and has signed volume 34.92 m³ (2.91 × 12).
3. Invariants 2 to 5 for every wall of the step 02 L-shape, notch and fixture buildings.
4. Mutation guard: reversing one triangle of a wall's geometry in the test makes invariant 3 fail.
5. `pickWall`: with a camera at `(5, 30, 40)` looking at `(5, 6, −10)` over the rectangle building, the ray through NDC `(0, 0)` returns the id of the nearest wall it hits, and a ray pointing at the sky returns `null`. The expected id is computed in the test from the scene with an independent ray–triangle test, not hard-coded.
6. `disposeMeshes` calls `dispose` once on every geometry and material it receives.
7. Store: `setThickness(10)` on the fixture building sets `error.reason` to `thickness-too-large` and clears `building` and `selectedId`; `setThickness(0.3)` afterwards restores a building with 7 walls.

End-to-end tests (Playwright, Chromium, `pnpm test:e2e`, against the dev server with `?debug=1`):

8. The app loads, the canvas is visible and the panel lists 7 walls.
9. Clicking at `screenPoint('wall-5')` selects `wall-5`: the panel shows its id and length, and `selectedId()` returns `wall-5`.
10. Clicking an empty corner of the canvas clears the selection.
11. A drag of 50 px over a wall rotates the view and does not select it.
12. Selecting `wall-2` from the list with the keyboard (Tab, then Enter) selects it.
13. Setting thickness to 10 shows `thickness-too-large` and no model; setting it back to 0.3 shows 7 walls again.
14. Changing thickness 50 times leaves `geometries()` equal to its value after the first build.

## CI

The workflow also installs Playwright's Chromium with its system dependencies and runs `pnpm test:e2e`.

## Out of scope

Screenshot tests (images differ between macOS and the Linux CI; later), openings (step 04), IFC (step 05), roofs and slabs, editing wall geometry by dragging, mobile layout.

## Verification plan

- Open the app, rotate the building and click each wall: the panel must match the debug SVG from step 02 (same ids on the same sides).
- Check by eye that walls are solid from every angle. A wall that looks hollow or see-through from one side has inward-facing triangles.
- Record anything the agent got wrong in `VERIFY.md`.

## Open questions

None.
