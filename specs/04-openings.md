# 04 – Openings

## Goal

Let the user add rectangular window openings to a wall, see them as real holes in the 3D model, and undo or redo every change. Core validates each opening against the wall it sits in.

## Model

`src/core/openings.ts`, synchronous and pure.

```ts
export type Opening = {
  id: string;      // `opening-${n}`, assigned by the store, starting at opening-1, never reused
  wallId: string;  // a Wall.id
  offset: number;  // metres along the wall's outer edge, from its outer start to the opening's near side
  sill: number;    // metres above z = 0 to the bottom of the opening
  width: number;   // metres along the wall
  height: number;  // metres
};

export function openingRange(wall: Wall): { min: number; max: number };
export function validateOpening(building: Building, openings: ReadonlyArray<Opening>, candidate: Opening): void;
export function netFaceArea(wall: Wall, openings: ReadonlyArray<Opening>): number;
```

`src/core/errors.ts` gets a third error type:

```ts
export type OpeningErrorReason = 'unknown-wall' | 'invalid-size' | 'outside-wall' | 'overlaps-opening';
export class InvalidOpeningError extends Error {
  constructor(readonly reason: OpeningErrorReason, message?: string);
}
```

## Rules

An opening cuts through the whole wall thickness, so it must fit where both faces of the wall exist. The constants are a clearance `c = 0.1 m` and a minimum size `s = 0.1 m`.

1. **Allowed range along the wall (`openingRange`).** Project the wall's inner start and inner end onto its outer edge, measured from the outer start: `uIn0` and `uIn1`. The range is `min = max(0, uIn0) + c` and `max = min(length, uIn1) − c`. At a convex corner the inner face is shorter, so it limits the range; at a reflex corner the outer face does. On a wall too short for the clearances, `min > max`: the range is empty and every opening on that wall is `outside-wall`.
2. **Validation (`validateOpening`)**, in this order; the first failing rule decides the reason:
   - a. `candidate.wallId` names a wall of the building, otherwise `unknown-wall`.
   - b. `offset`, `sill`, `width` and `height` are finite, `width ≥ s` and `height ≥ s`, otherwise `invalid-size`.
   - c. `range.min ≤ offset`, `offset + width ≤ range.max`, `sill ≥ c` and `sill + height ≤ wall.height − c`, otherwise `outside-wall`. Doors (a sill of 0) are out of scope for this step: a hole touching the bottom of the wall needs a notched face, not a face with a hole.
   - d. For every other opening on the same wall, the two rectangles are at least `c` apart horizontally or vertically, otherwise `overlaps-opening`. An opening with the same id as the candidate is ignored, so an opening can be re-validated against a list that contains it.
3. **Net face area.** `netFaceArea(wall, openings) = wall.faceArea − Σ width × height` over the openings on that wall.

## Viewer

`wallGeometry(wall, openings = [])` and `buildWallMeshes(building, openings = [])` extend the step 03 functions with an optional second argument. With no openings, the output is exactly the step 03 prism (12 non-indexed triangles), and the step 03 test files stay unchanged and green.

With openings, `wallGeometry` builds a closed mesh with one rectangular through-hole per opening:

- **Points.** In wall coordinates `(u, v)`, `u` along the outer edge from the outer start and `v` up, the outer point is `O(u, v) = outerStart + u · axis + v · up`, and the matching inner point is `O(u, v) + thickness · inwardNormal`. Each hole corner is computed once, and every face that uses it reuses the same 3D point, so shared vertices are bit-identical.
- **Outer and inner faces.** The outer face is `[0, length] × [0, height]` and the inner face `[uIn0, uIn1] × [0, height]`, each with one hole per opening. The inner face's own corners are the wall polygon's inner vertices, not recomputed points. Faces are triangulated in 2D with `THREE.ShapeUtils.triangulateShape`, and the triangles are built from the original 3D points by index.
- **Other faces.** Top, bottom and the two mitre end faces as in step 03, and four reveal faces per opening (sill, head and the two jambs), perpendicular to the wall faces, joining the outer and inner hole edges.
- **Winding.** `triangulateShape` doesn't promise a winding, so each face's triangles are checked against the face's expected normal and flipped if needed. Every triangle faces out of the solid, which for reveals means into the hole.

