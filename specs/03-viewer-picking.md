# 03 – Viewer and picking

## Goal

Show the `Building` from step 02 as a 3D model in the browser with Three.js inside React. Clicking a wall selects it, highlights it and shows its numbers in a side panel. Changing the thickness rebuilds the model without leaking GPU resources.

## Scope of the app

`src/App.tsx` loads `fixtures/berlin-lod2-building.geojson` (`?raw` import), runs `footprintFromGeoJSON` once (height 12 m), and renders:

- a canvas with the model, orbit controls and a ground grid;
- a side panel with a thickness input, the list of walls and the selected wall's details;
- an error banner when `buildWalls` throws. No model is shown in that case, and the app does not crash.

## Dependencies

Approved for this step, pinned to exact versions like the rest of the repo: `three` and `zustand` (runtime), `@types/three` and `@playwright/test` (dev). Plain Three.js, no React Three Fiber.

## Modules

`src/viewer/` holds everything here. `wallGeometry` and `frameBuilding` only turn existing data (`Wall.polygon`, `Wall.height`, `footprint.ring`) into render data: triangles, a bounding box, a camera position. They compute no building property; lengths, areas and offsets come from core. This is what `CLAUDE.md` means by "never computes building geometry".

- `axes.ts`: `toThree(p: {x, y}, z): THREE.Vector3` maps core `(x, y, z)` to Three.js `(x, z, −y)`, as `CLAUDE.md` states.
- `meshes.ts`:
  - `wallGeometry(wall): THREE.BufferGeometry` builds a closed prism from the wall's plan polygon, from z = 0 to z = `wall.height`: bottom, top and four sides, as 12 non-indexed triangles. Every triangle is counter-clockwise seen from outside, so its normal points outward.
  - `buildWallMeshes(building): THREE.Mesh[]` makes one mesh per wall with `userData.id = wall.id` and its own `MeshStandardMaterial` (`side: FrontSide`, colour `#d9d4c7`). Materials are never shared between meshes.
  - `setHighlight(meshes, id | null)` sets the selected mesh's colour to `#e07a2f` and every other mesh back to `#d9d4c7`. It changes colours only; it creates nothing.
  - `disposeMeshes(meshes)` disposes each mesh's geometry and material once.
