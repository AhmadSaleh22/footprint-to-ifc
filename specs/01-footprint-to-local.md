# 01 – Footprint to local coordinates

## Goal

Turn a GeoJSON building footprint into a normalised ring in local metres, with the georeference kept separately.

## API

`src/core/footprint.ts`, synchronous and pure. Neither function mutates its input.

```ts
export type Footprint = {
  crs: 'EPSG:25833';
  origin: { easting: number; northing: number }; // whole metres in EPSG:25833
  ring: Array<{ x: number; y: number }>;         // metres relative to origin, x = east, y = north
  height: number;                                 // metres
};

// Full pipeline: validate, project, normalise, shift to origin.
export function footprintFromGeoJSON(feature: unknown, height: number): Footprint;

// Planar normalisation only (steps 6a to 6g). Input and output in the same planar frame, metres.
export function normaliseRing(points: ReadonlyArray<{ x: number; y: number }>): Array<{ x: number; y: number }>;
```

`src/core/errors.ts`:

```ts
export type FootprintErrorReason =
  | 'unsupported-geometry'
  | 'invalid-height'
  | 'invalid-coordinate'
  | 'outside-zone'
  | 'too-few-vertices'
  | 'zero-area'
  | 'self-intersection';

export class InvalidFootprintError extends Error {
  constructor(readonly reason: FootprintErrorReason, message?: string);
}
```

## Pipeline

The steps run in this order. When several errors apply, the first failing step decides the reason.

1. **Shape.** `feature` must be a GeoJSON Feature whose geometry is a Polygon with exactly one ring. Anything else is `unsupported-geometry`: MultiPolygon, a polygon with holes, a FeatureCollection, a bare geometry, a null geometry.
2. **Height.** Finite and greater than 0, otherwise `invalid-height`.
3. **Coordinates.** Every position has a finite longitude and latitude, and latitude is within [-90, 90]. Otherwise `invalid-coordinate`. A third value (altitude) is ignored.
4. **Zone.** Every vertex has longitude within [12, 18] degrees, inclusive. Otherwise `outside-zone`. This also catches swapped longitude and latitude for German data.
5. **Projection.** Each vertex goes from EPSG:4326 to EPSG:25833 with proj4, using `+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`.
6. **Normalisation** (`normaliseRing`), in projected metres:
   - a. If the last vertex is within 1 mm of the first, remove it. A ring without a closing vertex is treated as implicitly closed.
   - b. Walk the ring once and drop every vertex closer than 1 mm to the last kept vertex. Then, if the last kept vertex is closer than 1 mm to the first, drop the last.
   - c. Fewer than 3 vertices left: `too-few-vertices`.
   - d. Absolute signed area below 0.01 m²: `zero-area`. Compute the signed area relative to the first vertex (subtract it from every vertex before the shoelace). Products of absolute UTM coordinates are around 1e12 and lose the precision this threshold needs. Step 6f uses the same computation.
   - e. Two non-adjacent edges that intersect or touch, or two adjacent edges that overlap: `self-intersection`. Use exact float64 orientation tests, with no tolerance.
   - f. If the signed area is negative, reverse the ring.
   - g. Rotate the ring so it starts at the vertex with the lowest y, ties broken by the lowest x.
7. **Origin.** `floor` of the minimum easting and the minimum northing of the normalised ring.
8. **Shift.** Subtract the origin from every vertex. Keep full float64 precision, no rounding.

Datum: ETRS89 is treated as identical to WGS84 (the null transformation, about 1 m absolute accuracy). This is PROJ's default for this pair (`ETRS89 to WGS 84 (1)`). It does not affect relative geometry or acceptance criterion 9, because both sides use the same convention, and IFC georeferencing in step 05 uses the EPSG:25833 values directly.

## Invariants

