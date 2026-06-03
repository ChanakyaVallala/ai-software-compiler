# AI Software Compiler

This is a local full-stack prototype based on the uploaded PDF task. It behaves like a small compiler for software generation: natural language goes in, structured intent and a project blueprint come out, schema validation runs, repairs are applied, and executable project files are emitted.

## Architecture

- Prompt Intake UI: static browser UI for prompt, mode, strictness, generated files, logs, and metrics.
- Intent Extraction Engine: deterministic parser that identifies product type, pages, entities, roles, API needs, constraints, and assumptions.
- Project Planner: converts intent into routes, components, data schema, permissions, file tree, and business rules.
- Schema Validator: checks required fields, route/schema consistency, API/schema consistency, and role uniqueness.
- Repair Engine: applies deterministic fixes for missing app name, missing routes, missing schemas, and orphan APIs.
- Code Generator: emits a runnable prototype file set as downloadable JSON.
- Execution-Aware QA: reports status, issues, repairs, file count, and latency.

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

Example:

```bash
curl -X POST http://localhost:4173/api/generate -H "Content-Type: application/json" -d "{\"prompt\":\"Build a CRM with login, contacts, dashboard, role-based access, premium plans with payments, and admin analytics.\"}"
```
