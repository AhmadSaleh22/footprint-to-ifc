import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import type { Opening } from '../core'
import { createBuildingStore, type BuildingState } from './store'
import { rectangleBuilding } from './testing/buildings'

type Input = Omit<Opening, 'id'>

const input = (over: Partial<Input> = {}): Input => ({ wallId: 'wall-0', offset: 2, sill: 0.9, width: 1, height: 1.4, ...over })

/** A store on the rectangle (0,0) (10,0) (10,20) (0,20), height 12, thickness 0.3. */
const newStore = () => createBuildingStore(rectangleBuilding().footprint)

const idsOf = (state: BuildingState): string[] => state.openings.map((o) => o.id)

/** Replays commands onto the history base (empty until a thickness change), as invariant 5 defines the openings. */
const replay = (past: BuildingState['history']['past'], base: Opening[] = []): Opening[] => {
  let list: Opening[] = [...base]
  for (const command of past) list = command.type === 'add' ? [...list, command.opening] : list.filter((o) => o.id !== command.opening.id)
  return list
}

describe('addOpening', () => {
  test('9. adds an opening with the next id, starting at opening-1, and records it', () => {
    const store = newStore()
    store.getState().addOpening(input())
    store.getState().addOpening(input({ offset: 5 }))
    const state = store.getState()
    expect(idsOf(state)).toEqual(['opening-1', 'opening-2'])
    expect(state.openings[0]).toEqual({ id: 'opening-1', wallId: 'wall-0', offset: 2, sill: 0.9, width: 1, height: 1.4 })
    expect(state.history.past).toEqual([
      { type: 'add', opening: state.openings[0] },
      { type: 'add', opening: state.openings[1] },
    ])
    expect(state.history.future).toEqual([])
    expect(state.error).toBeNull()
  })

  test('9. a rejected add sets the error and changes nothing else, and consumes no id', () => {
    const store = newStore()
    store.getState().addOpening(input())
    const before = store.getState()
    store.getState().addOpening(input({ offset: 2.5 }))
    const after = store.getState()
    expect(after.error).toEqual({ reason: 'overlaps-opening' })
    expect(after.openings).toBe(before.openings)
    expect(after.history).toBe(before.history)
    store.getState().addOpening(input({ offset: 5 }))
    expect(idsOf(store.getState())).toEqual(['opening-1', 'opening-2'])
  })

  test.each([
    ['outside-wall', { offset: 50 }],
    ['invalid-size', { width: Number.NaN }],
    ['unknown-wall', { wallId: 'wall-99' }],
  ] as const)('a %s input sets that reason', (reason, over) => {
    const store = newStore()
    store.getState().addOpening(input(over))
    expect(store.getState().error).toEqual({ reason })
    expect(store.getState().openings).toEqual([])
  })

  test('a successful add clears an earlier error', () => {
    const store = newStore()
    store.getState().addOpening(input({ offset: 50 }))
    expect(store.getState().error).not.toBeNull()
    store.getState().addOpening(input())
    expect(store.getState().error).toBeNull()
  })

  test('with no building (error state) it sets unknown-wall and changes nothing else', () => {
    const store = newStore()
    store.getState().setThickness(10)
    store.getState().addOpening(input())
    expect(store.getState().error).toEqual({ reason: 'unknown-wall' })
    expect(store.getState().openings).toEqual([])
    expect(store.getState().history.past).toEqual([])
  })
})

