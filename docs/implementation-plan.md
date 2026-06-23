# Implementation Plan

## Constraints

- Preserve `POST /api/generate`, existing UI controls, deterministic behavior, and the current broad architecture.
- Add missing functionality incrementally instead of replacing the working app.
- Keep the app dependency-light and runnable with `npm start`.

## Incremental Changes

1. Extend `src/compiler.js` with small focused functions:
   - assumption generation
   - clarification generation
   - cross-layer validation
   - targeted repair
   - runtime verification
   - executable project file templates
2. Extend `server.js` metrics and add a ZIP export endpoint.
3. Update the UI to show the new pipeline, runtime report, assumptions, and ZIP download.
4. Add benchmark prompt fixtures and a benchmark runner.
5. Add architecture and benchmark docs.
6. Run syntax checks, direct compiler checks, benchmark runner, and API smoke tests.

