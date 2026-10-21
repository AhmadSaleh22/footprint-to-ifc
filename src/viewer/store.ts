import { createStore, type StoreApi } from 'zustand/vanilla'
import { InvalidBuildingError, buildWalls, type Building, type BuildingErrorReason, type Footprint } from '../core'

export type BuildingState = {
  /** Set once at creation and never cleared, so a rebuild after an error works. Local metres. */
  footprint: Footprint
  /** Wall thickness in metres, as last requested (also when it was rejected). */
  thickness: number
  /** The current building, or null while `error` is set. */
  building: Building | null
  error: { reason: BuildingErrorReason } | null
  selectedId: string | null
  /** Stores the thickness and rebuilds. An invalid thickness sets `error` and clears `building` and `selectedId`. */
  setThickness: (thickness: number) => void
  select: (id: string | null) => void
}

type Built = { building: Building; error: null } | { building: null; error: { reason: BuildingErrorReason } }

const build = (footprint: Footprint, thickness: number): Built => {
  try {
    return { building: buildWalls(footprint, thickness), error: null }
  } catch (error) {
    if (error instanceof InvalidBuildingError) return { building: null, error: { reason: error.reason } }
    throw error
  }
}

/**
 * Creates the building store. One store per footprint; the app creates it once.
 * @param footprint A footprint from step 01. Local metres.
 * @param thickness Initial wall thickness in metres. Default 0.3.
 */
export function createBuildingStore(footprint: Footprint, thickness = 0.3): StoreApi<BuildingState> {
  return createStore<BuildingState>((set) => ({
    footprint,
    thickness,
    ...build(footprint, thickness),
    selectedId: null,
    setThickness: (next) => {
      const built = build(footprint, next)
      set((state) => ({ thickness: next, ...built, selectedId: built.building === null ? null : state.selectedId }))
    },
    select: (id) => set({ selectedId: id }),
  }))
}
