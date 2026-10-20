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
- Not covered yet: the Berlin LoD2 fixture comparison (criterion 9), near-duplicate vertices in property tests, NaN/Infinity after projection.

## Step 02 – Walls

- Spec: `specs/02-walls.md`
- Checked by hand:
- Independent source used:
- Where the agent was wrong:
- Not covered yet:

<!-- Repeat for steps 03 to 06. -->
