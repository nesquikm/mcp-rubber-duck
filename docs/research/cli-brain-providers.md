# Research: CLI Coding Agents as Duck Brains

> This document contains research findings for using CLI coding agents (OpenAI Codex CLI, Google Gemini CLI, Anthropic Claude Code CLI) as duck "brains" — spawning CLI processes instead of making HTTP API calls.

See the corresponding GitHub issue for discussion and tracking.

## Summary

All three CLI tools support non-interactive execution with JSON output, making integration feasible. **The recommended approach is CLI subprocess spawning (not SDKs)** because it allows users to leverage their existing subscriptions (ChatGPT Plus/Pro, Google AI, Claude Pro/Max) instead of per-token API pricing, and avoids third-party auth restrictions.

## Why CLI Subprocess Over SDKs

SDKs exist for Codex (`@openai/codex-sdk`) and Claude Code (`@anthropic-ai/claude-agent-sdk`), but **using the CLI tools directly is the better approach**:

| Concern | CLI Subprocess | SDK |
|---------|---------------|-----|
| **Codex pricing** | User's ChatGPT subscription (OAuth) | ChatGPT subscription (OAuth supported) |
| **Gemini pricing** | User's free tier or Google AI subscription (OAuth) | No SDK exists — subprocess is the only option |
| **Claude pricing** | User's Claude Pro/Max subscription (OAuth) | **Per-token API pricing only** — Anthropic blocks subscription auth for third-party SDK usage |
| **Auth management** | None — user pre-configures their CLI | We must manage API keys per provider |
| **Uniform interface** | Same `spawn()` pattern for all three | Different SDK APIs, Gemini has none |

**The decisive factor is Claude Code:** Anthropic explicitly prohibits third-party apps from using Claude.ai subscription OAuth via the Agent SDK. But when we spawn the `claude` CLI, the user's own pre-configured subscription auth applies — no restriction.

## Research Findings

### 1. OpenAI Codex CLI

