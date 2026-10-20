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

- Spec: `specs/02-walls.md`
- Checked by hand:
- Independent source used:
- Where the agent was wrong:
- Not covered yet:

<!-- Repeat for steps 03 to 06. -->
