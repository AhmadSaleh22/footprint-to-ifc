# 02 – Walls

## Goal

Turn a `Footprint` from step 01 into a `Building`: one straight wall per footprint edge, with mitred corners, so the walls cover the band between the footprint and its inward offset exactly once.

## API

`src/core/walls.ts`, synchronous and pure. It does not mutate its input, and the output shares no objects with it or within itself.

```ts
export type Wall = {
  id: string;           // `wall-${index}`, stable for the same footprint
  index: number;        // the footprint edge this wall runs along: ring[index] → ring[index + 1]
  polygon: [Point, Point, Point, Point]; // plan outline, local metres: outer start, outer end, inner end, inner start
  length: number;       // metres, length of the outer edge
  thickness: number;    // metres
  height: number;       // metres, from the footprint
  planArea: number;     // m², area of `polygon`
  faceArea: number;     // m², length × height (the outer face, before openings)
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
export type BuildingErrorReason = 'invalid-footprint' | 'invalid-thickness' | 'thickness-too-large';
export class InvalidBuildingError extends Error {
  constructor(readonly reason: BuildingErrorReason, message?: string);
}
```

Units and frame are those of the footprint ring: local metres, x east, y north, counter-clockwise.

## Pipeline

The steps run in this order. When several errors apply, the first failing step decides the reason.

1. **Footprint.** `buildWalls` does not trust its input. `normaliseRing(footprint.ring)` must return a ring equal to `footprint.ring` (same length, and `===` on every `x` and `y`), and `footprint.height` must be finite and greater than 0. Otherwise `invalid-footprint`. An `InvalidFootprintError` from `normaliseRing` is caught and rethrown as `invalid-footprint`. This rules out clockwise rings, short or zero-length edges, non-finite vertices, self-intersections and full reversals. `crs` and `origin` are not used by this step and not checked.
2. **Thickness.** Finite and at least 0.001 m (1 mm, the same minimum as an edge), otherwise `invalid-thickness`. Below that, `ring + thickness · n` can round back to `ring` and produce walls of zero area.
3. **Inward normals.** For each edge `ring[i] → ring[i+1]`, the inward unit normal is its left normal `(−dy, dx) / length`, because the ring is counter-clockwise.
4. **Inner vertices (mitres).** For vertex `i`, with `n1` the normal of the edge ending at it and `n2` the normal of the edge starting at it: `inner[i] = ring[i] + thickness · (n1 + n2) / (1 + n1·n2)`. This works for convex corners, reflex corners and collinear vertices (`n1 = n2` gives `ring[i] + thickness · n1`), and avoids intersecting two nearly parallel offset lines. Step 1 rules out a full reversal, but a very sharp spike can still make `1 + n1·n2` round to 0 or below. If `1 + n1·n2 < 1e-6` (a mitre more than about 1,400 times the thickness), or an inner vertex is not finite, throw `thickness-too-large` with a message starting `4:`.
5. **Validity of the inner ring.** The checks run in this order. The first that fails throws `thickness-too-large` with a message starting with its id (`5a:`, `5b:` or `5d:`), so tests can tell them apart.
   - a. Every inner edge points the same way as its outer edge (dot product greater than 0) and is at least 1 mm long.
   - b. The inner ring is simple. Step 01's check moves to `src/core/geometry.ts` as `findSelfIntersection(ring): [number, number] | null` (the indexes of two non-adjacent edges that intersect or touch). Each caller maps a result to its own error. Step 01's tests must stay green without changes.
   - c. (Removed.) A counter-clockwise check is implied by 5a and 5b: every inner edge points the same way as its outer edge, so the inner ring turns through the same total angle as the footprint, and a simple ring that turns +360° is counter-clockwise. The id is not reused.
   - d. The inner ring lies inside the footprint: every inner vertex is strictly inside the footprint ring, and no inner edge meets an outer edge. No known input passes 5a and 5b and fails 5d (140,000 fuzzed cases), but there is no proof either, so the check stays as a cheap guard. Remove it only with a proof.

   Orientation alone is not enough. A triangle offset past its inradius comes out point-reflected through the incentre, which is still counter-clockwise; check (a) catches it. A building with a narrow neck can self-intersect without any edge reversing; check (b) catches that.
