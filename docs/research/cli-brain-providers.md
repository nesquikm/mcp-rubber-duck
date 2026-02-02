# Research: CLI Coding Agents as Duck Brains

> This document contains research findings for using CLI coding agents as duck "brains" — spawning CLI processes instead of making HTTP API calls.

See the corresponding GitHub issue for discussion and tracking.

## Summary

Multiple CLI coding agents support non-interactive execution, making integration feasible. **The recommended approach is CLI subprocess spawning (not SDKs)** because it allows users to leverage their existing subscriptions instead of per-token API pricing, avoids third-party auth restrictions, and provides a uniform integration pattern for any CLI tool.

The architecture should support **built-in presets** for major CLI tools (Codex, Gemini, Claude Code) plus a **fully configurable custom provider** for any CLI tool that can take a prompt and return text.

## Why CLI Subprocess Over SDKs

| Concern | CLI Subprocess | SDK |
|---------|---------------|-----|
| **Claude pricing** | User's Claude Pro/Max subscription (OAuth) | **Blocked** — Anthropic prohibits subscription auth for third-party SDK usage |
| **Codex pricing** | User's ChatGPT subscription (OAuth) | OAuth supported too |
| **Gemini pricing** | User's free tier / Google AI subscription | **No SDK exists** |
| **Auth management** | None — user pre-configures their CLI | Must manage API keys per provider |
| **Custom tools** | Any CLI tool works via generic config | Must write/find an SDK for each |
| **Uniform interface** | Same `spawn()` pattern for all | Different SDK APIs |

**The decisive factor:** Anthropic blocks subscription OAuth for third-party SDK apps. Spawning the `claude` CLI avoids this — the user's own auth applies transparently. And the generic config approach means we support *any* CLI tool, not just the ones with SDKs.

## CLI Agent Landscape

### Tier 1: Full JSON Output + Headless Mode

| Tool | Command | JSON Output | Subscription Auth | License |
|------|---------|-------------|-------------------|---------|
| **Claude Code** | `claude -p "prompt"` | `--output-format json` | `claude login` (OAuth) | Proprietary |
| **Codex** | `codex exec "prompt"` | `--json` (JSONL) | `codex login` (OAuth) | Apache-2.0 |
| **Gemini CLI** | `gemini -p "prompt"` | `--output-format json` | Google OAuth (first-run) | Apache-2.0 |
| **OpenCode** | `opencode -p "prompt"` | `-f json` | N/A (75+ provider API keys) | MIT |

### Tier 2: Headless Mode, Text Output Only

| Tool | Command | JSON Output | Auth | License |
|------|---------|-------------|------|---------|
| **Grok CLI** (superagent-ai) | `grok -p "prompt"` | None | `GROK_API_KEY` (manual from console.x.ai) | MIT |
| **Aider** | `aider -m "prompt"` | None | Provider API keys | Apache-2.0 |
| **Cline CLI** | `cline "prompt"` | Via gRPC API | Provider API keys | Apache-2.0 |
| **Qwen Code** | `qwen -p "prompt"` | Unknown | Qwen OAuth (2K free req/day) | Apache-2.0 |

### Upcoming / Not Yet Released

| Tool | Status | Notes |
|------|--------|-------|
| **xAI Grok Build** (official) | Teased Jan 2026, expected Feb 2026 | May ship with JSON output and proper subscription auth |
| **Cursor CLI** | Limited headless mode | `cursor-agent -p`, no JSON output documented |

## Detailed Findings: Primary Targets

### OpenAI Codex CLI

