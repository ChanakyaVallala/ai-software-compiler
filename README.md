# AI Software Compiler

This is a local full-stack prototype based on the uploaded PDF task. It behaves like a small compiler for software generation: natural language goes in, structured intent and a project blueprint come out, cross-layer schema validation runs, targeted repairs are applied, runtime verification executes, and executable project files are emitted.

## Architecture

- Prompt Intake UI: static browser UI for prompt, mode, strictness, confidence threshold, generated files, logs, assumptions, runtime report, and ZIP export.
- Intent Extraction Engine: deterministic parser that identifies product type, pages, entities, roles, API needs, constraints, and domain assumptions.
- Project Planner: converts intent into UI, API, database, and auth design layers.
- Schema Validator: checks cross-layer consistency across UI, API, database, and auth.
- Repair Engine: applies targeted deterministic fixes and records repair type, count, action, and target path.
- Runtime Verification: simulates route registration, API registration, database schema creation, and permission checks.
- Code Generator: emits an executable `generated-project/` tree with React frontend, Express backend, SQL schema, and docs.
- Exporter: creates a downloadable ZIP archive of the generated project files.

## Run

```bash
npm install
npm start
```

Then open:

```text
http://localhost:4173
```

## API

- `GET /api/health`
- `GET /api/metrics`
- `POST /api/generate`
- `POST /api/export`
- `POST /api/benchmark-result`

Example:

```bash
curl -X POST http://localhost:4173/api/generate -H "Content-Type: application/json" -d "{\"prompt\":\"Build a CRM with login, contacts, dashboard, role-based access, premium plans with payments, and admin analytics.\"}"
```

## Benchmarks

```bash
npm run benchmark
```

This runs 10 real-world prompts and 10 edge cases, then writes `docs/benchmark-report.md` and `benchmarks/latest-result.json`.

## Documentation

- `docs/gap-analysis.md`
- `docs/implementation-plan.md`
- `docs/architecture.md`
- `docs/benchmark-report.md`
