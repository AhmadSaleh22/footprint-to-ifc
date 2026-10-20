# footprint-to-ifc

Turns a building footprint (GeoJSON) into an editable 3D building in the browser and exports it to IFC. See `CLAUDE.md` for the architecture rules and `specs/` for the steps.

## Setup

Requires Node 22.12 or newer and pnpm.

```
pnpm install
pnpm dev
```

Other scripts: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Version pins

- **TypeScript is pinned to 6.0.3**, not the latest 7.x. `typescript-eslint` (8.72.0) declares a peer range of `typescript >=4.8.4 <6.1.0`, so 7.x would break linting. Revisit when typescript-eslint supports it.
- **React is pinned to 18.3.1** to match the target stack, although the Vite template installs a newer major.
- All dependencies are pinned to exact versions (`.npmrc`: `save-exact=true`).

Fixture data: Berlin LoD2 building models, Senatsverwaltung für Stadtentwicklung, Bauen und Wohnen Berlin, licence dl-zero-de/2.0.