The mesh effect in `Viewer.tsx` rebuilds when `building` or `openings` change, and the highlight is reapplied after every rebuild.

## Store

One `error` field covers every error, so the panel has one alert: `error: { reason: BuildingErrorReason | OpeningErrorReason | 'openings-conflict' } | null`. `'openings-conflict'` exists in the viewer only.

`store.ts` gains `openings`, `history: { past: Command[]; future: Command[] }` with `Command = { type: 'add' | 'remove'; opening: Opening }`, and these actions:

- `addOpening(input)`: builds the opening with the next id, validates it, and on success appends it, pushes `{ type: 'add', opening }` onto `past`, clears `future` and clears `error`. On `InvalidOpeningError` it sets `error` and changes nothing else; a rejected add consumes no id. With no building (error state) it sets `error` to `unknown-wall`.
- `removeOpening(id)`: removes it and pushes `{ type: 'remove', opening }`, so undo restores the same opening with the same id.
- `undo()` and `redo()`: move one command between `past` and `future` and revert or apply it. They do nothing on an empty stack. They clear `error`.
- `setThickness(t)`: as in step 03, plus:
  - If the new building is valid but any opening fails validation against it, the change is refused. `thickness`, `building`, `openings`, `history` and `selectedId` keep their current values (in the error state, that is the null building and the rejected thickness), and `error` becomes `{ reason: 'openings-conflict' }`. The last thickness that succeeded always fits the openings, so the user can recover.
  - If the change succeeds, it clears `history`. Undo and redo then can't bring back an opening that no longer fits.
- `select(id)` clears `error`.

The id counter only grows. Undo and redo never create ids.

## Panel

- After any `setThickness`, the thickness input shows the store's `thickness`.
- When a wall is selected:
  - its net face area appears with the other details;
  - a form adds an opening with fields offset, sill, width and height in metres. When the wall is selected, the defaults are width 1.2, height 1.4 and sill 0.9, with the offset centring it in the allowed range. Editing the width doesn't move the offset. If the range is empty, the form says there is no room for an opening on this wall and its button is disabled;
  - a list shows the wall's openings, each with a remove button.
- Undo and redo buttons sit in the panel. Ctrl+Z / Cmd+Z and Ctrl+Shift+Z / Cmd+Shift+Z do the same when focus is not in a text field.

## Test hook

`window.__viewer` gains `openings(): Opening[]` and `openingScreenPoint(id): { x, y } | null`, both declared in `debug.d.ts`. `openingScreenPoint` returns the page position of the opening's centre on the wall's outer face. It returns `null` only if the first hit along the camera ray is closer than that point minus 1 cm, that is, if something in front hides it. A hit beyond the point (seen through the hole) or no hit means it is visible.

## Invariants

1. For every valid opening, `openingRange(wall).min ≤ offset` and `offset + width ≤ openingRange(wall).max`.
2. For every wall with openings, the geometry is closed (every edge in exactly two triangles, vertices compared by exact position).
3. Signed volume of the geometry = `planArea × height − Σ width × height × thickness` over its openings, within 1e-4 m³. If the property test fails on float rounding alone, report the measured error and stop; don't loosen the tolerance.
4. A ray from 0.5 m outside the opening's centre, along the wall's exact inward normal in Three.js coordinates, does not hit that wall. A control ray at the same `u` but at `v = sill / 2` (solid wall below the opening) does hit it.
5. After any sequence of add, remove, undo and redo, `openings` equals the result of applying the commands in `past` to an empty list, and ids are unique.

## Acceptance criteria