1. `ring.length >= 3`.
2. Signed area (shoelace, x east, y north) is positive.
3. Consecutive vertices, including last to first, are at least 1 mm apart.
4. `origin.easting` and `origin.northing` are integers, and the minimum `x` and minimum `y` of `ring` are in [0, 1).
5. `ring[i] + origin` equals the corresponding projected vertex within 1e-6 m.
6. For `normaliseRing`, every output vertex is one of the input vertices. No vertex is added.
7. For rings with no two vertices closer than 1 mm, reversing the input or starting it at a different vertex gives exactly the same output. (With near-duplicates, which vertex of a pair survives step 6b depends on the walk direction, so this does not hold there.)
8. The input is not mutated.

## Acceptance criteria

`normaliseRing`, planar input in metres:

1. Clockwise rectangle `(0,0) (0,20) (10,20) (10,0)` returns `(0,0) (10,0) (10,20) (0,20)` with area 200 m² within 1e-9.
2. The same rectangle counter-clockwise, with `(0,0)` repeated at the end, returns the same 4 vertices.
3. The rectangle with `(10,0)` repeated exactly, and separately with `(10.0005, 0)` inserted after `(10,0)`, returns the same 4 vertices, keeping `(10,0)`.
4. Crossing ring `(0,0) (10,10) (10,0) (0,20)` (area 50 m²) throws `self-intersection`. A symmetric bow-tie is not used here: its area is 0, so it would fail at step 6d with `zero-area`.
5. Touching ring `(0,0) (10,0) (10,10) (5,0) (0,10)`, where `(5,0)` lies on the first edge, throws `self-intersection`.
6. `(0,0) (10,0)`, then `(0,0) (10,0) (10,0.0005)`, then the spike `(0,0) (10,0) (0,0)`: each throws `too-few-vertices`.
7. Collinear `(0,0) (5,0) (10,0)` throws `zero-area`.

`footprintFromGeoJSON`:

8. Each of these throws the stated reason: MultiPolygon or Polygon with a hole (`unsupported-geometry`); height 0 (`invalid-height`); a NaN coordinate (`invalid-coordinate`); longitude 11.9 (`outside-zone`); swapped position `[52.5, 13.4]` (`outside-zone`); a MultiPolygon that also contains NaN (`unsupported-geometry`, to prove the order).
9. Real fixture: `fixtures/berlin-lod2-building.geojson` is one building's ground surface from Berlin's open LoD2 data (EPSG:25833, licence dl-zero-de/2.0), converted to WGS84 with GDAL `ogr2ogr` at 9 decimal places. Every output vertex plus the origin matches a vertex in `fixtures/berlin-lod2-building.25833.json` within 1 cm, and the vertex counts match after removing the closing vertex. The tolerance is 1 cm because two independent implementations are compared (PROJ through GDAL, and proj4); 9 decimal places add at most about 0.1 mm.
10. Property tests with fast-check (default 100 runs; the seed is printed on failure). Generator: star-shaped polygons with 3 to 50 vertices at sorted angles at least 0.01 rad apart, radii from 1 to 500 m, centre anywhere in [0, 1000]². These are always simple, and their vertices are at least 1 cm apart. Each case is randomly reversed and rotated to a random start vertex.
    - On `normaliseRing`: invariants 1, 2, 3, 6, 7 and 8.
    - On `footprintFromGeoJSON`, with the same generator mapped to longitude and latitude around 13.4°E 52.5°N (radii 1e-5 to 5e-3 degrees): invariants 4 and 5.

## Out of scope

- Holes: rejected in step 1.
- Removing collinear vertices: step 02 decides.
- Multiple buildings.
- Footprints larger than about 1 km, where UTM scale distortion matters.
- Performance beyond about 1,000 vertices: the self-intersection check is O(n²).

## Verification plan

- Run `projinfo -s EPSG:4326 -t EPSG:25833` and record which transformation PROJ uses, with the GDAL and PROJ versions, in `VERIFY.md`.
- Draw the fixture ring as an SVG with vertex numbers (`scripts/debug-svg.ts`) to check orientation and the start vertex by eye.
- Record anything the agent got wrong in `VERIFY.md`.

## Dependencies

proj4 (runtime), @types/geojson (dev, types only), fast-check (already installed). No geodesic-area library: acceptance criterion 9 is a stronger check.

## Open questions

None. `Building` is defined in step 02, which holds a `Footprint`.
