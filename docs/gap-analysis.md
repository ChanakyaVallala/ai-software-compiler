# Gap Analysis

This analysis compares the current repository against the target requirement that the project behave like a deterministic software compiler:

Natural Language -> Intent Extraction -> System Design -> Schema Generation -> Validation -> Intelligent Repair -> Runtime Verification -> Executable Output

## Existing Codebase Summary

- `server.js` serves the static UI and exposes `GET /api/health`, `GET /api/metrics`, and `POST /api/generate`.
- `src/compiler.js` contains the deterministic generation pipeline: prompt classification, intent extraction, project planning, light validation, light repair, and file preview generation.
- `public/index.html`, `public/app.js`, and `public/styles.css` implement the browser UI for prompt input, status, blueprint preview, file preview, logs, and JSON download.
- `README.md` documents the original architecture and run instructions.

## Requirement Status

| Requirement | Status | Why |
| --- | --- | --- |
| Natural-language input | Supported | The UI textarea and `POST /api/generate` accept prompt text. |
| Intent extraction | Supported | `extractIntent` deterministically classifies CRM, e-commerce, dashboard, and default app prompts. |
| System design | Partially Supported | `planProject` creates routes, API needs, schema, permissions, and file tree, but the design is not separately represented as UI/API/database/auth layers. |
| Schema generation | Supported | `planProject` generates entity schema fields for each detected entity. |
| Validation | Partially Supported | `validateBlueprint` checks missing app name, missing routes, missing schema, orphan APIs, route data mismatch in strict mode, and duplicate roles. It does not yet deeply validate UI/API/database/auth consistency. |
| Intelligent repair | Partially Supported | `repairBlueprint` patches a few issue types, but repairs are returned as strings and do not include repair type, count, affected target, or structured action metadata. |
| Runtime verification | Missing | No simulation currently verifies route registration, API registration, database schema creation, or permission checks. |
| Executable output | Partially Supported | The generator emits preview files including a Node server and HTML page, but it does not emit the required `generated-project/frontend`, `backend`, `database`, and `docs` structure with React, Express, SQL schema, and README. |
| ZIP export | Missing | The UI downloads a JSON payload only; the server has no ZIP endpoint. |
| Cross-layer validation for UI, API, Database, Auth | Missing | Current validation does not detect orphan fields, orphan endpoints, unused roles, schema mismatches, broken references, or missing mappings across all four layers. |
| Structured validation errors | Partially Supported | Issues have `type`, `severity`, and `message`, but lack stable ids, layer, path, expected/actual, and repairability. |
| Assumption engine | Partially Supported | Intent includes assumptions, but they are hard-coded inside intent and not stored separately with type, confidence, and source. |
| Clarification engine | Partially Supported | Short prompts return generic questions, but there is no configurable confidence threshold or domain-specific ambiguity detection. |
| Benchmark framework | Missing | No `benchmarks/` directory, prompt suite, benchmark runner, or generated report exists. |
| Expanded metrics | Partially Supported | Metrics track requests, successes, failures, repairs, latency, and failure types, but not validation failures, repair types, runtime failures, or benchmark results. |
| Documentation | Partially Supported | `README.md` documents the initial architecture, but `docs/architecture.md` and `docs/benchmark-report.md` are missing. |

## Implementation Plan

1. Preserve the existing public API shape and UI flow while extending returned payloads with new fields.
2. Add a deterministic assumption engine that stores assumptions separately from intent.
3. Add a clarification engine with configurable confidence thresholds.
4. Strengthen validation into structured cross-layer checks across UI, API, database, and auth.
5. Upgrade repairs to targeted objects with type, count, issue id, target path, and action.
6. Add runtime verification as a post-repair simulation stage.
7. Replace blueprint-oriented generated files with deterministic executable project files under `generated-project/frontend`, `backend`, `database`, and `docs`.
8. Add server-side ZIP export for generated project files while keeping JSON preview behavior available in the UI.
9. Add benchmark prompts, runner, and report generation.
10. Expand metrics to include validation failures, repair types, runtime failures, and latest benchmark summary.
11. Add architecture and benchmark documentation.