6. **Walls.** Wall `i` has `polygon = [ring[i], ring[i+1], inner[i+1], inner[i]]` (new point objects), `length = |ring[i+1] − ring[i]|`, `height = footprint.height`, `planArea` = area of the polygon, `faceArea = length × height`.

Edges are never dropped. If a true offset would make an edge disappear (for example a short chamfer at a large thickness), `buildWalls` rejects the thickness instead.

## Invariants

For every `Building` returned:

1. `walls.length === footprint.ring.length`, and wall `i` has `index === i` and `id === 'wall-' + i`.
2. Each wall polygon is a convex quadrilateral, counter-clockwise, with `planArea > 0`. (Its inner edge lies on the offset line of its outer edge and points the same way, so it is a trapezoid.)
3. Adjacent walls share exactly one edge: wall `i`'s outer end and inner end have the same coordinates (`===`) as wall `i+1`'s outer start and inner start, and the last wall meets the first. They are distinct objects.
4. Every inner vertex lies at distance `thickness` from the lines of both edges that meet at it, within 1e-6 m.
5. The inner ring lies inside the footprint: every inner vertex is strictly inside the footprint ring, and no inner edge meets an outer edge.
6. No two walls overlap. For every pair of walls, adjacent pairs included, take as axes the unit normals of all edges of both polygons. On each axis the gap is the minimum projection of one polygon minus the maximum projection of the other (in either order, the larger of the two). The largest gap over all axes is at least −1e-9 m: touching along a shared edge is allowed. If this fails on a building that passed checks 5a to 5d, stop and report it; don't add a check to make the test pass.
7. Calling `buildWalls` twice on the same footprint gives equal output.

"Sum of wall areas = footprint area − inner area" is not an invariant here: it holds for any choice of inner vertices, because the shared edges cancel, so it proves nothing about coverage. Check 5d and invariant 6 do that job. The acceptance criteria still check the totals.

## Acceptance criteria

Hand-computed and cross-checked with Shapely (`buffer(−t, join_style=mitre)`). Tolerances: 1e-9 m for coordinates, 1e-6 m² for areas.

