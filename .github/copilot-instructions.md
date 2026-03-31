# Copilot Agent Instructions

## Setup

Always run `npm install` (or `npm ci`) before running `npm run typecheck`, `npm run build`, or any other script that depends on installed packages.

## Project Overview

- **Name:** designsystem-mcp-demo
- **Description:** A queryable context layer (MCP server) that makes design systems machine-readable and usable by AI agents.
- **Language:** TypeScript (ESM, `"type": "module"`)
- **Runtime:** Node.js >=20

## Key Scripts

| Script | Command | Notes |
|---|---|---|
| Type check | `npm run typecheck` | Runs `tsc --noEmit` — requires `npm install` first |
| Build | `npm run build` | Compiles TypeScript to `dist/` |
| Dev server | `npm run dev` | Uses `tsx watch` for live reload |
| Tests (E2E) | `npm test` | Playwright tests |
| API tests | `npm run test:api` | Node test runner with `tsx` |
| Evals | `npm run test:evals` | `promptfoo` eval suite |

## Source Layout

- `src/` — TypeScript source (compiled to `dist/`)
- `src/routes/` — Express route handlers
- `src/data/` — Static data files (copied to `dist/` via `postbuild`)
- `tests/` — API and Playwright tests
- `evals/` — promptfoo evaluation configs
- `scripts/` — Build helper scripts (ESM `.mjs`)

## TypeScript Config

- Target: ES2022, module resolution: NodeNext
- Strict mode enabled
- All imports from local files require explicit `.js` extensions (NodeNext ESM convention)
