import * as THREE from 'three'

// Test-only helpers for reading and checking wall geometry. Written separately from src/viewer/meshes.ts.

export type Triangle = [THREE.Vector3, THREE.Vector3, THREE.Vector3]

export const trianglesOf = (geometry: THREE.BufferGeometry): Triangle[] => {
  const position = geometry.getAttribute('position')
  const out: Triangle[] = []
  for (let i = 0; i + 2 < position.count; i += 3) {
    out.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, i + k)) as Triangle)
  }
  return out
}

/** Σ v0 · (v1 × v2) / 6 over the triangles. */
export const signedVolume = (triangles: Triangle[]): number =>
  triangles.reduce((sum, [a, b, c]) => sum + a.dot(new THREE.Vector3().crossVectors(b, c)) / 6, 0)

export const positionKey = (v: THREE.Vector3): string => `${v.x},${v.y},${v.z}`

/** Counts undirected and directed edges, with vertices compared by exact position. */
export const edgeCounts = (triangles: Triangle[]) => {
  const undirected = new Map<string, number>()
  const directed = new Map<string, number>()
  for (const t of triangles) {
    for (let i = 0; i < 3; i++) {
      const a = positionKey(t[i]!)
      const b = positionKey(t[(i + 1) % 3]!)
      const sorted = a < b ? `${a}|${b}` : `${b}|${a}`
      undirected.set(sorted, (undirected.get(sorted) ?? 0) + 1)
      directed.set(`${a}|${b}`, (directed.get(`${a}|${b}`) ?? 0) + 1)
    }
  }
  return { undirected, directed }
}

/**
 * What is wrong with the surface, as readable lines. Empty when it is closed and consistently wound: every edge is in
 * exactly two triangles, once in each direction.
 */
export const closedProblems = (triangles: Triangle[]): string[] => {
  const { undirected, directed } = edgeCounts(triangles)
  const problems: string[] = []
  for (const [edge, count] of undirected) if (count !== 2) problems.push(`edge ${edge} is in ${count} triangles`)
  for (const [edge, count] of directed) {
    const [a, b] = edge.split('|')
    if (count !== 1) problems.push(`directed edge ${edge} appears ${count} times`)
    if (directed.get(`${b}|${a}`) !== 1) problems.push(`reverse of ${edge} appears ${directed.get(`${b}|${a}`) ?? 0} times`)
  }
  return problems
}

export const triangleNormal = ([a, b, c]: Triangle): THREE.Vector3 =>
  new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()
