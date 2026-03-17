---
name: tdd
description: Execute TDD cycle for a specific test file or feature. Runs RED (write failing test) → GREEN (implement) → VERIFY (all gates pass). Use when building features following TDD methodology.
argument-hint: '<test-file-path or feature description>'
---

# TDD Cycle

Execute a TDD workflow for: `$ARGUMENTS`

## Process

### 1. RED — Write Failing Tests

- Read CLAUDE.md and relevant source files to understand existing patterns
- Write test(s) following existing test conventions (Jest, ESM with `--experimental-vm-modules`)
- Run the test and confirm it FAILS (red)
- If the test file already exists and passes, skip to VERIFY

### 2. GREEN — Implement

- Write the minimum code to make tests pass
- Follow project patterns from CLAUDE.md:
  - ESM imports with `.js` extensions
  - MCP-compliant tool response format: `{ content: [{ type: 'text', text: '...' }] }`
  - Zod schemas for validation, types inferred via `z.infer<>`
- Run the specific test file and confirm it PASSES (green)

### 3. VERIFY — Gate Check

- Run `npm run typecheck` — fix any type errors
- Run `npm run lint` — fix any lint errors
- Run `npm run build` — fix any build errors
- Run `npm test` — ensure no regressions

Report each phase clearly. If VERIFY fails, fix issues and re-verify before declaring done.
