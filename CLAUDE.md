# footprint-to-ifc

Turns a building footprint (GeoJSON) into an editable 3D building in the browser and exports it to IFC.

This repo is also a record of how it was built. Every step starts from a spec in `specs/`, is implemented with Claude Code, and is reviewed and verified by a human. `VERIFY.md` records what was checked and where the agent was wrong.

## Stack

Vite · React 18 · TypeScript (strict) · Zustand · Three.js · Vitest · fast-check · Playwright · web-ifc · proj4

Package manager: pnpm.

## Commands

- `pnpm dev`: run the viewer
- `pnpm typecheck`: `tsc --noEmit`
- `pnpm test`: unit and property tests (Vitest)
- `pnpm test:e2e`: Playwright, including screenshot tests
- `pnpm verify:ifc`: round-trip check of the exported IFC (see `specs/06`)

## Architecture rules

- `src/core/` is pure TypeScript: geometry, building model, validation. It must not import `three`, `react` or `web-ifc`. Everything in core is unit-tested.
- `src/viewer/` renders the model with Three.js and React. It reads state from the Zustand store and never computes building geometry itself.
- `src/ifc/` maps the core model to IFC. It never reads from Three.js objects.
- One source of truth: the core `Building` model. The scene and the IFC file are both derived from it.

## Conventions (do not change without a spec)

- Units: metres everywhere in core. Angles in radians.
- Coordinates: input GeoJSON is WGS84 (RFC 7946). Core works in EPSG:25833 (ETRS89 / UTM zone 33N), shifted to a local origin. The origin offset is stored on the model and written to IFC. It is never baked into vertex positions, because large UTM values lose precision in Float32 buffers.
- Axes: core is Z-up and right-handed (x = east, y = north, z = up). The viewer maps core `(x, y, z)` to Three.js `(x, z, -y)`. Any other mapping mirrors the building.
- Footprint rings are counter-clockwise, with no repeated closing vertex.
- Every wall, opening and window has a stable string id. Raycast hits resolve to ids through `userData.id`, never through object names or array indexes.

## How to work in this repo

- Work on one spec at a time: the one named in the request. Do not implement anything from a later spec.
- Before writing code, read the spec and list anything ambiguous. Ask instead of guessing.
- Write the tests from the spec's acceptance criteria first, then the implementation.
- Never edit a spec. Never weaken, skip or delete a test to make it pass. If a test looks wrong, say so and stop.
- Ask before adding a dependency.
- Keep core functions small and pure. Every exported function has JSDoc stating the units and coordinate frame of its inputs and outputs.
- Done means: `pnpm typecheck` and `pnpm test` pass (and `pnpm test:e2e`, from step 03 on), and you have listed what the tests do not cover.
