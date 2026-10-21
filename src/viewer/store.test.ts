import { describe, expect, test } from 'vitest'
import { createBuildingStore } from './store'
import { fixtureFootprint } from './testing/buildings'

describe('building store', () => {
  test('starts with thickness 0.3, a building of 7 walls, no error and no selection', () => {
    const state = createBuildingStore(fixtureFootprint()).getState()
    expect(state.thickness).toBe(0.3)
    expect(state.building?.walls).toHaveLength(7)
    expect(state.error).toBeNull()
    expect(state.selectedId).toBeNull()
  })

  test('8. setThickness(10) sets thickness-too-large and clears the building and the selection', () => {
    const store = createBuildingStore(fixtureFootprint())
    store.getState().select('wall-2')
    store.getState().setThickness(10)
    const state = store.getState()
    expect(state.error).toEqual({ reason: 'thickness-too-large' })
    expect(state.building).toBeNull()
    expect(state.selectedId).toBeNull()
    expect(state.thickness).toBe(10)
  })

  test('8. setThickness(0.3) afterwards clears the error and restores a building with 7 walls', () => {
    const store = createBuildingStore(fixtureFootprint())
    store.getState().setThickness(10)
    store.getState().setThickness(0.3)
    const state = store.getState()
    expect(state.error).toBeNull()
    expect(state.building?.walls).toHaveLength(7)
  })

  test('the footprint is set once and never cleared, so a rebuild after an error works', () => {
    const footprint = fixtureFootprint()
    const store = createBuildingStore(footprint)
    store.getState().setThickness(10)
    expect(store.getState().footprint).toBe(footprint)
    store.getState().setThickness(0.25)
    expect(store.getState().footprint).toBe(footprint)
    expect(store.getState().building?.footprint).toEqual(footprint)
  })

  test('a successful rebuild keeps the selection', () => {
    const store = createBuildingStore(fixtureFootprint())
    store.getState().select('wall-2')
    store.getState().setThickness(0.25)
    expect(store.getState().selectedId).toBe('wall-2')
    expect(store.getState().thickness).toBe(0.25)
  })

  test('invalid thicknesses report invalid-thickness', () => {
    const store = createBuildingStore(fixtureFootprint())
    store.getState().setThickness(0)
    expect(store.getState().error).toEqual({ reason: 'invalid-thickness' })
    expect(store.getState().building).toBeNull()
  })

  test('select sets and clears the selection', () => {
    const store = createBuildingStore(fixtureFootprint())
    store.getState().select('wall-4')
    expect(store.getState().selectedId).toBe('wall-4')
    store.getState().select(null)
    expect(store.getState().selectedId).toBeNull()
  })

  test('two stores are independent', () => {
    const a = createBuildingStore(fixtureFootprint())
    const b = createBuildingStore(fixtureFootprint())
    a.getState().setThickness(10)
    expect(b.getState().error).toBeNull()
  })
})
