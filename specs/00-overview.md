# 00 – Overview

## Goal

A browser app that takes one building footprint, builds an editable 3D model with walls and window openings, and exports it to IFC4. The point of the repo is the process: small specs, agent implementation, human review, independent verification.

## Scope

In: one building, one storey, straight walls along the footprint edges, rectangular openings, IFC4 export, round-trip verification.

Out: roofs, slabs, multiple storeys, curved walls, holes in footprints, multi-user editing, a backend.

## Steps

Each step gets its own spec, written and reviewed before implementation.

**01 – Footprint to local coordinates.** Parse a GeoJSON polygon in WGS84, project it to EPSG:25833, move it to a local origin and normalise the ring. (Spec written.)

**02 – Walls.** One wall per footprint edge, with thickness inward from the footprint and height from the input. Corners are mitred so walls neither overlap nor leave gaps. Key invariant: the sum of wall volumes equals (outer area − inner offset area) × height. Watch concave corners and edges shorter than the wall thickness.

**03 – Viewer and picking.** Render the model with Three.js inside React, using the axis mapping in `CLAUDE.md`. Clicking a wall selects it by id (raycasting), highlights it and shows its length and area in a side panel. Rebuilding the scene disposes old geometries, so the geometry count in `renderer.info.memory` stays flat after 50 rebuilds.

**04 – Openings.** Add a rectangular opening to the selected wall (offset along the wall, sill height, width, height). Reject openings outside the wall or overlapping another opening. The wall mesh is built from a profile with holes. Key invariant: net wall area = gross area − opening areas. Add and remove go through commands, so undo and redo work.

**05 – IFC export.** Write IFC4 with web-ifc: project with metre units, site with IfcMapConversion and IfcProjectedCRS for the origin offset, building, storey, one IfcWall per wall as an extruded profile, IfcOpeningElement per opening with IfcRelVoidsElement. Windows (IfcWindow with IfcRelFillsElement) only if time allows.

**06 – Round-trip verification.** Read the exported file back with web-ifc and compare element counts, ids and wall dimensions with the core model. Then check it with a tool that did not write it: an IfcOpenShell script that computes wall volumes with openings subtracted and runs `ifcopenshell.validate`. Open the file in a free IFC viewer and add a screenshot to the README.

## Time box

- Day 1: setup, 01, 02
- Day 2: 03, 04
- Day 3: 05, 06
- Day 4: `VERIFY.md`, README with a short screen recording, CI, cleanup

Step 05 is the riskiest. If writing IFC with web-ifc has not produced a valid file by midday on day 3, export walls without openings first and add openings after.

## Commit convention

- `spec(NN): …` the spec, written by me
- `feat(NN): …` implementation by the agent
- `review(NN): …` my changes after reviewing the agent's work, with the reason in the message body
- `test(NN): …` tests added after review
- `docs(verify): …` updates to `VERIFY.md`

The history should show the loop for every step: spec, implementation, review.
