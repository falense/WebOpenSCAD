# WebOpenSCAD

A web-based **parametric CAD** frontend for OpenSCAD. Model with a SolidWorks/Fusion-style
feature tree and named parameters — no code required — while OpenSCAD (compiled to
WebAssembly) does the solid geometry in your browser. Nothing is sent to a server.

![Parametric bracket sample](docs/screenshot.png)

## Features

- **Feature history tree** — primitives (box, cylinder, cone, sphere, torus, rounded box)
  and sketch-based features (extrude, revolve with rectangle/circle/polygon profiles),
  combined in order with **Add / Cut / Intersect** operations, exactly like the
  Join/Cut/Intersect workflow in Fusion 360.
- **Named parameters with expressions** — every field (dimensions, positions, rotations,
  pattern spacing, …) accepts expressions like `plate_w / 2 - hole_inset`. Change one
  parameter and the whole model rebuilds.
- **Linear & circular patterns and mirrors** per feature.
- **Live 3D viewport** (three.js): orbit/pan/zoom, standard views, zoom-to-fit,
  automatic rebuild as you edit.
- **Clean OpenSCAD export** — the generated `.scad` is readable, keeps your parameters
  as variables (works with the OpenSCAD customizer), and can be opened in desktop
  OpenSCAD any time. STL export for printing.
- **Undo/redo, autosave** (localStorage), and project save/load as JSON.
- Runs fully client-side via the official OpenSCAD [nightly WebAssembly builds](https://files.openscad.org/snapshots/)
  with the **Manifold** geometry backend — typical rebuilds take well under a second.

## Running (everything runs in Docker)

```bash
# one-time: install dependencies and download the OpenSCAD WASM engine
docker compose run --rm web sh -c "npm install && npm run fetch-engine"

# start the dev server with hot reload
docker compose up web
# → http://localhost:5173
```

Production build served by nginx:

```bash
docker compose --profile prod up prod --build
# → http://localhost:8080
```

### Other tasks

```bash
docker compose run --rm web npm test          # unit tests (expressions, codegen)
docker compose run --rm web npx tsc --noEmit  # typecheck
docker compose run --rm web npm run build     # production bundle to dist/
```

## How it works

```
Feature tree + parameters (JSON document)
        │  evaluateDoc()  — validates every expression against the parameter scope
        ▼
generateScad()  — emits readable, parametric OpenSCAD source
        ▼
Web Worker → OpenSCAD WASM → binary STL
        ▼
three.js viewport (STLLoader)
```

Key directories:

| Path | Purpose |
| --- | --- |
| `src/model/` | Document types, expression engine, OpenSCAD code generator |
| `src/engine/` | Compile worker (OpenSCAD WASM) + latest-wins compile queue |
| `src/state/` | zustand store: document, selection, undo/redo, compile state |
| `src/components/` | Toolbar, feature tree, parameters, properties, viewport, code panel |
| `public/openscad/` | OpenSCAD WASM engine (fetched by `npm run fetch-engine`, not committed) |

The expression language is a strict subset of OpenSCAD's (numbers, parameters,
`+ - * / % ^`, and functions like `sin`, `cos`, `min`, `max`, `sqrt` — trig in degrees), so
every expression you type is emitted verbatim into the generated `.scad` and stays
parametric outside the app too.
