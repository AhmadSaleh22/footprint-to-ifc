import { useState } from 'react'
import { formatWallDetails, parseThickness } from './format'
import { useBuildingStore } from './StoreContext'

/** The side panel: thickness input, error banner, wall list and the selected wall's details. */
export function Panel() {
  const thickness = useBuildingStore((s) => s.thickness)
  const building = useBuildingStore((s) => s.building)
  const error = useBuildingStore((s) => s.error)
  const selectedId = useBuildingStore((s) => s.selectedId)
  const setThickness = useBuildingStore((s) => s.setThickness)
  const select = useBuildingStore((s) => s.select)
  const [text, setText] = useState(String(thickness))
  const selected = building?.walls.find((wall) => wall.id === selectedId)

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
            if (value !== null) setThickness(value)
          }}
        />
      </label>
      {error !== null && <div role="alert">{error.reason}</div>}
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
        <dl data-testid="wall-details">
          {formatWallDetails(selected).flatMap(({ label, value }) => [
            <dt key={`${label}-label`}>{label}</dt>,
            <dd key={`${label}-value`}>{value}</dd>,
          ])}
        </dl>
      )}
    </aside>
  )
}