describe('undo, redo and remove', () => {
  test('9. add, undo, redo gives back the same opening with the same id', () => {
    const store = newStore()
    store.getState().addOpening(input())
    const opening = store.getState().openings[0]!
    store.getState().undo()
    expect(store.getState().openings).toEqual([])
    expect(store.getState().history).toEqual({ past: [], future: [{ type: 'add', opening }] })
    store.getState().redo()
    expect(store.getState().openings).toEqual([opening])
    expect(store.getState().history).toEqual({ past: [{ type: 'add', opening }], future: [] })
  })

  test('9. remove then undo restores the opening with the same id, in its old place', () => {
    const store = newStore()
    store.getState().addOpening(input({ offset: 1 }))
    store.getState().addOpening(input({ offset: 4 }))
    store.getState().addOpening(input({ offset: 7 }))
    const [a, b, c] = store.getState().openings
    store.getState().removeOpening('opening-1')
    expect(store.getState().openings).toEqual([b, c])
    expect(store.getState().history.past.at(-1)).toEqual({ type: 'remove', opening: a })
    store.getState().undo()
    expect(store.getState().openings).toEqual([a, b, c])
  })

  test('removing an unknown id does nothing', () => {
    const store = newStore()
    store.getState().addOpening(input())
    const before = store.getState()
    store.getState().removeOpening('opening-9')
    expect(store.getState().openings).toBe(before.openings)
    expect(store.getState().history).toBe(before.history)
  })

  test('9. a new add after an undo clears the future', () => {
    const store = newStore()
    store.getState().addOpening(input())
    store.getState().undo()
    expect(store.getState().history.future).toHaveLength(1)
    store.getState().addOpening(input({ offset: 6 }))
    expect(store.getState().history.future).toEqual([])
    store.getState().redo()
    expect(idsOf(store.getState())).toEqual(['opening-2'])
  })

  test('ids are never reused: undo of an add, then a new add, gets a new id', () => {
    const store = newStore()
    store.getState().addOpening(input())
    store.getState().undo()
    store.getState().addOpening(input())
    expect(idsOf(store.getState())).toEqual(['opening-2'])
  })

  test('undo and redo do nothing on empty stacks', () => {
    const store = newStore()
    const before = store.getState()
    store.getState().undo()
    store.getState().redo()
    expect(store.getState().openings).toBe(before.openings)
    expect(store.getState().history).toBe(before.history)
  })

  test('undo and redo clear the error', () => {
    const store = newStore()
    store.getState().addOpening(input())
    store.getState().addOpening(input({ offset: 50 }))
    expect(store.getState().error).not.toBeNull()
    store.getState().undo()
    expect(store.getState().error).toBeNull()
    store.getState().addOpening(input({ offset: 50 }))
    store.getState().redo()
    expect(store.getState().error).toBeNull()
  })
})

describe('the error state (no building)', () => {
  const inErrorState = () => {
    const store = newStore()
    store.getState().addOpening(input())
    store.getState().setThickness(10)
    return store
  }

  test('removeOpening, undo and redo do nothing and leave the error alone', () => {
    const store = inErrorState()
    const before = store.getState()
    expect(before.error).toEqual({ reason: 'thickness-too-large' })
    store.getState().removeOpening('opening-1')
    store.getState().undo()
    store.getState().redo()
    const after = store.getState()
    expect(after.error).toEqual({ reason: 'thickness-too-large' })
    expect(after.openings).toBe(before.openings)
    expect(after.history).toBe(before.history)
  })

  test('a thickness-too-large error keeps the openings and the history', () => {
    const store = inErrorState()
    expect(idsOf(store.getState())).toEqual(['opening-1'])
    expect(store.getState().history.past).toHaveLength(1)
  })

  test('recovering with a thickness the openings fit keeps them and clears the history', () => {
    const store = inErrorState()
    store.getState().setThickness(0.3)
    expect(store.getState().error).toBeNull()
    expect(store.getState().building?.walls).toHaveLength(4)
    expect(idsOf(store.getState())).toEqual(['opening-1'])
    expect(store.getState().history).toEqual({ past: [], future: [] })
  })
})

describe('select', () => {
  test('clears an opening error when a building exists', () => {
    const store = newStore()
    store.getState().addOpening(input({ offset: 50 }))
    store.getState().select('wall-1')
    expect(store.getState().error).toBeNull()
    expect(store.getState().selectedId).toBe('wall-1')
  })

  test('keeps the error when there is no building', () => {
    const store = newStore()
    store.getState().setThickness(10)
    store.getState().select(null)
    expect(store.getState().error).toEqual({ reason: 'thickness-too-large' })
  })
})

