# 01 – Footprint to local coordinates

## Goal

Turn a GeoJSON building footprint into a normalised ring in local metres, with the georeference kept separately.

## Inputs and outputs

Input:

- `feature`: GeoJSON `Feature<Polygon>` in WGS84 longitude/latitude (RFC 7946). Only the exterior ring is used.
- `height`: wall height in metres, passed through unchanged.

Output:

```ts
type Footprint = {
  origin: { easting: number; northing: number }; // EPSG:25833, metres
  ring: Array<{ x: number; y: number }>;         // local metres, relative to origin
  height: number;                                 // metres
};
```

- Projection: proj4 from EPSG:4326 to EPSG:25833 (`+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`).
- Origin: the minimum easting and northing of the projected ring, each rounded down to the whole metre.
- Ring: counter-clockwise, no repeated closing vertex, no consecutive vertices closer than 1 mm.

## Invariants

1. `ring.length >= 3`.
2. The signed area of `ring` is positive (counter-clockwise).
3. No two consecutive vertices, including last to first, are closer than 1 mm.
4. Adding `origin` back to every vertex reproduces the projected coordinates within 1 mm.
5. Normalisation does not change the area: within 1e-6 m² of the projected ring's area.
6. Reversing the input ring gives the same output ring, up to the choice of start vertex.

## Acceptance criteria

1. A clockwise rectangle comes out counter-clockwise with 4 vertices and the expected area.
2. A ring that repeats its first vertex at the end comes out without the repeat.
3. A ring with a duplicated consecutive vertex comes out with the duplicate removed.
4. A self-intersecting ring (bow-tie) throws `InvalidFootprintError` with reason `self-intersection`.
5. A ring with fewer than 3 distinct vertices throws `InvalidFootprintError` with reason `too-few-vertices`.
6. A `MultiPolygon` throws `InvalidFootprintError` with reason `unsupported-geometry`.
7. Real fixture: one vertex of `fixtures/berlin-building.geojson`, projected, matches a value computed independently with PROJ (`cs2cs`) or epsg.io within 1 cm. The test records the reference values and their source in a comment.
8. Property tests with fast-check, on random star-shaped polygons (random radii at sorted angles, which are always simple): invariants 2 to 6 hold.

## Edge cases and errors

- Collinear consecutive vertices are kept. Removing them changes wall count and belongs to step 02, if anywhere.
- Coordinates outside UTM zone 33 (longitude outside 12°E to 18°E) throw `InvalidFootprintError` with reason `outside-zone`.

## Out of scope

Holes, roofs, multiple buildings, walls (step 02), rendering (step 03).

## Verification plan

- Draw the ring as a debug SVG with vertex numbers, to check orientation and the start vertex by eye.
- Compare the planar area of the projected ring with a geodesic area from an independent library. They should agree within 1%. This is a sanity check, not proof.
- Record anything the agent got wrong in `VERIFY.md`.

## Open questions

- Fixture source: an OpenStreetMap footprint (ODbL, needs attribution in the README) or Berlin's open LoD2 data. Decide before writing test 7.
