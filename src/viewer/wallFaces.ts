import * as THREE from 'three'
import type { Opening, Wall } from '../core'
import { toThree } from './axes'

/**
 * Adds one triangle to `out`, wound so that its normal points the same way as `expected`. `triangulateShape` does
 * not promise a winding, so every triangle of a triangulated face goes through here.
 */
const pushOriented = (out: THREE.Vector3[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, expected: THREE.Vector3): void => {
  const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a))
  if (normal.dot(expected) < 0) out.push(a, c, b)
  else out.push(a, b, c)
}

/** A planar quad as two triangles, both facing `expected`. */
const pushQuad = (out: THREE.Vector3[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, expected: THREE.Vector3): void => {
  pushOriented(out, a, b, c, expected)
  pushOriented(out, a, c, d, expected)
}

/**
 * Splits triangles at vertices that lie exactly on one of their edges. Earcut drops the degenerate triangles that would
 * join collinear points, so holes whose corners line up (windows in a row at the same sill and height) leave a
 * triangle edge running past a hole corner without ending at it: a T-junction, so the mesh is not closed. Splitting the
 * triangle at that vertex keeps every hole corner a vertex of the face. Orientation is unchanged.
 * @param triangles Index triples into `points`.
 * @param points The 2D points in wall coordinates, metres.
 */
const splitAtVerticesOnEdges = (triangles: number[][], points: THREE.Vector2[]): number[][] => {
  const onEdge = (a: THREE.Vector2, b: THREE.Vector2, r: THREE.Vector2): boolean => {
    const cross = (b.x - a.x) * (r.y - a.y) - (b.y - a.y) * (r.x - a.x)
    if (cross !== 0) return false
    const t = ((r.x - a.x) * (b.x - a.x) + (r.y - a.y) * (b.y - a.y)) / a.distanceToSquared(b)
    return t > 0 && t < 1
  }
  const result = triangles.map((triangle) => [...triangle])
  for (let pass = 0; pass < points.length * 4; pass++) {
    let changed = false
    for (let t = 0; t < result.length && !changed; t++) {
      const tri = result[t]!
      for (let e = 0; e < 3 && !changed; e++) {
        const [a, b, c] = [tri[e]!, tri[(e + 1) % 3]!, tri[(e + 2) % 3]!]
        const r = points.findIndex((point, i) => i !== a && i !== b && i !== c && onEdge(points[a]!, points[b]!, point))
        if (r >= 0) {
          result.splice(t, 1, [a, r, c], [r, b, c])
          changed = true
        }
      }
    }
    if (!changed) break
  }
  return result
}

/**
 * A rectangular face with rectangular holes. The face is triangulated in 2D (wall coordinates) and the triangles are
 * built from the original 3D points by index, so every vertex is one of the points passed in.
 */
const pushFaceWithHoles = (
  out: THREE.Vector3[],
  contour: { points3: THREE.Vector3[]; points2: THREE.Vector2[] },
  holes: Array<{ points3: THREE.Vector3[]; points2: THREE.Vector2[] }>,
  expected: THREE.Vector3,
): void => {
  const points2 = [...contour.points2, ...holes.flatMap((hole) => hole.points2)]
  const points3 = [...contour.points3, ...holes.flatMap((hole) => hole.points3)]
  const triangles = THREE.ShapeUtils.triangulateShape(
    contour.points2.map((p) => p.clone()),
    holes.map((hole) => hole.points2.map((p) => p.clone())),
  )
  for (const [i, j, k] of splitAtVerticesOnEdges(triangles, points2)) {
    pushOriented(out, points3[i!]!, points3[j!]!, points3[k!]!, expected)
  }
}

/**
 * A closed mesh for a wall with rectangular through-holes. In wall coordinates (u along the outer edge from the outer
 * start, v up) the outer point is `O(u, v) = outerStart + u · axis + v · up` and the matching inner point is
 * `O(u, v) + thickness · inwardNormal`. Every hole corner is computed once and shared by the face that has the hole and
 * by the reveal, so shared vertices are bit-identical. The corners of the outer and inner faces are the wall polygon's
 * own points, so they also match the mitre end faces exactly.
 * @param wall A wall from core. Polygon in metres, local frame, outer start first, counter-clockwise from above.
 * @param openings The openings on this wall, already valid. Metres.
 * @returns A non-indexed geometry in metres, Three.js frame, every triangle facing out of the solid.
 */
export function openedWallGeometry(wall: Wall, openings: ReadonlyArray<Opening>): THREE.BufferGeometry {
  const [p0, p1, p2, p3] = wall.polygon
  const bottom = wall.polygon.map((p) => toThree(p, 0))
  const top = wall.polygon.map((p) => toThree(p, wall.height))
  const axis = { x: (p1.x - p0.x) / wall.length, y: (p1.y - p0.y) / wall.length }
  const inward = { x: -axis.y, y: axis.x } // the ring is counter-clockwise, so inward is to the left
  const outerNormal = toThree({ x: -inward.x, y: -inward.y }, 0)
  const innerNormal = toThree(inward, 0)
  const along = toThree(axis, 0)
  const up = new THREE.Vector3(0, 1, 0)
  const uOf = (p: { x: number; y: number }): number => (p.x - p0.x) * axis.x + (p.y - p0.y) * axis.y

  const out: THREE.Vector3[] = []
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => out.push(a, b, c, a, c, d)
  // top, bottom and the two mitre end faces, as in the plain prism
  quad(top[0]!, top[1]!, top[2]!, top[3]!)
  quad(bottom[0]!, bottom[3]!, bottom[2]!, bottom[1]!)
  quad(bottom[1]!, bottom[2]!, top[2]!, top[1]!)
  quad(bottom[3]!, bottom[0]!, top[0]!, top[3]!)

  const outerHoles: Array<{ points3: THREE.Vector3[]; points2: THREE.Vector2[] }> = []
  const innerHoles: Array<{ points3: THREE.Vector3[]; points2: THREE.Vector2[] }> = []
  for (const opening of openings) {
    const [u0, u1] = [opening.offset, opening.offset + opening.width]
    const [v0, v1] = [opening.sill, opening.sill + opening.height]
    const corners: Array<[number, number]> = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
    const outer = corners.map(([u, v]) => toThree({ x: p0.x + u * axis.x, y: p0.y + u * axis.y }, v))
    const inner = corners.map(([u, v]) =>
      toThree({ x: p0.x + u * axis.x + wall.thickness * inward.x, y: p0.y + u * axis.y + wall.thickness * inward.y }, v),
    )
    const points2 = corners.map(([u, v]) => new THREE.Vector2(u, v))
    outerHoles.push({ points3: outer, points2 })
    innerHoles.push({ points3: inner, points2: points2.map((p) => p.clone()) })
    // reveals: sill, head and the two jambs, each facing into the hole
    pushQuad(out, outer[0]!, outer[1]!, inner[1]!, inner[0]!, up)
    pushQuad(out, outer[3]!, outer[2]!, inner[2]!, inner[3]!, up.clone().negate())
    pushQuad(out, outer[0]!, outer[3]!, inner[3]!, inner[0]!, along)
    pushQuad(out, outer[1]!, outer[2]!, inner[2]!, inner[1]!, along.clone().negate())
  }

  const [uInnerStart, uInnerEnd] = [uOf(p3), uOf(p2)]
  pushFaceWithHoles(
    out,
    {
      points3: [bottom[0]!, bottom[1]!, top[1]!, top[0]!],
      points2: [[0, 0], [wall.length, 0], [wall.length, wall.height], [0, wall.height]].map(([u, v]) => new THREE.Vector2(u, v)),
    },
    outerHoles,
    outerNormal,
  )
  pushFaceWithHoles(
    out,
    {
      points3: [bottom[3]!, bottom[2]!, top[2]!, top[3]!],
      points2: [[uInnerStart, 0], [uInnerEnd, 0], [uInnerEnd, wall.height], [uInnerStart, wall.height]].map(([u, v]) => new THREE.Vector2(u, v)),
    },
    innerHoles,
    innerNormal,
  )

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.flatMap((v) => [v.x, v.y, v.z]), 3))
  geometry.computeVertexNormals()
  return geometry
}