- **Repo:** [github.com/openai/codex](https://github.com/openai/codex) | **License:** Apache-2.0
- **Command:** `codex exec --json "prompt" --skip-git-repo-check --full-auto`
- **Output:** JSONL event stream on stdout
- **Auth:** `codex login` (browser OAuth → ChatGPT subscription) or `CODEX_API_KEY`
- **Subscription:** ChatGPT Plus $20/mo, Pro $200/mo — limits per 5hr window
- **Gotcha:** `OPENAI_API_KEY` in `.env` silently overrides OAuth → per-token billing

### Google Gemini CLI

- **Repo:** [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) | **License:** Apache-2.0
- **Command:** `gemini -p "prompt" --output-format json --yolo`
- **Output:** `{"response": "...", "stats": {"models": {...}}}`
- **Auth:** Google OAuth (first-run guided) or `GEMINI_API_KEY`
- **Subscription:** Free: 60 req/min, 1K req/day. Paid AI Pro/Ultra for higher quotas
- **Token usage:** Included in `stats.models.*.tokens`

### Anthropic Claude Code CLI

- **Repo:** [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code) | **License:** Proprietary
- **Command:** `claude -p "prompt" --output-format json --max-turns 3`
- **Output:** `{"result": "...", "session_id": "..."}`
- **Auth:** `claude login` (OAuth → Claude Pro/Max) or `ANTHROPIC_API_KEY`
- **Subscription:** Pro $20/mo, Max $100-200/mo — shared limits
- **Cost control:** `--max-turns N`, `--max-budget-usd N`
- **SDK restriction:** Agent SDK cannot use subscription auth for third-party apps

### Grok CLI (superagent-ai)

- **Repo:** [github.com/superagent-ai/grok-cli](https://github.com/superagent-ai/grok-cli) | **License:** MIT
- **Command:** `grok -p "prompt" -m grok-code-fast-1`
- **Output:** Plain text only — **no JSON mode**
- **Auth:** `GROK_API_KEY` from console.x.ai (manual, no `grok login` OAuth flow)
- **Pricing:** Pay-as-you-go API credits. X Premium provides console access but requires manual key copy
- **Models:** `grok-code-fast-1`, `grok-4-latest`, `grok-3-latest`
- **Note:** xAI's official "Grok Build" CLI is expected Feb 2026, may improve this

### Aider

- **Repo:** [github.com/Aider-AI/aider](https://github.com/Aider-AI/aider) | **License:** Apache-2.0
- **Command:** `aider --message "prompt" --yes`
- **Output:** Plain text only — no JSON mode
- **Auth:** Any provider API key (OpenAI, Anthropic, Gemini, local, etc.)
- **Note:** Highly mature, supports 75+ models, but text-only output

## Generic Custom CLI Provider Design

Any CLI tool can be a duck brain if we know three things:

1. **How to pass the prompt** — flag (`-p`), positional arg, or stdin
2. **How to read the response** — raw stdout, or JSON field extraction
3. **What extra flags to add** — auto-approve, JSON mode, model selection

### Config schema for custom providers

```json
{
  "my-custom-agent": {
    "type": "cli",
    "cli_type": "custom",
    "cli_command": "/usr/local/bin/my-tool",
    "prompt_delivery": "flag",
    "prompt_flag": "-p",
    "output_format": "json",
    "response_json_path": "$.response",
    "usage_json_path": "$.stats.tokens",
    "cli_args": ["--no-confirm", "--quiet"],
    "process_timeout": 120000,
    "working_directory": "/path/to/project",
    "env_vars": { "MY_TOOL_API_KEY": "${MY_API_KEY}" },
    "nickname": "My Custom Agent"
  }
}
```

### `prompt_delivery` options

| Mode | Behavior | Example |
|------|----------|---------|
| `"flag"` | Pass as `--flag "prompt text"` | `gemini -p "explain this"` |
| `"positional"` | Pass as trailing argument | `codex exec "explain this"` |
| `"stdin"` | Pipe via stdin | `echo "explain this" \| my-tool` |

### `output_format` options

| Mode | Behavior |
|------|----------|
| `"text"` | Capture raw stdout as the response (for tools without JSON output) |
| `"json"` | Parse stdout as JSON, extract via `response_json_path` |
| `"jsonl"` | Parse stdout as JSONL stream, extract final message event |

### Built-in presets

The built-in adapters (codex, gemini, claude) are just pre-configured presets of this same generic system. Users can override any field:

```json
{
  "claude-agent": {
    "type": "cli",
    "cli_type": "claude",
    "cli_args": ["--max-turns", "5", "--max-budget-usd", "1.00"],
    "nickname": "Claude (conservative)"
  }
}
```

When `cli_type` is `"codex"`, `"gemini"`, or `"claude"`, defaults are filled in automatically. When `cli_type` is `"custom"`, all fields must be specified explicitly.

## Authentication: Zero Management

We delegate all auth to the user's pre-existing CLI setup:

| Provider | User Setup (one-time) | Our Code |
|----------|----------------------|----------|
| **Codex** | `codex login` or `CODEX_API_KEY` | Spawn `codex exec ...` |
| **Gemini** | First-run OAuth or `GEMINI_API_KEY` | Spawn `gemini -p ...` |
| **Claude** | `claude login` or `ANTHROPIC_API_KEY` | Spawn `claude -p ...` |
| **Grok** | Set `GROK_API_KEY` from console.x.ai | Spawn `grok -p ...` |
| **Custom** | Whatever the tool requires | Spawn configured command |

We don't store, validate, or manage credentials. If the CLI is authenticated, it works. If not, we get an error exit code and surface it.

## Pricing: Subscription vs API

| Provider | Subscription (via CLI) | Per-Token (via API/SDK) |
|----------|----------------------|------------------------|
| **Codex** | ChatGPT Plus $20/mo, Pro $200/mo | ~$1.50/M input, $6/M output |
| **Gemini** | Free: 60 req/min, 1K req/day | $0.10-$4/M input |
| **Claude** | Pro $20/mo, Max $100-200/mo | Avg ~$6/dev/day |
| **Grok** | No subscription CLI auth | $0.20/M input, $1.50/M output |
