# 04 – Openings

## Goal

Let the user add rectangular openings (windows and doors) to a wall, see them as real holes in the 3D model, and undo or redo every change. Core validates each opening against the wall it sits in.

## Model

`src/core/openings.ts`, synchronous and pure.

```ts
export type Opening = {
  id: string;      // `opening-${n}`, assigned by the store, never reused
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

1. **Allowed range along the wall (`openingRange`).** Project the wall's inner start and inner end onto its outer edge, measured from the outer start: `uIn0` and `uIn1`. The range is `min = max(0, uIn0) + c` and `max = min(length, uIn1) − c`. At a convex corner the inner face is shorter, so the inner face limits the range; at a reflex corner the outer face does.
2. **Validation (`validateOpening`)**, in this order; the first failing rule decides the reason:
   - a. `candidate.wallId` names a wall of the building, otherwise `unknown-wall`.
   - b. `offset`, `sill`, `width` and `height` are finite, `width ≥ s` and `height ≥ s`, otherwise `invalid-size`.
   - c. `range.min ≤ offset`, `offset + width ≤ range.max`, `sill ≥ 0` and `sill + height ≤ wall.height − c`, otherwise `outside-wall`. A sill of 0 is a door.
   - d. For every other opening on the same wall, the two rectangles are at least `c` apart horizontally or vertically, otherwise `overlaps-opening`. An opening with the same id as the candidate is ignored, so an opening can be re-validated against a list that contains it.
3. **Net face area.** `netFaceArea(wall, openings) = wall.faceArea − Σ width × height` over the openings on that wall.

Openings depend on the walls, and walls depend on the thickness. When the thickness changes, every opening is validated against the new building.

## Viewer

- `wallGeometry(wall, openings)` (the step 03 function with a second argument) builds a closed mesh with a rectangular through-hole per opening:
  - outer face and inner face: the rectangle `[0, length] × [0, height]` (outer) and `[uIn0, uIn1] × [0, height]` (inner) in wall coordinates, with one hole per opening, triangulated with `THREE.ShapeUtils.triangulateShape`;
  - top, bottom and the two mitre end faces, as in step 03;
  - four reveal faces per opening (sill, head and the two jambs), joining the outer and inner hole edges and facing into the hole.
  Every triangle still faces outward (into the hole, for the reveals).
- `buildWallMeshes(building, openings)` passes each wall its openings.
- With no openings, the geometry has the same volume and bounding box as in step 03.

## Store

`store.ts` gains `openings`, `history` and these actions:

- `addOpening(input)`: assigns the next id, validates with `validateOpening`, and on success pushes an `add` command onto `history.past` and clears `history.future`. On `InvalidOpeningError` it sets `openingError` to `{ reason }` and changes nothing else.
- `removeOpening(id)`: pushes a `remove` command that keeps the removed opening, so undo restores it with the same id.
- `undo()` and `redo()`: move one command between `past` and `future` and apply or revert it. They do nothing on an empty stack.
- `setThickness(t)`: as in step 03, but if the new building is valid and any opening fails validation against it, the change is refused: `thickness`, `building` and `openings` stay as they were, and `error` is set to `{ reason: 'openings-conflict' }` (a new reason in the viewer only; core is not changed). Thickness changes are not part of the undo history.

The id counter only grows. Undo and redo never create new ids.

## Panel

When a wall is selected:

- its net face area appears with the other details;
- a form adds an opening with fields offset, sill, width and height in metres. The defaults are width 1.2, height 1.4 and sill 0.9, centred in the allowed range. A rejected opening shows its reason in the alert;
- a list shows the wall's openings, each with a remove button.

Undo and redo buttons sit in the panel, and Ctrl+Z / Cmd+Z and Ctrl+Shift+Z / Cmd+Shift+Z do the same when focus is not in a text field.

## Test hook

`window.__viewer` gains `openings(): Opening[]` and `openingScreenPoint(id): { x, y } | null`: the page position of the opening's centre on the wall's outer face, or `null` if another wall hides it.

## Invariants

1. For every valid opening, `openingRange(wall).min ≤ offset` and `offset + width ≤ openingRange(wall).max`.
2. For every wall with openings, the geometry is closed (every edge in exactly two triangles, vertices compared by exact position).
3. Signed volume of the geometry = `planArea × height − Σ width × height × thickness` over its openings, within 1e-4 m³.
4. A ray through an opening's centre, along the wall's inward normal, does not hit that wall.
5. After any sequence of add, remove, undo and redo, `openings` equals the result of applying the commands in `past` to an empty list, and ids are unique.

## Acceptance criteria

Unit tests, on the rectangle `(0,0) (10,0) (10,20) (0,20)` at thickness 0.3 and height 12 unless stated:

1. `openingRange(wall-0)` is `[0.4, 9.6]`. On the L-shape `(0,0) (10,0) (10,4) (4,4) (4,10) (0,10)` at thickness 0.3, wall 2 (reflex corner at its end) gives `[0.4, 5.9]` and wall 3 (reflex corner at its start) gives `[0.1, 5.6]`.
2. On wall-0: offset 0.4, width 1 is valid; offset 0.35 throws `outside-wall`; offset 8.5, width 1 is valid; offset 8.5, width 1.2 throws `outside-wall`.
3. Sill 0, height 11.8 is valid (a door); sill 0, height 11.95 throws `outside-wall`; sill −0.1 throws `outside-wall`. No test sits exactly on a limit, because limits like 12 − 0.1 are not exact in float64.
4. Width 0.05, height NaN and offset Infinity each throw `invalid-size`. Wall id `wall-99` throws `unknown-wall`.
5. Two openings on wall-0 at offsets 2 and 3.05 (width 1 each, same sill and height) throw `overlaps-opening`; at offsets 2 and 3.2 they are valid. Stacked openings at the same offset with sills 0.5 and 2.2 (height 1.5 each) are valid; with sills 0.5 and 2.05 they throw.
6. `netFaceArea` of wall-0 with one 1.2 × 1.4 opening is 118.32 m² (120 − 1.68).
7. Geometry of wall-0 with that opening (offset 4.4, sill 0.9): closed, signed volume 34.416 m³ (34.92 − 1.2 × 1.4 × 0.3), and a ray from `(5, 1.6, 1)` towards `−z` in Three.js coordinates (through the opening's centre) does not hit wall-0's geometry.
8. With no openings, `wallGeometry` gives the same volume and bounding box as in step 03.
9. Store: add, undo, redo returns the same opening with the same id; remove then undo restores it with the same id; a new add after an undo clears `future`; a rejected add leaves `openings` and `history` unchanged.
10. Store: with an opening at offset 0.4, width 1 on wall-0, `setThickness(0.5)` is refused with `openings-conflict` (the range becomes `[0.6, 9.4]`), and thickness, building and openings stay as they were; `setThickness(0.2)` succeeds and keeps the opening.
11. Property test: on the fixture building, random valid openings (generated inside `openingRange`, non-overlapping, 1 to 4 per wall, values drawn uniformly) keep invariants 1 to 4.

End-to-end tests (Playwright, as in step 03):

12. Select `wall-5`, add an opening with the defaults: the wall's opening list has one entry, and clicking `openingScreenPoint` of it does not select `wall-5`.
13. Undo with the button: the opening is gone and clicking the same point selects `wall-5`. Redo with the keyboard (`ControlOrMeta+Shift+Z` in Playwright) brings it back.
14. An opening that doesn't fit (width 50) shows `outside-wall` in the alert and changes nothing.
15. 50 cycles of add and undo leave `geometries()` equal to its value before the first add.

## Out of scope

IFC export of openings (step 05), window and door elements inside the openings, non-rectangular openings, dragging openings in the 3D view, openings across two walls.

## Verification plan

- Add openings to several walls in the app, look through them from both sides, and check that the reveals are solid and the holes go all the way through.
- Record anything the agent got wrong in `VERIFY.md`.

## Open questions

None.