describe('setThickness with openings', () => {
  const withOpening = () => {
    const store = newStore()
    store.getState().addOpening(input({ offset: 0.41, width: 1 }))
    return store
  }

  test('10. 0.5 is refused with openings-conflict and everything keeps its value', () => {
    const store = withOpening()
    store.getState().select('wall-0')
    const before = store.getState()
    store.getState().setThickness(0.5)
    const after = store.getState()
    expect(after.error).toEqual({ reason: 'openings-conflict' })
    expect(after.thickness).toBe(0.3)
    expect(after.building).toBe(before.building)
    expect(after.openings).toBe(before.openings)
    expect(after.history).toBe(before.history)
    expect(after.selectedId).toBe('wall-0')
  })

  test('10. 0.2 then succeeds, keeps the opening, clears the history, so undo does nothing', () => {
    const store = withOpening()
    store.getState().setThickness(0.5)
    store.getState().setThickness(0.2)
    const state = store.getState()
    expect(state.error).toBeNull()
    expect(state.thickness).toBe(0.2)
    expect(idsOf(state)).toEqual(['opening-1'])
    expect(state.history).toEqual({ past: [], future: [] })
    store.getState().undo()
    expect(idsOf(store.getState())).toEqual(['opening-1'])
  })

  test('from the error state a conflicting thickness is refused and the rejected thickness stays', () => {
    const store = withOpening()
    store.getState().setThickness(10)
    store.getState().setThickness(0.5)
    const state = store.getState()
    expect(state.error).toEqual({ reason: 'openings-conflict' })
    expect(state.thickness).toBe(10)
    expect(state.building).toBeNull()
    store.getState().setThickness(0.3)
    expect(store.getState().error).toBeNull()
    expect(store.getState().building).not.toBeNull()
  })

  test('without openings a thicker wall is accepted as in step 03', () => {
    const store = newStore()
    store.getState().setThickness(0.5)
    expect(store.getState().thickness).toBe(0.5)
    expect(store.getState().error).toBeNull()
  })

  test('a failed thickness (too large) does not touch the openings', () => {
    const store = withOpening()
    const before = store.getState().openings
    store.getState().setThickness(10)
    expect(store.getState().openings).toBe(before)
  })

  test('after a thickness change the old openings are the history base: add, undo and redo keep them', () => {
    const store = withOpening()
    store.getState().setThickness(0.2)
    store.getState().addOpening(input({ offset: 5 }))
    store.getState().undo()
    expect(idsOf(store.getState())).toEqual(['opening-1'])
    store.getState().redo()
    expect(idsOf(store.getState())).toEqual(['opening-1', 'opening-2'])
    store.getState().removeOpening('opening-1')
    store.getState().undo()
    expect(idsOf(store.getState())).toEqual(['opening-1', 'opening-2'])
  })

  test('the id counter survives a thickness change', () => {
    const store = withOpening()
    store.getState().setThickness(0.2)
    store.getState().addOpening(input({ offset: 5 }))
    expect(idsOf(store.getState())).toEqual(['opening-1', 'opening-2'])
  })
})

describe('5. invariant: openings equal the replay of past, ids are unique', () => {
  type Op =
    | { kind: 'add'; input: Input }
    | { kind: 'remove'; index: number }
    | { kind: 'undo' }
    | { kind: 'redo' }

  const operation: fc.Arbitrary<Op> = fc.oneof(
    fc.record({
      kind: fc.constant<'add'>('add' as const),
      input: fc.record({
        wallId: fc.constantFrom('wall-0', 'wall-1', 'wall-2', 'wall-3', 'wall-99'),
        offset: fc.double({ min: -1, max: 12, noNaN: true }),
        sill: fc.double({ min: 0, max: 5, noNaN: true }),
        width: fc.double({ min: 0, max: 3, noNaN: true }),
        height: fc.double({ min: 0, max: 3, noNaN: true }),
      }),
    }),
    fc.record({ kind: fc.constant<'remove'>('remove' as const), index: fc.nat(5) }),
    fc.constant<Op>({ kind: 'undo' }),
    fc.constant<Op>({ kind: 'redo' }),
  )

  test('after any sequence of add, remove, undo and redo', () => {
    fc.assert(
      fc.property(fc.array(operation, { maxLength: 40 }), (operations) => {
        const store = newStore()
        for (const op of operations) {
          const state = store.getState()
          if (op.kind === 'add') state.addOpening(op.input)
          else if (op.kind === 'remove') state.removeOpening(state.openings[op.index]?.id ?? 'opening-none')
          else if (op.kind === 'undo') state.undo()
          else state.redo()
          const now = store.getState()
          expect(now.openings).toEqual(replay(now.history.past, now.historyBase))
          expect(new Set(idsOf(now)).size).toBe(now.openings.length)
        }
      }),
      { numRuns: 200 },
    )
  })

  test('every opening the store accepts is valid for the building', () => {
    fc.assert(
      fc.property(fc.array(operation, { maxLength: 40 }), (operations) => {
        const store = newStore()
        for (const op of operations) {
          const state = store.getState()
          if (op.kind === 'add') state.addOpening(op.input)
          else if (op.kind === 'undo') state.undo()
          else if (op.kind === 'redo') state.redo()
        }
        const { openings, building } = store.getState()
        for (const o of openings) {
          const wall = building!.walls.find((w) => w.id === o.wallId)!
          expect(o.offset).toBeGreaterThanOrEqual(0.4 - 1e-9)
          expect(o.offset + o.width).toBeLessThanOrEqual(wall.length - 0.1 + 1e-9)
          expect(o.sill).toBeGreaterThanOrEqual(0.1)
          expect(o.sill + o.height).toBeLessThanOrEqual(12 - 0.1 + 1e-9)
        }
      }),
      { numRuns: 100 },
    )
  })
})