| Attribute | Details |
|-----------|---------|
| **Repository** | [github.com/openai/codex](https://github.com/openai/codex) |
| **License** | Apache-2.0 (fully open source) |
| **Language** | Rust |
| **Non-interactive mode** | `codex exec "prompt"` |
| **JSON output** | `--json` flag (JSONL event stream to stdout) |
| **Structured output** | `--output-schema <file>` enforces JSON schema on response |
| **Auto-approve tools** | `--full-auto` or `--yolo` |
| **Session resume** | `codex exec resume --last "follow-up"` |
| **Auth (subscription)** | `codex login` → browser OAuth → ChatGPT Plus/Pro |
| **Auth (API key)** | `CODEX_API_KEY` or `OPENAI_API_KEY` env var |

**Key integration pattern:**
```bash
codex exec --json "your prompt" --skip-git-repo-check --full-auto
# stdout: JSONL events; stderr: progress
```

**Subscription pricing:** ChatGPT Plus ($20/mo), Pro ($200/mo) — usage limits per 5-hour window, no per-token charges.

**Limitations:**
- Requires git repo (override with `--skip-git-repo-check`)
- JSONL output doesn't include token counts
- `OPENAI_API_KEY` in `.env` can silently override OAuth (causes unexpected per-token billing)

### 2. Google Gemini CLI

| Attribute | Details |
|-----------|---------|
| **Repository** | [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) |
| **License** | Apache-2.0 (fully open source) |
| **Language** | TypeScript/Node.js |
| **Non-interactive mode** | `gemini -p "prompt"` |
| **JSON output** | `--output-format json` (single JSON object) |
| **Streaming JSON** | `--output-format stream-json` (NDJSON) |
| **Auto-approve tools** | `--yolo` or `--approval-mode yolo` |
| **Session resume** | `--resume` flag |
| **Auth (subscription)** | Google account OAuth (first-run guided flow) |
| **Auth (API key)** | `GEMINI_API_KEY` env var |
| **No SDK** | Must use subprocess — no programmatic SDK exists |

**Key integration pattern:**
```bash
gemini -p "your prompt" --output-format json --yolo
# Returns: {"response": "...", "stats": {...}}
```

**Subscription pricing:** Free tier via Google account: 60 req/min, 1K req/day with full model access (Gemini 2.5 Pro). Paid Google AI Pro/Ultra for higher quotas.

**JSON output includes token usage:**
```json
{
  "response": "...",
  "stats": {
    "models": { "gemini-2.5-pro": { "tokens": { "prompt": 24939, "candidates": 20, "total": 25113 } } }
  }
}
```

**Limitations:**
- Positional prompt + other flags sometimes ignored (known bug — always use `-p` flag)
- No `--output-schema` for response content shaping
- Free tier: auto-switches Pro to Flash after ~10-15 prompts
- `--resume` incompatible with stdin/positional args

### 3. Anthropic Claude Code CLI

| Attribute | Details |
|-----------|---------|
| **Repository** | [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code) |
| **License** | **Proprietary** (Anthropic Commercial ToS) |
| **Language** | Closed source |
| **Non-interactive mode** | `claude -p "prompt"` |
| **JSON output** | `--output-format json` or `--output-format stream-json` |
| **Structured output** | `--json-schema '{...}'` enforces response schema |
| **Auto-approve tools** | `--dangerously-skip-permissions` or `--allowedTools` |
| **Session resume** | `--continue` or `--resume <id>` |
| **Cost control** | `--max-turns N`, `--max-budget-usd N` |
| **Auth (subscription)** | `claude login` → browser OAuth → Claude Pro/Max |
| **Auth (API key)** | `ANTHROPIC_API_KEY` env var |

**Key integration pattern:**
```bash
claude -p "your prompt" --output-format json --max-turns 3
# Returns: {"result": "...", "session_id": "...", ...}
```

**Subscription pricing:** Claude Pro ($20/mo), Max ($100-200/mo) — shared usage limits, no per-token charges.

**Critical note on SDK vs CLI:**
- The SDK (`@anthropic-ai/claude-agent-sdk`) **cannot** use subscription OAuth — Anthropic blocks this for third-party apps
- The CLI **can** use subscription OAuth — user has already authenticated
- This is the primary reason to prefer CLI subprocess over SDK

**Limitations:**
- Proprietary license — cannot redistribute
- Model sometimes thinks it's in interactive mode with `-p` flag
- Without `--max-turns`/`--max-budget-usd`, agentic loops can run indefinitely

## Authentication: Zero Management Required

By using CLI subprocess spawning, we delegate all authentication to the user's pre-existing CLI setup:

| Provider | User Setup (one-time) | Our Code |
|----------|----------------------|----------|
| **Codex** | `codex login` (browser OAuth) or set `CODEX_API_KEY` | Just spawn `codex exec ...` |
| **Gemini** | First run guides OAuth, or set `GEMINI_API_KEY` | Just spawn `gemini -p ...` |
| **Claude** | `claude login` (browser OAuth) or set `ANTHROPIC_API_KEY` | Just spawn `claude -p ...` |

We don't store, validate, or manage any credentials. If the CLI is authenticated, it works. If not, it returns an error exit code that we surface to the user.

## Pricing Comparison: Subscription vs API

| Provider | Subscription (via CLI) | Per-Token (via API/SDK) |
|----------|----------------------|------------------------|
| **Codex** | ChatGPT Plus $20/mo, Pro $200/mo — usage limits per 5hr window | ~$1.50/M input, $6/M output |
| **Gemini** | Free: 60 req/min, 1K req/day. Pro/Ultra: monthly fee | $0.10-$4/M input depending on model |
| **Claude** | Pro $20/mo, Max $100-200/mo — shared limits | Avg ~$6/dev/day (90% under $12/day) |

For a rubber duck debugging tool, subscription pricing is significantly more cost-effective — users likely already have subscriptions and won't incur additional per-token costs.
