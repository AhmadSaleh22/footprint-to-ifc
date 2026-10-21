import geojsonRaw from '../fixtures/berlin-lod2-building.geojson?raw'
import './styles.css'
import { footprintFromGeoJSON } from './core'
import { Panel, StoreProvider, Viewer, createBuildingStore } from './viewer'

// Created once for the page: the footprint is read and projected a single time, at height 12 m.
const store = createBuildingStore(footprintFromGeoJSON(JSON.parse(geojsonRaw), 12))

export function App() {
  return (
    <StoreProvider store={store}>
      <div className="app">
        <Viewer />
        <Panel />
      </div>
    </StoreProvider>
  )
}
