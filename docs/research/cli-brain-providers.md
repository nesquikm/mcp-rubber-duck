# Research: CLI Coding Agents as Duck Brains

> This document contains research findings for using CLI coding agents (OpenAI Codex CLI, Google Gemini CLI, Anthropic Claude Code CLI) as duck "brains" — spawning CLI processes instead of making HTTP API calls.

See the corresponding GitHub issue for discussion and tracking.

## Summary

All three CLI tools support non-interactive execution with JSON output, making integration feasible. The primary complexity is in process lifecycle management, output parsing, and cost control.

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
| **Output to file** | `--output-last-message, -o <file>` |
| **Stdin piping** | Prompt as CLI argument only (use `"$(cat file.txt)"` workaround) |
| **Custom providers** | Full support via `config.toml` (any OpenAI-compatible endpoint) |
| **Local models** | `--oss` flag (Ollama/LM Studio) |
| **SDK alternative** | `@openai/codex-sdk` TypeScript package for deeper integration |
| **Auth for CI** | `CODEX_API_KEY` environment variable |
| **Auto-approve tools** | `--full-auto` or `--yolo` |
| **Session resume** | `codex exec resume --last "follow-up"` |

**Key integration pattern:**
```bash
codex exec --json "your prompt" --skip-git-repo-check --full-auto
# stdout: JSONL events; stderr: progress
# Final message extractable from the event stream
```

**Limitations:**
- Requires execution inside a git repository (override with `--skip-git-repo-check`)
- Default sandbox is read-only; needs explicit permission flags for write access
- Each invocation consumes API tokens (default model: `gpt-5-codex`)
- Non-deterministic output (mitigated by `--output-schema`)

### 2. Google Gemini CLI

| Attribute | Details |
|-----------|---------|
| **Repository** | [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) |
| **License** | Apache-2.0 (fully open source) |
| **Language** | TypeScript/Node.js |
| **Non-interactive mode** | `gemini -p "prompt"` or positional `gemini "prompt"` |
| **JSON output** | `--output-format json` (single JSON object) |
| **Streaming JSON** | `--output-format stream-json` (NDJSON event stream) |
| **Stdin piping** | Full support: `cat file \| gemini -p "instruction"` |
| **Model selection** | `-m gemini-2.5-flash`, `-m gemini-2.5-pro` |
| **Auth** | `GEMINI_API_KEY` env var, or Google OAuth |
| **Auto-approve tools** | `--yolo` or `--approval-mode yolo` |
| **Session resume** | `--resume` flag |
| **Free tier** | 60 req/min, 1000 req/day (with Google account) |

**Key integration pattern:**
```bash
gemini -p "your prompt" --output-format json --yolo
# Returns: {"response": "...", "stats": {...}}
```

**JSON output structure:**
```json
{
  "response": "The AI-generated answer text",
  "stats": {
    "models": { "gemini-2.5-pro": { "tokens": { "prompt": 24939, "candidates": 20 } } },
    "tools": { "totalCalls": 1, "totalSuccess": 1 },
    "files": { "totalLinesAdded": 0, "totalLinesRemoved": 0 }
  }
}
```

**Limitations:**
- Positional prompt + other flags sometimes ignored (known bug — use `-p` flag as workaround)
- No `--output-schema` for response content shaping (only wrapper structure is JSON)
- Rate limits on free tier (5 RPM for Pro, 100 req/day for Pro, 250 req/day for Flash)
- `--resume` incompatible with stdin/positional args (must use `-p` flag)
- No native SDK/library interface — must spawn as subprocess

### 3. Anthropic Claude Code CLI

| Attribute | Details |
|-----------|---------|
| **Repository** | [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code) (stub/docs only) |
| **License** | **Proprietary** (Anthropic Commercial Terms of Service) |
| **Language** | Closed source binary |
| **Non-interactive mode** | `claude -p "prompt"` (print mode) |
| **JSON output** | `--output-format json` or `--output-format stream-json` |
| **Structured output** | `--json-schema '{...}'` enforces response schema |
| **Stdin piping** | Full support: `cat file \| claude -p "instruction"` |
| **Model selection** | `--model sonnet`, `--model opus` |
| **Auth** | Anthropic API key or OAuth |
| **Auto-approve tools** | `--dangerously-skip-permissions` or `--allowedTools` |
| **Session resume** | `--continue` (last session) or `--resume <id>` |
| **Cost control** | `--max-turns N`, `--max-budget-usd N` |
| **SDK** | `@anthropic-ai/claude-agent-sdk` (TS) / `claude-agent-sdk` (Python) |

**Key integration pattern:**
```bash
claude -p "your prompt" --output-format json --allowedTools "Read,Bash"
# Returns: {"result": "...", "session_id": "...", ...}
```

**SDK integration (alternative to subprocess):**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
for await (const msg of query({ prompt: "...", options: { allowedTools: ["Read"] } })) {
  if ("result" in msg) console.log(msg.result);
}
```

**Limitations:**
- **Not open source** — proprietary license, code not available
- SDK requires Claude Code CLI to be installed as runtime
- No interactive commands (like `/commit`) available in `-p` mode
- Known bug: model sometimes thinks it's in interactive mode with `-p` flag
- Without `--max-turns` / `--max-budget-usd`, agentic loops can consume unlimited credits

## SDK vs CLI Subprocess: Trade-offs

| Aspect | CLI Subprocess | SDK Integration |
|--------|---------------|-----------------|
| **Setup complexity** | Low (just needs CLI installed) | Medium (npm package dependency) |
| **Process overhead** | High (new process per call) | Low (in-process) |
| **Output parsing** | Fragile (depends on CLI output format) | Type-safe (native objects) |
| **Error handling** | Exit codes + stderr parsing | Native exceptions |
| **Streaming** | Possible via JSONL parsing | Native async iterators |
| **Maintenance** | CLI output format may change | SDK has semantic versioning |
| **Available for** | All three tools | Claude Code, Codex (both have SDKs) |

**Recommendation:** Use SDKs where available (Claude Agent SDK, Codex SDK), fall back to CLI subprocess for Gemini CLI and custom tools.
