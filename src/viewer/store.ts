import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  InvalidBuildingError,
  InvalidOpeningError,
  buildWalls,
  validateOpening,
  type Building,
  type BuildingErrorReason,
  type Footprint,
  type Opening,
  type OpeningErrorReason,
} from '../core'

/** `openings-conflict` exists in the viewer only: a thickness change was refused because an opening would not fit. */
export type StoreError = { reason: BuildingErrorReason | OpeningErrorReason | 'openings-conflict' }

/** One undoable change. Undo of a `remove` restores the same opening with the same id. */
export type Command = { type: 'add' | 'remove'; opening: Opening }

/** The fields of an opening the user chooses; the store assigns the id. Metres. */
export type OpeningInput = Omit<Opening, 'id'>

export type BuildingState = {
  /** Set once at creation and never cleared, so a rebuild after an error works. Local metres. */
  footprint: Footprint
  /** Wall thickness in metres, as last requested (also when it was rejected as invalid or too large). */
  thickness: number
  /** The current building, or null while a building error is set. */
  building: Building | null
  /** The one error shown to the user: a building error, an opening error or `openings-conflict`. */
  error: StoreError | null
  selectedId: string | null
  /** The openings on the building; always the result of applying `history.past` to an empty list. */
  openings: Opening[]
  history: { past: Command[]; future: Command[] }
  /**
   * The openings the history starts from: empty until a thickness change clears the history, then the openings at that
   * moment. `openings` is always `history.past` applied to this list.
   */
  historyBase: Opening[]
  /** The number the next opening id gets. Only grows: a rejected add, an undo or a thickness change never reuse ids. */
  nextOpeningNumber: number
  /**
   * Stores the thickness and rebuilds. An invalid thickness sets `error` and clears `building` and `selectedId`. If the
   * new building is valid but an opening would not fit it, the change is refused: everything keeps its value except
   * `error`, which becomes `openings-conflict`. A successful change clears `history`.
   */
  setThickness: (thickness: number) => void
  /** Clears the error when a building exists (an error that hides the model stays until it is fixed). */
  select: (id: string | null) => void
  /** Validates and adds an opening with the next id. On `InvalidOpeningError` sets `error` and changes nothing else. */
  addOpening: (input: OpeningInput) => void
  removeOpening: (id: string) => void
  undo: () => void
  redo: () => void
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

/** The openings that result from applying the commands, in order, to `base`. */
const replay = (past: ReadonlyArray<Command>, base: ReadonlyArray<Opening>): Opening[] => {
  let openings: Opening[] = [...base]
  for (const command of past) {
    openings = command.type === 'add' ? [...openings, command.opening] : openings.filter((o) => o.id !== command.opening.id)
  }
  return openings
}

/** True when some opening does not fit the building. */
const hasConflict = (building: Building, openings: ReadonlyArray<Opening>): boolean =>
  openings.some((opening) => {
    try {
      validateOpening(building, openings, opening)
      return false
    } catch (error) {
      if (error instanceof InvalidOpeningError) return true
      throw error
    }
  })

/**
 * Creates the building store. One store per footprint; the app creates it once.
 * @param footprint A footprint from step 01. Local metres.
 * @param thickness Initial wall thickness in metres. Default 0.3.
 */
export function createBuildingStore(footprint: Footprint, thickness = 0.3): StoreApi<BuildingState> {
  return createStore<BuildingState>((set, get) => {
    /** Applies a new command list: `openings` is always the replay of `past` onto `historyBase`. */
    const setHistory = (past: Command[], future: Command[], extra: Partial<BuildingState> = {}) =>
      set({ openings: replay(past, get().historyBase), history: { past, future }, error: null, ...extra })

    return {
      footprint,
      thickness,
      ...build(footprint, thickness),
      selectedId: null,
      openings: [],
      history: { past: [], future: [] },
      historyBase: [],
      nextOpeningNumber: 1,

      setThickness: (next) => {
        const built = build(footprint, next)
        const { openings, selectedId } = get()
        if (built.building === null) {
          set({ thickness: next, ...built, selectedId: null })
        } else if (hasConflict(built.building, openings)) {
          set({ error: { reason: 'openings-conflict' } })
        } else {
          set({ thickness: next, ...built, selectedId, history: { past: [], future: [] }, historyBase: openings })
        }
      },

      select: (id) => set((state) => ({ selectedId: id, error: state.building === null ? state.error : null })),

      addOpening: (input) => {
        const { building, openings, history, nextOpeningNumber } = get()
        if (building === null) {
          set({ error: { reason: 'unknown-wall' } })
          return
        }
        const opening: Opening = { id: `opening-${nextOpeningNumber}`, ...input }
        try {
          validateOpening(building, openings, opening)
        } catch (error) {
          if (error instanceof InvalidOpeningError) {
            set({ error: { reason: error.reason } })
            return
          }
          throw error
        }
        setHistory([...history.past, { type: 'add', opening }], [], { nextOpeningNumber: nextOpeningNumber + 1 })
      },

      removeOpening: (id) => {
        const { building, openings, history } = get()
        const opening = openings.find((o) => o.id === id)
        if (building === null || opening === undefined) return
        setHistory([...history.past, { type: 'remove', opening }], [])
      },

      undo: () => {
        const { building, history } = get()
        const command = history.past.at(-1)
        if (building === null || command === undefined) return
        setHistory(history.past.slice(0, -1), [...history.future, command])
      },

      redo: () => {
        const { building, history } = get()
        const command = history.future.at(-1)
        if (building === null || command === undefined) return
        setHistory([...history.past, command], history.future.slice(0, -1))
      },
    }
  })
}
