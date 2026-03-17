---
name: tool-review
description: Review an MCP tool implementation for correctness, pattern adherence, and best practices. Use after implementing or modifying a tool.
argument-hint: '<tool-name or file path>'
allowed-tools: Read, Grep, Glob
---

# Tool Review

Review the MCP tool implementation for: `$ARGUMENTS`

## Process

### 1. Locate the tool

Find the tool implementation in `src/tools/` and its registration in `src/server.ts`.

### 2. Check against project patterns

Verify each of these (from CLAUDE.md):

**Response format:**
- Returns `{ content: [{ type: 'text', text: '...' }] }` on success
- Returns `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }` on error

**Input validation:**
- Required arguments are checked with clear error messages
- Uses appropriate types from Zod schemas where applicable

**Registration in server.ts:**
- Tool is imported with `.js` extension in the import path
- Added to `getTools()` array with correct JSON Schema for inputs
- Has a case in the `CallToolRequestSchema` handler switch

**Dependencies:**
- Uses the right dependencies (providerManager, conversationManager, healthMonitor, etc.)
- Follows the same injection pattern as existing tools

### 3. Check for common issues

- Missing error handling for provider calls
- Hardcoded values that should come from config
- Missing or incorrect TypeScript types
- Security issues (unsanitized input, injection risks)

### 4. Report

For each check:
- ✓ Pass — follows the pattern correctly
- ✗ Fail — what's wrong and how to fix it
- ⚠ Warning — works but could be improved

End with a summary: **APPROVED** or **NEEDS CHANGES** with specific action items.
