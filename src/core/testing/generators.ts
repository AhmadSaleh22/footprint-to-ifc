import fc from 'fast-check'

type P = { x: number; y: number }

/**
 * A number spread evenly over [min, max]. fc.double is biased toward its endpoints, so mid-range values are rare.
 * Only whole thousandths of the range are drawn.
 */
export const uniform = (min: number, max: number): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: 1_000_000 }).map((k) => min + (k / 1_000_000) * (max - min))

/**
 * Builds a star-shaped polygon around a centre: vertex i sits at angle i·step + jitter, with jitter below 0.4·step,
 * so consecutive angular gaps are between 0.6·step and 1.4·step (below π for n >= 3, above 0.07 rad for n <= 50).
 * `radii(n)` draws the n vertex radii in metres. Counter-clockwise, simple.
 */
const star = (radii: (n: number) => fc.Arbitrary<number[]>) =>
  fc
    .record({
      n: fc.integer({ min: 3, max: 50 }),
      cx: fc.double({ min: 0, max: 1000, noNaN: true }),
      cy: fc.double({ min: 0, max: 1000, noNaN: true }),
    })
    .chain(({ n, cx, cy }) =>
      fc
        .record({
          jitter: fc.array(fc.double({ min: 0, max: 0.4, noNaN: true }), { minLength: n, maxLength: n }),
          radii: radii(n),
          reverse: fc.boolean(),
          start: fc.integer({ min: 0, max: n - 1 }),
        })
        .map(({ jitter, radii, reverse, start }) => {
          const step = (2 * Math.PI) / n
          const ccw: P[] = jitter.map((j, i) => {
            const angle = (i + j) * step
            return { x: cx + radii[i]! * Math.cos(angle), y: cy + radii[i]! * Math.sin(angle) }
          })
          const variant = reverse ? [...ccw].reverse() : ccw
          const rotated = [...variant.slice(start), ...variant.slice(0, start)]
          return { ccw, variant: rotated }
        }),
    )

/** Spiky star polygons: each vertex radius is drawn from 1 to 500 m, so needle-like spikes are common. Vertices at least 1 cm apart. */
export const starPolygon = star((n) => fc.array(fc.double({ min: 1, max: 500, noNaN: true }), { minLength: n, maxLength: n }))

/** Gentle star polygons: a base radius R from 5 to 500 m per polygon, each vertex radius from R/2 to R, so no needles. */
export const gentleStarPolygon = star((n) =>
  uniform(5, 500).chain((base) => fc.array(uniform(base / 2, base), { minLength: n, maxLength: n })),
)
