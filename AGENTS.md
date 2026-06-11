# WebOpenSCAD — agent notes

Web-based parametric CAD frontend for OpenSCAD (feature tree + parameters → generated
.scad → OpenSCAD WASM in a web worker → STL → three.js viewport).

## Rules

- **Everything runs in Docker** — never run npm/node directly on the host.
  - Dev server: `docker compose up web` (http://localhost:5173)
  - One-off commands: `docker compose run --rm web <cmd>`
  - Tests: `docker compose run --rm web npm test`
  - Typecheck: `docker compose run --rm web npx tsc --noEmit`
- The OpenSCAD WASM engine lives in `public/openscad/` (gitignored). Restore it with
  `docker compose run --rm web npm run fetch-engine`.
- The dev container runs as uid 1000 (`node`) so bind-mounted files stay owned by the
  host user. Keep it that way.

## Architecture invariants

- Every numeric field in the document model is an **expression string**, validated by
  `src/model/expr.ts`. The expression grammar must remain a strict subset of OpenSCAD's
  so `src/model/codegen.ts` can emit expressions verbatim (this also prevents code
  injection into generated .scad). Trig is in degrees to match OpenSCAD.
- Features are combined in history order with a left fold of
  union/difference/intersection — order matters and is a core UX concept.
- Compiles are latest-wins and single-flight (`src/engine/compiler.ts`); a fresh WASM
  instance is created per compile because callMain() is not reusable.
