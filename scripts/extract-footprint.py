#!/usr/bin/env python3
"""Prepare the spec 01 fixture from a Berlin LoD2 CityGML tile.

    uv run --with pyproj scripts/extract-footprint.py TILE.xml --list --near E N
    uv run --with pyproj scripts/extract-footprint.py TILE.xml --id GML_ID [--out-dir DIR]

Coordinates are EPSG:25833 (ETRS89 / UTM zone 33N), metres. Elements are matched by local name, so
CityGML 1.0 and 2.0 both work. Only the standard library is needed for --list; --id needs pyproj.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

LICENCE = "dl-zero-de/2.0"
DEFAULT_OUT_DIR = Path(__file__).resolve().parent.parent / "fixtures"
OUT_NAME = "berlin-lod2-building"
GEOJSON_DECIMALS = 9


class Problem(Exception):
    """A building cannot be used as a fixture."""


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def gml_id(element: ET.Element) -> str | None:
    for key, value in element.attrib.items():
        if local(key) == "id":
            return value
    return None


def buildings(path: Path):
    """Yield each top-level Building element; the caller must not keep references past the next step."""
    for _, element in ET.iterparse(path, events=("end",)):
        if local(element.tag) == "Building":
            yield element
            element.clear()


def descendants(element: ET.Element, name: str) -> list[ET.Element]:
    return [e for e in element.iter() if e is not element and local(e.tag) == name]


def ground_ring(building: ET.Element) -> list[tuple[float, float]]:
    """Exterior ring of the building's only GroundSurface: (easting, northing), z dropped, closing vertex dropped."""
    if descendants(building, "BuildingPart"):
        raise Problem("has BuildingParts")
    surfaces = descendants(building, "GroundSurface")
    if len(surfaces) == 0:
        raise Problem("no GroundSurface")
    if len(surfaces) > 1:
        raise Problem(f"{len(surfaces)} GroundSurfaces")
    surface = surfaces[0]
    polygons = descendants(surface, "Polygon")
    if len(polygons) != 1:
        raise Problem(f"GroundSurface has {len(polygons)} polygons, expected 1")
    if descendants(polygons[0], "interior"):
        raise Problem("GroundSurface has an interior ring (hole)")
    exteriors = descendants(polygons[0], "exterior")
    pos_lists = descendants(exteriors[0], "posList") if len(exteriors) == 1 else []
    if len(pos_lists) != 1:
        raise Problem("GroundSurface does not have exactly one exterior posList")
    pos_list = pos_lists[0]
    dimension = pos_list.attrib.get("srsDimension", "3")
    if dimension != "3":
        raise Problem(f"posList srsDimension is {dimension}, expected 3")
    try:
        values = [float(v) for v in (pos_list.text or "").split()]
    except ValueError as error:
        raise Problem(f"posList has a non-numeric value: {error}") from error
    if len(values) % 3 != 0:
        raise Problem(f"posList length {len(values)} is not a multiple of 3")
    points = [(values[i], values[i + 1]) for i in range(0, len(values), 3)]
    if len(points) < 4 or points[0] != points[-1]:
        raise Problem("exterior ring is not closed (first vertex differs from last) or has fewer than 3 vertices")
    return points[:-1]


def signed_area(ring: list[tuple[float, float]]) -> float:
    """Shoelace, relative to the first vertex so large UTM values keep their precision. Positive = counter-clockwise."""
    ox, oy = ring[0]
    twice = 0.0
    for i, (ax, ay) in enumerate(ring):
        bx, by = ring[(i + 1) % len(ring)]
        twice += (ax - ox) * (by - oy) - (bx - ox) * (ay - oy)
    return twice / 2