1. Rectangle `(0,0) (10,0) (10,20) (0,20)`, thickness 0.3: 4 walls; inner ring `(0.3,0.3) (9.7,0.3) (9.7,19.7) (0.3,19.7)`; wall 0 polygon `(0,0) (10,0) (9.7,0.3) (0.3,0.3)` with `planArea` 2.91 m² and `faceArea` = 10 × height; total `planArea` 17.64 m².
2. L-shape `(0,0) (10,0) (10,4) (4,4) (4,10) (0,10)`, thickness 0.3: the reflex corner `(4,4)` gives inner vertex `(3.7,3.7)`; total 11.64 m².
3. Collinear vertex `(0,0) (5,0) (10,0) (10,10) (0,10)`, thickness 0.3: 5 walls; the inner vertex at `(5,0)` is `(5,0.3)`; total 11.64 m².
4. Short edge between two reflex corners, a notch: `(0,0) (10,0) (10,10) (5.1,10) (5.1,9) (4.9,9) (4.9,10) (0,10)`, thickness 0.3: valid, total 12.24 m².
5. Short chamfer between two convex corners: `(0.2,0) (10,0) (10,10) (0,10) (0,0.2)`. Thickness 0.3 is valid (total 11.620294 m²). Thickness 0.4 throws `thickness-too-large` with `5a:`: the chamfer's inner edge reverses, where a true offset would drop the edge.
6. Thin triangle `(0,0) (10,0) (0,1)` (inradius about 0.475 m): thickness 0.3 is valid (total 4.321025 m²); thickness 0.48 throws `thickness-too-large` with `5a:`, although the inner ring is still counter-clockwise.
7. Narrow neck: two blocks joined by a neck 0.5 m wide, ring `(0,0) (10,0) (10,4.75) (15,4.75) (15,0) (25,0) (25,10) (14.8,10) (14.8,5.25) (10.2,5.25) (10.2,10) (0,10)`. The neck's sides are offset from the blocks' sides on purpose, so the inner edges cross properly instead of only touching. Thickness 0.2 is valid (total 17.64 m²). Thickness 0.3 throws `thickness-too-large` with `5b:`, with every inner edge still pointing the right way. The same ring rotated by 30° about `(0,0)` (then normalised) gives the same two results.
8. Rectangle 10 × 20 with thickness 5 (inner edges of length 0) and 6 (inverted) both throw `thickness-too-large`.
9. Thickness 0, 0.0005, −1, NaN and Infinity throw `invalid-thickness`.
10. Very sharp spike `(0,0) (1000,0) (0,0.002)`, a valid footprint (area 1 m²): thickness 0.3 throws `thickness-too-large` with `4:` (`1 + n1·n2` is about 2e-12 at `(1000,0)`).
11. A clockwise ring, a ring that `normaliseRing` would rotate to another start vertex, a ring with a NaN vertex, and a height of NaN each throw `invalid-footprint`.
12. Real fixture: the step 01 footprint of `fixtures/berlin-lod2-building.geojson` with height 12 and thickness 0.3 gives 7 walls, total `planArea` 31.7720685 m² within 1e-6 m², and invariants 1 to 6 hold. The expected value is Shapely's band area for the ring that `footprintFromGeoJSON` produces. The original EPSG:25833 ring gives 31.772059 m²: the GeoJSON's 9 decimal places move the vertices by about 0.1 mm, which moves the area by about 1e-5 m².
13. Property tests with fast-check. The star-polygon generator moves from `footprint.property.test.ts` to `src/core/testing/generators.ts` (test-only, not exported from `index.ts`); step 01's tests change only their imports and must keep passing. Every generated ring goes through `normaliseRing` (for star polygons, the reversed and rotated `variant`) and becomes a footprint with height 10, origin `(0, 0)` and crs `EPSG:25833`. Thickness is never below 0.01 m.
    - Must succeed: rectangles with sides from 1 to 100 m and thickness below 0.45 × the shorter side; regular polygons with 3 to 12 sides, circumradius 2 to 100 m and thickness below 0.9 × the inradius. `buildWalls` must not throw, and invariants 1 to 7 hold.
    - Spiky star polygons (the shared generator), thickness 0.01 to 1 m, 200 runs: each case either throws `thickness-too-large` or satisfies invariants 1 to 7. No success threshold: this generator makes needle-like spikes that the guard in step 4 rightly rejects (about 35% of cases in the first implementation).
    - Gentle star polygons, thickness 0.01 to 1 m, 200 runs: a base radius R from 5 to 500 m per polygon, and each vertex radius from R/2 to R, so no needles. Each case either throws `thickness-too-large` or satisfies invariants 1 to 7, and at least 80% of the runs succeed, so a stub that always throws fails. Report the measured rate. If it is below 80%, stop and report; don't lower the threshold.

## Out of scope

Rendering (step 03), openings (step 04), merging collinear walls, different thicknesses per wall, joints other than mitres, roofs and slabs. Necks or gaps narrower than float64 can resolve (for example 1e-12 m) pass check 5b; detecting near-degenerate geometry is not part of this step.

## Verification plan

- The agent writes `scripts/debug-walls-svg.ts` (outside `src/`, no tests): it draws the fixture's walls with their ids, so I can check the mitres by eye.
- Independent check: compute the fixture's band area with Shapely (`uv run --with shapely`, mitre join, high mitre limit) and compare it with the sum of `planArea`.
- Record anything the agent got wrong in `VERIFY.md`.

## Dependencies

None new.

## Open questions

None.
