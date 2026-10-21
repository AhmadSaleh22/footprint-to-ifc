import { createContext, useContext, type ReactNode } from 'react'
import { useStore, type StoreApi } from 'zustand'
import type { BuildingState } from './store'

const StoreContext = createContext<StoreApi<BuildingState> | null>(null)

/** Makes one building store available to the viewer and the panel. */
export function StoreProvider({ store, children }: { store: StoreApi<BuildingState>; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

/** The store itself, for reading the current state outside React renders (event handlers, the render loop). */
export function useBuildingStoreApi(): StoreApi<BuildingState> {
  const store = useContext(StoreContext)
  if (store === null) throw new Error('useBuildingStoreApi needs a StoreProvider')
  return store
}

/** Subscribes a component to a slice of the building store. */
export function useBuildingStore<T>(selector: (state: BuildingState) => T): T {
  return useStore(useBuildingStoreApi(), selector)
}