def distance_to_polygon(ring: list[tuple[float, float]], px: float, py: float) -> float:
    """0 when the point is inside the ring, else the distance to the nearest edge. Metres."""
    inside = False
    nearest = math.inf
    for i, (ax, ay) in enumerate(ring):
        bx, by = ring[(i + 1) % len(ring)]
        if (ay > py) != (by > py) and px < ax + (py - ay) * (bx - ax) / (by - ay):
            inside = not inside
        dx, dy = bx - ax, by - ay
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        nearest = min(nearest, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return 0.0 if inside else nearest


def list_near(tile: Path, easting: float, northing: float) -> None:
    candidates = []
    skipped: dict[str, int] = {}
    for building in buildings(tile):
        try:
            ring = ground_ring(building)
        except Problem as problem:
            skipped[str(problem)] = skipped.get(str(problem), 0) + 1
            continue
        candidates.append(
            (distance_to_polygon(ring, easting, northing), gml_id(building), len(ring), abs(signed_area(ring)))
        )
    candidates.sort(key=lambda c: c[0])
    print(f"{'gml:id':<24} {'vertices':>8} {'area m2':>10} {'distance m':>11}")
    for distance, building_id, count, area in candidates[:20]:
        print(f"{building_id or '?':<24} {count:>8} {area:>10.2f} {distance:>11.1f}")
    print(f"\n{len(candidates)} usable buildings (one GroundSurface, no BuildingParts, no holes). Skipped:")
    for reason, count in sorted(skipped.items(), key=lambda item: -item[1]):
        print(f"  {count:>5}  {reason}")


def extract(tile: Path, wanted: str, out_dir: Path) -> None:
    from pyproj import Transformer, __version__ as pyproj_version, proj_version_str

    for building in buildings(tile):
        if gml_id(building) != wanted:
            continue
        ring = ground_ring(building)
        transformer = Transformer.from_crs("EPSG:25833", "EPSG:4326", always_xy=True)
        lonlat = [transformer.transform(e, n) for e, n in ring]
        lonlat = [[round(lon, GEOJSON_DECIMALS), round(lat, GEOJSON_DECIMALS)] for lon, lat in lonlat]
        lonlat.append(lonlat[0])

        out_dir.mkdir(parents=True, exist_ok=True)
        reference = out_dir / f"{OUT_NAME}.25833.json"
        geojson = out_dir / f"{OUT_NAME}.geojson"
        reference.write_text(
            json.dumps(
                {
                    "source": f"{tile.name}, Berlin LoD2, licence {LICENCE}",
                    "buildingId": wanted,
                    "ring": [[e, n] for e, n in ring],
                },
                indent=2,
            )
            + "\n"
        )
        geojson.write_text(
            json.dumps(
                {
                    "type": "Feature",
                    "properties": {"buildingId": wanted},
                    "geometry": {"type": "Polygon", "coordinates": [lonlat]},
                },
                indent=2,
            )
            + "\n"
        )

        area = signed_area(ring)
        print(f"building {wanted}: {len(ring)} vertices, area {abs(area):.3f} m2, "
              f"source ring is {'counter-clockwise' if area > 0 else 'clockwise'}")
        print(f"pyproj {pyproj_version}, PROJ {proj_version_str}")
        print(f"transformation: {transformer.description}")
        print(f"definition: {transformer.definition}")
        print(f"accuracy: {transformer.accuracy}")
        print(f"wrote {reference}\nwrote {geojson}")
        return
    raise Problem(f"no Building with gml:id {wanted!r} in {tile.name}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tile", type=Path, help="CityGML tile, for example LoD2_33_390_5816_1_BE.xml")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--list", action="store_true", help="list the 20 closest usable buildings (needs --near)")
    mode.add_argument("--id", dest="building_id", help="gml:id of the building to extract")
    parser.add_argument("--near", nargs=2, type=float, metavar=("E", "N"), help="EPSG:25833 easting and northing, metres")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR, help=f"default: {DEFAULT_OUT_DIR}")
    args = parser.parse_args()
    if args.list and not args.near:
        parser.error("--list needs --near E N")
    try:
        if args.list:
            list_near(args.tile, *args.near)
        else:
            extract(args.tile, args.building_id, args.out_dir)
    except Problem as problem:
        print(f"error: {problem}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
