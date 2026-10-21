import { useEffect, useState } from 'react'
import { openingRange, type Wall } from '../core'
import { formatNetFaceArea, formatWallDetails, parseThickness } from './format'
import { useBuildingStore, useBuildingStoreApi } from './StoreContext'

const DEFAULTS = { width: 1.2, height: 1.4, sill: 0.9 } // metres

/** The form that adds an opening to the selected wall. Remounted per wall, so the defaults follow the selection. */
function OpeningForm({ wall }: { wall: Wall }) {
  const addOpening = useBuildingStore((s) => s.addOpening)
  const range = openingRange(wall)
  const noRoom = range.min > range.max
  const [fields, setFields] = useState(() => ({
    // centred in the allowed range; editing the width later does not move it
    offset: String(noRoom ? 0 : Math.round(((range.min + range.max) / 2 - DEFAULTS.width / 2) * 1000) / 1000),
    sill: String(DEFAULTS.sill),
    width: String(DEFAULTS.width),
    height: String(DEFAULTS.height),
  }))
  const field = (name: keyof typeof fields, label: string) => (
    <label>
      {label}
      <input type="number" step={0.05} value={fields[name]} onChange={(event) => setFields({ ...fields, [name]: event.target.value })} />
    </label>
  )

  return (
    <form
      className="opening-form"
      onSubmit={(event) => {
        event.preventDefault()
        addOpening({
          wallId: wall.id,
          offset: Number(fields.offset),
          sill: Number(fields.sill),
          width: Number(fields.width),
          height: Number(fields.height),
        })
      }}
    >
      {field('offset', 'Offset (m)')}
      {field('sill', 'Sill (m)')}
      {field('width', 'Width (m)')}
      {field('height', 'Height (m)')}
      {noRoom && <p>No room for an opening on this wall.</p>}
      <button type="submit" disabled={noRoom}>
        Add opening
      </button>
    </form>
  )
}

/** The side panel: thickness, error banner, undo and redo, wall list, and the selected wall's details and openings. */
export function Panel() {
  const storeApi = useBuildingStoreApi()
  const thickness = useBuildingStore((s) => s.thickness)
  const building = useBuildingStore((s) => s.building)
  const error = useBuildingStore((s) => s.error)
  const selectedId = useBuildingStore((s) => s.selectedId)
  const openings = useBuildingStore((s) => s.openings)
  const history = useBuildingStore((s) => s.history)
  const setThickness = useBuildingStore((s) => s.setThickness)
  const select = useBuildingStore((s) => s.select)
  const removeOpening = useBuildingStore((s) => s.removeOpening)
  const undo = useBuildingStore((s) => s.undo)
  const redo = useBuildingStore((s) => s.redo)
  const [text, setText] = useState(String(thickness))
  const selected = building?.walls.find((wall) => wall.id === selectedId)

  // Ctrl+Z / Cmd+Z undoes, with Shift redoes, unless focus is in a text field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) storeApi.getState().redo()
        else storeApi.getState().undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [storeApi])

  return (
    <aside className="panel">
      <label>
        Thickness (m)
        <input
          type="number"
          step={0.05}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            const value = parseThickness(event.target.value)
            if (value === null) return
            setThickness(value)
            // A refused change leaves the store with another value: show that one.
            const stored = storeApi.getState().thickness
            if (stored !== value) setText(String(stored))
          }}
        />
      </label>
      {error !== null && <div role="alert">{error.reason}</div>}
      <div className="history">
        <button type="button" onClick={undo} disabled={building === null || history.past.length === 0}>
          Undo
        </button>
        <button type="button" onClick={redo} disabled={building === null || history.future.length === 0}>
          Redo
        </button>
      </div>
      <ul aria-label="Walls">
        {building?.walls.map((wall) => (
          <li key={wall.id}>
            <button type="button" aria-pressed={wall.id === selectedId} onClick={() => select(wall.id)}>
              {wall.id}
            </button>
          </li>
        ))}
      </ul>
      {selected !== undefined && (
        <>
          <dl data-testid="wall-details">
            {[...formatWallDetails(selected), formatNetFaceArea(selected, openings)].flatMap(({ label, value }) => [
              <dt key={`${label}-label`}>{label}</dt>,
              <dd key={`${label}-value`}>{value}</dd>,
            ])}
          </dl>
          <OpeningForm key={selected.id} wall={selected} />
          <ul aria-label="Openings" className="openings">
            {openings
              .filter((opening) => opening.wallId === selected.id)
              .map((opening) => (
                <li key={opening.id}>
                  <span>
                    {opening.id}: offset {opening.offset.toFixed(2)} m, sill {opening.sill.toFixed(2)} m, {opening.width.toFixed(2)} ×{' '}
                    {opening.height.toFixed(2)} m
                  </span>
                  <button type="button" aria-label={`Remove ${opening.id}`} onClick={() => removeOpening(opening.id)}>
                    Remove
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </aside>
  )
}
