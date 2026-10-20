# 02 – Walls

## Goal

Turn a `Footprint` from step 01 into a `Building`: one straight wall per footprint edge, with mitred corners, so the walls cover the band between the footprint and its inward offset exactly once.

## API

`src/core/walls.ts`, synchronous and pure. It does not mutate its input, and the output shares no objects with it.

```ts
export type Wall = {
  id: string;           // `wall-${index}`, stable for the same footprint
  index: number;        // the footprint edge this wall runs along: ring[index] → ring[index + 1]
  polygon: [Point, Point, Point, Point]; // plan outline, local metres: outer start, outer end, inner end, inner start
  length: number;       // metres, length of the outer edge
  thickness: number;    // metres
  height: number;       // metres, from the footprint
};

export type Building = {
  footprint: Footprint; // a copy of the input
  thickness: number;    // metres
  inner: Point[];       // the inner ring: the footprint offset inward by thickness, local metres
  walls: Wall[];        // one per footprint edge, in ring order
};

export function buildWalls(footprint: Footprint, thickness: number): Building;
```

`src/core/errors.ts` gets a second error type:

```ts
export type BuildingErrorReason = 'invalid-thickness' | 'thickness-too-large';
export class InvalidBuildingError extends Error {
  constructor(readonly reason: BuildingErrorReason, message?: string);
}
```

Units and frame are those of the footprint ring: local metres, x east, y north, counter-clockwise.

## Pipeline

1. **Thickness.** Finite and greater than 0, otherwise `invalid-thickness`.
2. **Inward normals.** For each edge `ring[i] → ring[i+1]`, the inward unit normal is its left normal `(−dy, dx) / length`, because the ring is counter-clockwise.
3. **Inner vertices (mitres).** For vertex `i`, with `n1` the normal of the edge ending at it and `n2` the normal of the edge starting at it: `inner[i] = ring[i] + thickness · (n1 + n2) / (1 + n1·n2)`. This works for convex corners, reflex corners and collinear vertices (`n1 = n2` gives `ring[i] + thickness · n1`). It avoids intersecting the two offset lines, which loses precision when the edges are nearly parallel.
4. **Validity of the inner ring.** All three must hold, otherwise `thickness-too-large`:
   - a. Every inner edge points the same way as its outer edge (positive dot product) and is at least 1 mm long.
   - b. The inner ring is simple: no two non-adjacent edges intersect or touch (the same check as step 01, moved to `geometry.ts` and shared).
   - c. The inner ring is counter-clockwise.
   Orientation alone is not enough. A triangle offset past its inradius comes out point-reflected through the incentre, which is still counter-clockwise; check (a) catches it. A building with a narrow neck can self-intersect without any edge reversing; check (b) catches that.
5. **Walls.** Wall `i` has `polygon = [ring[i], ring[i+1], inner[i+1], inner[i]]`, `length = |ring[i+1] − ring[i]|`, and `height = footprint.height`.

## Invariants

For every `Building` returned:

1. `walls.length === footprint.ring.length`, and wall `i` has `index === i` and `id === 'wall-' + i`.
2. Each wall polygon is simple, counter-clockwise and has positive area.
3. Adjacent walls share exactly one edge: wall `i`'s `[inner end, outer end]` is wall `i+1`'s `[inner start, outer start]` (and the last wall meets the first).
4. Every inner vertex lies at distance `thickness` from the lines of both edges that meet at it, within 1e-9 m.
5. Sum of wall plan areas = area(footprint ring) − area(inner ring), within 1e-6 m². With invariants 2 and 3 and check 4b, this means the walls cover the band exactly once: no overlap, no gap.
6. Calling `buildWalls` twice on the same footprint gives equal output.

## Acceptance criteria

Hand-computed and cross-checked with Shapely (`buffer(−t, join_style=mitre)`):

1. Rectangle `(0,0) (10,0) (10,20) (0,20)`, thickness 0.3: 4 walls; inner ring `(0.3,0.3) (9.7,0.3) (9.7,19.7) (0.3,19.7)`; wall 0 polygon `(0,0) (10,0) (9.7,0.3) (0.3,0.3)` with area 2.91 m²; total wall area 17.64 m².
2. L-shape `(0,0) (10,0) (10,4) (4,4) (4,10) (0,10)`, thickness 0.3: the reflex corner `(4,4)` gives inner vertex `(3.7,3.7)`; total wall area 11.64 m².
3. Collinear vertex `(0,0) (5,0) (10,0) (10,10) (0,10)`, thickness 0.3: 5 walls; the inner vertex at `(5,0)` is `(5,0.3)`; total wall area 11.64 m².
4. Thin triangle `(0,0) (10,0) (0,1)` (inradius about 0.475 m): thickness 0.3 is valid (total wall area 4.321025 m²); thickness 0.48 throws `thickness-too-large` through check 4a, although the inner ring is still counter-clockwise.
5. Narrow neck: two 10 × 10 squares joined by a neck 0.5 m wide and 5 m long, ring `(0,0) (10,0) (10,4.75) (15,4.75) (15,0) (25,0) (25,10) (15,10) (15,5.25) (10,5.25) (10,10) (0,10)`. Thickness 0.2 is valid (total wall area 17.64 m²); thickness 0.3 throws `thickness-too-large` through check 4b, with every inner edge still pointing the right way.
6. Rectangle 10 × 20 with thickness 5 (inner edges of length 0) and 6 (inverted) both throw `thickness-too-large`.
7. Thickness 0, −1, NaN and Infinity throw `invalid-thickness`.
8. Real fixture: the step 01 footprint of `fixtures/berlin-lod2-building.geojson` with thickness 0.3 gives 7 walls, and invariants 1 to 5 hold.
9. Property test with fast-check: star polygons from the step 01 generator, thickness from 0.01 to 1 m. Either `buildWalls` throws `thickness-too-large`, or invariants 1 to 6 hold. It never throws anything else and never returns an invalid building.

## Out of scope

Rendering (step 03), openings (step 04), merging collinear walls, different thicknesses per wall, joints other than mitres, roofs and slabs.

## Verification plan

- The agent writes `scripts/debug-walls-svg.ts` (outside `src/`, no tests): it draws the fixture's walls with their ids, so I can check the mitres by eye.
- Independent check: compute the fixture's band area with Shapely (`uv run --with shapely`, mitre join, high mitre limit) and compare it with the sum of wall areas.
- Record anything the agent got wrong in `VERIFY.md`.

## Dependencies

None new.

## Open questions

None.
