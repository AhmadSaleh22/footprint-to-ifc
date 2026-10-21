# footprint-to-ifc

[![CI](https://github.com/AhmadSaleh22/footprint-to-ifc/actions/workflows/ci.yml/badge.svg)](https://github.com/AhmadSaleh22/footprint-to-ifc/actions/workflows/ci.yml)

Turns a building footprint into a 3D building in the browser, with walls you can select. IFC export is next.

**Live demo:** https://ahmadsaleh22.github.io/footprint-to-ifc/

![The fixture building in the viewer, with its west wall selected](docs/viewer.png)

The fixture is a real building in Berlin-Kreuzberg, from the city's open LoD2 data.

## How it was built

Every step was built with Claude Code in the same loop, and the git history shows it:

1. I write a spec in `specs/` with invariants and concrete acceptance criteria. A read-only review agent (`.claude/agents/spec-reviewer.md`) checks it before any code exists.
2. Claude Code implements it, tests first (`feat(NN)` commits), and mutation-tests its own tests.
3. I review the result and commit my changes separately (`review(NN)`).
4. `VERIFY.md` records what I checked by hand, what I checked against an independent tool (PROJ, Shapely), and where the agent, the reviewer or I were wrong.

Some things this loop caught:

- An invariant I wrote, "sum of wall areas equals the band area", holds for any inner ring, so it proved nothing about overlap. It was replaced with an inside check and a separating-axis test.
- WebGL stores vertex positions as Float32. At a UTM northing of 5,816,000 m, Float32 values are 0.5 m apart, which is why core keeps coordinates relative to a local origin.
- A bug no test caught, `scene.add()` with no argument in the error state, was found in the console. Every e2e test now fails on console errors.
- fast-check's `double` favours its endpoints, so most property cases used the extreme thicknesses until the draws were made uniform.

Details are in [VERIFY.md](VERIFY.md).

## Status

- 01 Footprint to local coordinates (GeoJSON to EPSG:25833): done
- 02 Walls with mitred corners: done
- 03 Three.js viewer with picking: done
- 04 Openings: next
- 05 IFC export: planned
- 06 Round-trip