Unit tests, on the rectangle `(0,0) (10,0) (10,20) (0,20)` at thickness 0.3 and height 12 unless stated. Store tests build it with `normaliseRing` into a footprint with origin `(0, 0)` and pass it to `createBuildingStore`.

1. `openingRange(wall-0)` is `[0.4, 9.6]`. On the L-shape `(0,0) (10,0) (10,4) (4,4) (4,10) (0,10)` at thickness 0.3, wall 2 (reflex corner at its end) gives `[0.4, 5.9]` and wall 3 (reflex corner at its start) gives `[0.1, 5.6]`.
2. On wall-0: offset 0.41, width 1 is valid; offset 0.35 throws `outside-wall`; offset 8.5, width 1 is valid; offset 8.5, width 1.2 throws `outside-wall`.
3. Sill 0.2, height 11.6 is valid; sill 0.05 throws `outside-wall`; sill 0.2, height 11.75 throws `outside-wall`. No test sits exactly on a limit, because limits like 12 − 0.1 are not exact in float64.
4. Width 0.05, height NaN and offset Infinity each throw `invalid-size`. Wall id `wall-99` throws `unknown-wall`.
5. Two openings on wall-0 at offsets 2 and 3.05 (width 1 each, same sill and height) throw `overlaps-opening`; at offsets 2 and 3.2 they are valid. Stacked openings at the same offset with sills 0.5 and 2.2 (height 1.5 each) are valid; with sills 0.5 and 2.05 they throw.
6. `netFaceArea` of wall-0 with one 1.2 × 1.4 opening is 118.32 m² (120 − 1.68).
7. Geometry of wall-0 with that opening (offset 4.4, sill 0.9): closed, signed volume 34.416 m³ (34.92 − 1.2 × 1.4 × 0.3). In Three.js coordinates, a ray from `(5, 1.6, 1)` towards `−z` (through the opening's centre) does not hit wall-0's geometry, and the control ray from `(5, 0.5, 1)` towards `−z` does.
8. With no openings, `wallGeometry` gives exactly the step 03 geometry.
9. Store: add, undo, redo gives back the same opening with the same id; remove then undo restores it with the same id; a new add after an undo clears `future`; a rejected add leaves `openings`, `history` and the next id unchanged.
10. Store: with an opening at offset 0.41, width 1 on wall-0, `setThickness(0.5)` is refused with `openings-conflict` (the range becomes `[0.6, 9.4]`), and thickness, building, openings and history keep their values. `setThickness(0.2)` then succeeds, keeps the opening and clears `history`, so `undo()` does nothing.
11. Property test: on the fixture building, random valid openings (inside `openingRange`, non-overlapping, 1 to 4 per wall, values drawn uniformly) keep invariants 1 to 4.

End-to-end tests (Playwright, as in step 03):

12. Select `wall-5` from the list and add an opening with the defaults: the wall's opening list has one entry. Clear the selection by clicking an empty corner, then click `openingScreenPoint` of the opening: `selectedId()` is not `wall-5`.
13. Undo with the button: the opening is gone, and clicking the same point selects `wall-5`. Redo with the keyboard (`ControlOrMeta+Shift+Z` in Playwright) brings it back.
14. An opening that doesn't fit (width 50) shows `outside-wall` in the alert and changes nothing.
15. With `wall-5` selected, adding an opening and undoing it keep `colorOf('wall-5')` at the highlight colour.
16. 50 cycles of add and undo leave `geometries()` equal to its value before the first add.

## Out of scope

Doors (a sill of 0), IFC export of openings (step 05), window and door elements inside the openings, non-rectangular openings, dragging openings in the 3D view, openings across two walls. A very large opening could cover the point that `screenPoint` uses for its wall; the default opening doesn't, and that case is accepted.

## Verification plan

- Add openings to several walls in the app, look through them from both sides, and check that the reveals are solid and the holes go all the way through.
- Record anything the agent got wrong in `VERIFY.md`.

## Open questions

None.
