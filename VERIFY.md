# How this was verified

Every step in `specs/` was implemented with Claude Code and reviewed by me. This file records what I checked beyond the automated tests, and where the agent's output was wrong.

Rule for this file: only real events. If nothing went wrong in a step, write that.

## Step 01 – Footprint to local coordinates

- Spec: `specs/01-footprint-to-local.md`, three review rounds with the spec-reviewer agent, plus my own review with an AI assistant.
- Review findings I rejected, with evidence: "height doesn't cover NaN or negatives" (the rule "finite and > 0" already does); "instanceof needs prototype patching" (tsconfig targets ES2022); "a 1 mm boundary test is missing" (10.001 − 10 is 0.000999… in float64, so such a test checks rounding, not the rule).
- Datum: the reviewer said `towgs84=0` could break the 1 cm fixture check. PROJ itself uses the null transformation `ETRS89 to WGS 84 (1)` for this pair, so both sides follow the same convention. The spec now states it.
- The agent mutation-tested its own tests: 4 deliberate bugs, 2 not caught.
  - Adjacent-edge overlap rule: no test could fail on it alone. I checked the reasoning (doubling back always touches a non-adjacent edge, or fails zero-area with 3 vertices) and removed the rule from spec and code.
  - Area relative to the first vertex: no test told it apart from absolute coordinates. Added a translation property test; it fails on the absolute version (seed -963352739).
- Fixture: building DEBE02YY400000z3 from Berlin LoD2 tile LoD2_33_390_5816_1_BE.xml, near Methfesselstraße in Kreuzberg. The building nearest my starting point on Methfesselstraße, DEBE02YY400000yx (0.2 m away), and the next two nearest were not usable: they have BuildingParts, and DEBE02YY400000yx also has holes, neither of which spec 01 supports. I first wrote this as an assumption; the agent flagged it as unverified, and a check against the tile confirmed it. Converted with pyproj 3.7.2 and PROJ 9.5.1. PROJ's pipeline has no Helmert step, which confirms the null ETRS89 to WGS 84 transformation stated in the spec.
- Checked by hand on geojson.io: the polygon sits about 50 m south of Methfesselstraße, and its east edge lines up with the neighbouring building. The basemap draws no building at that exact spot, because its building layer is less detailed than LoD2.
- Before the fixture test existed, the agent predicted the origin (390248, 5816242), the vertex count and the start vertex. All three held. It then broke the code three ways (no reversal, no rotation, zone 32 instead of 33), and the tests caught each one.
- Not covered yet: near-duplicate vertices in property tests, NaN or Infinity after projection, near-collinear rings with float64 orientation, and no automated test for the extractor's --id mode.

## Step 02 – Walls

- Spec: `specs/02-walls.md`, three review rounds with the spec-reviewer agent, plus my own review with an AI assistant. Every number in the acceptance criteria was cross-checked with Shapely.
- Spec errors the reviewer caught:
  - "Sum of wall areas = footprint area − inner area" was in my draft as proof that walls don't overlap. It holds for any inner vertices, because shared edges cancel. Replaced with check 5d (inner ring inside the footprint) and a separating-axis no-overlap invariant.
  - My narrow-neck test case only made inner edges touch, not cross, so it depended on exact float coincidence. Replaced with a neck whose edges cross properly, plus a copy rotated by 30°.
  - The property test passed for a stub that always throws. Added must-succeed generators and an 80% success threshold.
- Findings I rejected: validating `crs` and `origin` (this step doesn't use them). I also corrected one: a 0.283 m chamfer is not rejected as soon as thickness exceeds its length; it survives 0.3 m and is rejected from about 0.34 m, because the limit depends on the corner angles.
- The agent stopped on two failing tests instead of changing them. Both were spec errors:
  - Star success rate 58% against 80%: my 95% estimate came from a different generator and predated the spike guard. Split into a spiky generator with no threshold and a gentle one that must succeed 80% of the time (measured about 96%).
  - Fixture area: my expected value came from the original EPSG:25833 ring, but the test reads the 9-decimal GeoJSON, which moves the area by about 1e-5 m². Corrected to 31.7720685 m², computed with Shapely on the same ring.
- Mutation testing: 16 deliberate bugs. The 4 survivors were all in checks 5c and 5d. Check 5c was removed, because 5a and 5b imply it (same edge directions, same +360° turn). Check 5d stays as a documented guard: no input in about 140,000 fuzzed cases reaches it, but there is no proof. My AI assistant first claimed it fired in about 1.5% of cases; that came from a simulation using Shapely's checks instead of ours, and was wrong. Nothing was built on that claim.
- The agent found that fast-check's `double` favours its endpoints, so most property cases used thickness 0.01 or 1 m. Switched step 02's draws to a uniform spread; the spiky success rate fell from 61% to 48%.
- Checked by hand: the debug SVG of the fixture's walls (mitres, ids, inner ring).
- Not covered yet: the debug script has no tests and isn't typechecked; the shared spiky generator still uses biased draws; geometry narrower than float precision; no proof for check 5d.

<!-- Repeat for steps 03 to 06. -->
