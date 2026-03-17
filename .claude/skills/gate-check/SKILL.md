---
name: gate-check
description: Run the project gate checks (typecheck + lint + build + test) and report results. Use after completing any feature or before creating a PR.
argument-hint: '[--fix to auto-fix lint issues]'
allowed-tools: Bash(npm *)
---

# Gate Check

Run the project's gating checks and report a clear pass/fail for each:

1. Run `npm run typecheck` — report any type errors with file:line references
2. Run `npm run lint $ARGUMENTS` — report any lint errors. If `$ARGUMENTS` contains `--fix`, run `npm run lint -- --fix` instead.
3. Run `npm run build` — report any build errors
4. Run `npm test` — report test results summary

For each step:

- If it passes, report ✓ with a one-line summary
- If it fails, report ✗ with the specific errors

At the end, give a clear verdict: **GATE PASSED** or **GATE FAILED** with what needs fixing.