- `picking.ts`: `pickWall(meshes, camera, ndc): string | null` casts a ray with `THREE.Raycaster` and returns the `userData.id` of the nearest hit, or `null`.
- `camera.ts`: `frameBuilding(camera, building)` looks at the centre of the footprint's bounding box from the south-west and above: direction `(−1, 1, 1)` normalised, in Three.js coordinates (west, up, south). The distance makes the bounding sphere fit the vertical field of view with 10% margin. From there the long west wall (`wall-5` in the fixture) shows its outer face.
- `store.ts` (Zustand): `{ footprint, thickness, building, error, selectedId, setThickness, select }`. `footprint` is set once at load and is never cleared, so a rebuild after an error works. `setThickness(t)` stores `t` and calls `buildWalls(footprint, t)`. On `InvalidBuildingError` it sets `error` to `{ reason }` and clears `building` and `selectedId`. On success it clears `error` and keeps `selectedId` (wall ids don't depend on thickness).
- `Viewer.tsx`: owns the `WebGLRenderer`, scene, camera, controls, grid, lights and render loop. The grid and lights are created once. When `building` changes, it disposes the old wall meshes and adds new ones; nothing else is allocated per rebuild. On unmount it disposes everything, including the renderer, controls and grid. It must work under React StrictMode, which mounts, unmounts and mounts again in development.
- `Panel.tsx`:
  - Thickness input: `type="number"`, step 0.05. An empty or non-numeric value is ignored (no rebuild). Any other number goes to `setThickness`, and invalid ones show their error.
  - Error banner: `role="alert"`, showing the error's `reason` only.
  - Wall list: a `<ul aria-label="Walls">` with one `<button>` per wall, named by its id, so walls can be selected by keyboard.
  - Selected wall details: `<dl data-testid="wall-details">` with id, length, thickness, height, `planArea` and `faceArea`, each as the number with 2 decimals and its unit (`m`, `m²`).

## Interaction

- A click selects. If the pointer moves more than 5 CSS pixels (Euclidean distance) between `pointerdown` and `pointerup`, it was an orbit drag, not a click.
- Clicking a wall selects it. Clicking empty space clears the selection. Selecting from the list does the same as clicking the wall.

## Test hook

With `?debug=1` in the URL, `Viewer` sets `window.__viewer` after its first frame with a building, and removes it on unmount. Without `?debug=1` it is never set. Its type is declared in `src/viewer/debug.d.ts`.

- `geometries(): number` returns `renderer.info.memory.geometries`.
- `screenPoint(id): { x: number; y: number } | null` returns the page position in CSS pixels (ready for `page.mouse.click`) of a point on the wall's outer face: the midpoint of its outer edge, at mid-height, 5 cm outward. It returns `null` if a ray from the camera through that pixel hits a different wall first, so a test fails with a clear reason instead of clicking the wrong wall.
- `selectedId(): string | null`.
- `colorOf(id): string` returns the mesh's colour as `#rrggbb`.
- `cameraPosition(): [number, number, number]`.

## Invariants

1. `toThree` has determinant +1: it does not mirror.
2. For every wall, its geometry is closed: with vertices compared by exact position, every edge belongs to exactly two triangles.
3. For every wall, the signed volume of its geometry, `Σ v0 · (v1 × v2) / 6` over its triangles, equals `planArea × height` within 1e-6 m³. A positive volume means every triangle faces outward; one flipped triangle changes it.
4. The geometry's bounding box spans y from 0 to `height`, and its x and z match the wall polygon through `toThree` within 1e-9 m.
5. One mesh per wall, with `userData.id === wall.id`, and no material shared between meshes.
6. After 50 rebuilds, `renderer.info.memory.geometries` equals its value after the app's first build.

## Acceptance criteria

Unit tests (Vitest, no browser):

1. `toThree`: the images of the core x, y and z unit vectors form a matrix with determinant +1, and `(1, 2)` at z = 3 maps to `(1, 3, −2)`.
2. Rectangle `(0,0) (10,0) (10,20) (0,20)`, thickness 0.3, height 12: wall 0's geometry has 12 triangles, is closed, and has signed volume 34.92 m³ (2.91 × 12).
3. Invariants 2 to 5 for every wall of the step 02 L-shape, notch and fixture buildings, all at thickness 0.3.
4. Mutation guard: reversing one triangle of a wall's geometry in the test makes invariant 3 fail.
5. `pickWall`, over the rectangle building with a `PerspectiveCamera` (fov 50, aspect 1, near 0.1, far 1000) at `(5, 30, 40)` looking at `(5, 6, −10)`, after `updateMatrixWorld` and `updateProjectionMatrix`: the ray through NDC `(0, 0)` returns `wall-0`. The test also confirms this with its own ray–triangle intersection over the geometries, without `THREE.Raycaster`. The same camera looking at `(5, 100, 40)` (straight up) returns `null` for NDC `(0, 0)`.
6. `disposeMeshes` calls `dispose` exactly once on every geometry and every material.
7. `setHighlight` changes colours only: after it, every mesh has the same geometry and material objects as before.
8. Store: `setThickness(10)` on the fixture sets `error.reason` to `thickness-too-large` and clears `building` and `selectedId`; `setThickness(0.3)` afterwards clears `error` and restores a building with 7 walls.

End-to-end tests (Playwright, Chromium only, in `e2e/`, `pnpm test:e2e`, against the dev server at `/?debug=1`; each test first waits for `window.__viewer`):

9. The app loads, the canvas is visible, and the wall list has 7 buttons.
10. Clicking at `screenPoint('wall-5')` (not null) selects `wall-5`: `selectedId()` returns `wall-5`, `colorOf('wall-5')` is `#e07a2f`, and the details show `wall-5` with its length as `building`'s value with 2 decimals and ` m`.
11. Clicking the canvas's top-left corner (10 px in from each edge) clears the selection.
12. A 50 px drag that starts on `wall-5` changes `cameraPosition()` and leaves the selection unchanged.
13. Focusing the `wall-2` button with Tab and pressing Enter selects `wall-2`, and `colorOf('wall-2')` is `#e07a2f`.
14. Typing 10 in the thickness input shows the alert with `thickness-too-large` and an empty wall list; typing 0.3 shows 7 walls again.
15. Changing thickness 50 times (between 0.2 and 0.4) leaves `geometries()` equal to its value after the first build.

## Playwright and CI

- `playwright.config.ts` at the repo root: tests in `e2e/`, Chromium only, `webServer` running `pnpm dev --port 5174 --strictPort` with `baseURL` `http://localhost:5174`, and launch arguments `--use-angle=swiftshader` and `--enable-unsafe-swiftshader`, so WebGL works in headless Chromium without a GPU.
- `package.json` gets `"test:e2e": "playwright test"`. `tsconfig.json` and the ESLint config cover `e2e/` and `playwright.config.ts`.
- The workflow runs `pnpm exec playwright install --with-deps chromium`, then `pnpm test:e2e`, after the existing steps.

## Out of scope

Screenshot tests (images differ between macOS and the Linux CI; later), a test for disposal on unmount (covered indirectly by criterion 15 and by StrictMode in development), openings (step 04), IFC (step 05), roofs and slabs, editing wall geometry by dragging, mobile layout.

## Verification plan

- Open the app, rotate the building and click each wall: the ids must sit on the same sides as in the step 02 debug SVG.
- Check by eye that walls are solid from every angle. A wall that looks hollow or see-through from one side has inward-facing triangles.
- Record anything the agent got wrong in `VERIFY.md`.

## Open questions

None.
