---
name: implement
description: Implement a GitHub issue end-to-end. Reads the issue, builds in TDD order, runs gate checks, self-reviews with bounded loops, and reports for human approval before committing.
disable-model-invocation: true
argument-hint: '<GitHub issue number, e.g. 87>'
---

# Implement Issue

Implement GitHub issue `$ARGUMENTS` end-to-end.

## Phase 1: Understand

1. **Read the issue** — Run `gh issue view $ARGUMENTS` to get the full description
2. **Read relevant code** — Find the files that need to change based on the issue description
3. **Build the AC checklist** — Extract every acceptance criterion from the issue as a binary pass/fail checklist. If the issue doesn't have explicit ACs, derive them from the description (e.g., "URL field added to ImageInput" → AC). This checklist is your **definition of done**.
4. **Present the plan** — Show the user:
   - AC checklist
   - Files to create/modify
   - Test strategy
   - Ask for approval before proceeding

## Phase 2: Build (TDD)

5. **Execute in TDD order:**
   - For each change:
     a. Write tests first
     b. Run tests — confirm RED (failing)
     c. Implement the code
     d. Run tests — confirm GREEN (passing)
   - Follow project patterns from CLAUDE.md:
     - ESM imports with `.js` extensions
     - MCP-compliant tool response format
     - Zod schemas for validation
6. **Gate check** — Run `npm run typecheck && npm run lint && npm run build && npm test`
   - This is the **deterministic kill switch** — if it fails, fix before proceeding
   - Do NOT let judgment override a failing gate

## Phase 3: Self-Review Loop (max 2 rounds)

> The gate check is the hard stop. This review loop is the smart stop.

7. **Round N (N = 1, 2):**

   a. **AC check** — Walk the checklist from Phase 1. For each AC:
   - ✓ Pass — implemented and tested
   - ✗ Fail — missing or wrong
   - ⚠ Partial — implemented but incomplete

   b. **Code audit** — Re-read every file created/modified. Look for:
   - Logic bugs, off-by-one errors, wrong comparisons
   - Missing edge cases the tests don't cover
   - Pattern violations (response format, error handling, imports)
   - Hardcoded values that should come from config
   - Security issues (unsanitized input, injection risks)

   c. **Tool pattern check** — If any MCP tool was created or modified, verify:
   - Response format: `{ content: [{ type: 'text', text: '...' }] }`
   - Error format: `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }`
   - Registration in `src/server.ts` (import, getTools, switch case)
   - Input validation with clear error messages

   d. **Decision (deterministic, not vibes):**
   - **All ACs pass + no issues found** → exit loop, go to Phase 4
   - **Issues found, round 1** → fix issues, re-run gate check, go to round 2
   - **Issues found, round 2** → check for convergence:
     - If round 2 found the **same issue types** as round 1 → **STOP and escalate** to user (deadlock — going in circles)
     - If round 2 found **new/different issues** → fix, re-run gate check, then escalate to user (diminishing returns — let human judge)

   e. **After any fix** — always re-run the full gate check before continuing

## Phase 4: Report & Handoff

8. **Report** — Present to the user:
   - AC checklist with final pass/fail status
   - Files created/modified
   - Test coverage (which cases are tested)
   - Self-review findings (what was caught and fixed, what remains)
   - Gate check result
   - Number of review rounds used

9. **Wait for approval** — Ask the user to review before committing. Do NOT commit until the user explicitly says so.

## Rules

- Do NOT proceed if the gate check fails — fix first
- Do NOT skip tests — always write tests before implementation
- Do NOT commit without user approval
- Do NOT self-review more than 2 rounds — escalate instead of looping
- The gate check (deterministic) always overrides judgment about quality
- ACs are binary (pass/fail) — no "good enough"
