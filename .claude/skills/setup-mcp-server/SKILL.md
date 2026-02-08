---
name: setup-mcp-server
description: Helps configure mcp-rubber-duck MCP server in AI coding tools. Triggers when users ask about adding rubber duck to Claude Desktop, Cursor, VS Code, Windsurf, Continue, or any MCP-compatible tool.
user-invocable: false
---

# MCP Rubber Duck — Setup Knowledge

## What is mcp-rubber-duck?

An MCP server that bridges to multiple OpenAI-compatible LLMs. It provides "rubber duck debugging" with AI — query multiple LLM providers simultaneously and get different perspectives. Supports OpenAI, Gemini, Groq, Ollama, Together AI, and CLI coding agents (Claude, Codex, Gemini CLI, Aider).

## Supported tools and config paths

| Tool | Config File (macOS) | Key | Notes |
|------|-------------------|-----|-------|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | `mcpServers` | Windows: `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Code (user) | `~/.claude.json` | `mcpServers` | Prefer `claude mcp add` CLI |
| Claude Code (project) | `.mcp.json` | `mcpServers` | Shared via VCS |
| Cursor (project) | `.cursor/mcp.json` | `mcpServers` | |
| Cursor (global) | `~/.cursor/mcp.json` | `mcpServers` | |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | Supports `${env:VAR}` |
| VS Code | `.vscode/mcp.json` | `servers` | Different key name! Uses `${env:VAR}` |
| Continue | `.continue/config.yaml` | `mcpServers` (array) | YAML format |

ChatGPT supports MCP via UI only (Developer Mode > Add MCP Server), not a config file.

## Critical requirement

`MCP_SERVER=true` must be set as an environment variable. Without it, the server won't start in MCP mode. This is the most common setup mistake.

## Install methods

1. **npm global**: `npm install -g mcp-rubber-duck` → command is `mcp-rubber-duck`
2. **npx**: `npx -y mcp-rubber-duck` → no install needed
3. **From source**: `node /path/to/mcp-rubber-duck/dist/index.js`

## When users ask about setup

If a user asks how to add rubber duck to any tool, you have two options:

1. **Suggest the `/setup` command**: Tell the user to run `/setup <tool-name>` for an interactive guided setup
2. **Answer directly**: Use the reference files for detailed config templates:
   - `.claude/skills/setup-mcp-server/references/tool-configs.md` — per-tool JSON/YAML templates
   - `.claude/skills/setup-mcp-server/references/provider-env-vars.md` — env var reference
   - `.claude/skills/setup-mcp-server/references/troubleshooting.md` — common issues

## Quick example (Claude Desktop)

```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "npx",
      "args": ["-y", "mcp-rubber-duck"],
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "sk-...",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```
