# Provider Environment Variables

Quick reference for all environment variables used by mcp-rubber-duck.

## Required

| Variable | Description |
|----------|-------------|
| `MCP_SERVER` | **Must be `"true"`** for the server to start in MCP mode |

## HTTP Providers

| Variable | Required | Format | Where to get it |
|----------|----------|--------|-----------------|
| `OPENAI_API_KEY` | If using OpenAI | `sk-...` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `OPENAI_DEFAULT_MODEL` | No | String | Default: `gpt-5.1` |
| `OPENAI_NICKNAME` | No | String | Default: `GPT Duck` |
| `GEMINI_API_KEY` | If using Gemini | String | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `GEMINI_DEFAULT_MODEL` | No | String | Default: `gemini-2.5-flash` |
| `GEMINI_NICKNAME` | No | String | Default: `Gemini Duck` |
| `GROQ_API_KEY` | If using Groq | `gsk_...` | [console.groq.com/keys](https://console.groq.com/keys) |
| `GROQ_DEFAULT_MODEL` | No | String | Default: `llama-3.3-70b-versatile` |
| `GROQ_NICKNAME` | No | String | Default: `Groq Duck` |

## Local Providers

| Variable | Required | Format | Notes |
|----------|----------|--------|-------|
| `OLLAMA_BASE_URL` | No | URL | Default: `http://localhost:11434/v1` |
| `OLLAMA_DEFAULT_MODEL` | No | String | Default: `llama3.2` |
| `OLLAMA_NICKNAME` | No | String | Default: `Local Duck` |

## Custom HTTP Providers

Pattern: `CUSTOM_{NAME}_{FIELD}` where `{NAME}` is your provider identifier (uppercase).

| Variable | Required | Format |
|----------|----------|--------|
| `CUSTOM_{NAME}_API_KEY` | Usually | String |
| `CUSTOM_{NAME}_BASE_URL` | Yes | URL ending in `/v1` |
| `CUSTOM_{NAME}_DEFAULT_MODEL` | No | String |
| `CUSTOM_{NAME}_MODELS` | No | Comma-separated |
| `CUSTOM_{NAME}_NICKNAME` | No | String |

Example for Together AI:
```
CUSTOM_TOGETHER_API_KEY=...
CUSTOM_TOGETHER_BASE_URL=https://api.together.xyz/v1
CUSTOM_TOGETHER_DEFAULT_MODEL=meta-llama/Llama-3.3-70B-Instruct-Turbo
CUSTOM_TOGETHER_NICKNAME=Together Duck
```

## CLI Providers (Coding Agents)

### Preset agents

| Variable | Effect |
|----------|--------|
| `CLI_CLAUDE_ENABLED=true` | Enable Claude Code CLI as a duck |
| `CLI_CODEX_ENABLED=true` | Enable OpenAI Codex CLI |
| `CLI_GEMINI_ENABLED=true` | Enable Gemini CLI |
| `CLI_GROK_ENABLED=true` | Enable Grok CLI |
| `CLI_AIDER_ENABLED=true` | Enable Aider |

### Preset overrides

Pattern: `CLI_{AGENT}_{FIELD}`

| Variable | Format |
|----------|--------|
| `CLI_{AGENT}_NICKNAME` | String |
| `CLI_{AGENT}_DEFAULT_MODEL` | String |
| `CLI_{AGENT}_SYSTEM_PROMPT` | String |
| `CLI_{AGENT}_CLI_ARGS` | Comma-separated |

### Custom CLI providers

Pattern: `CLI_CUSTOM_{NAME}_{FIELD}`

| Variable | Required | Format |
|----------|----------|--------|
| `CLI_CUSTOM_{NAME}_COMMAND` | Yes | Path to executable |
| `CLI_CUSTOM_{NAME}_NICKNAME` | No | String |
| `CLI_CUSTOM_{NAME}_PROMPT_DELIVERY` | No | `flag`, `positional`, or `stdin` |
| `CLI_CUSTOM_{NAME}_OUTPUT_FORMAT` | No | `text`, `json`, or `jsonl` |
| `CLI_CUSTOM_{NAME}_PROMPT_FLAG` | If delivery=flag | String (e.g., `-p`) |
| `CLI_CUSTOM_{NAME}_PROCESS_TIMEOUT` | No | Milliseconds (default: 120000) |
| `CLI_CUSTOM_{NAME}_WORKING_DIRECTORY` | No | Path |

## Global Settings

| Variable | Required | Format | Default |
|----------|----------|--------|---------|
| `DEFAULT_PROVIDER` | No | Provider key | First configured provider |
| `DEFAULT_TEMPERATURE` | No | 0.0–2.0 | `0.7` |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` | `info` |

## MCP Bridge Settings (Optional)

| Variable | Required | Format | Default |
|----------|----------|--------|---------|
| `MCP_BRIDGE_ENABLED` | No | `true`/`false` | `false` |
| `MCP_APPROVAL_MODE` | No | `always`, `trusted`, `never` | `always` |
| `MCP_APPROVAL_TIMEOUT` | No | Seconds | `300` |
