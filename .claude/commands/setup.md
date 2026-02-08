---
description: Add mcp-rubber-duck MCP server to an AI coding tool (Claude Desktop, Cursor, VS Code, Windsurf, etc.)
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
argument-hint: [tool-name]
---

You are setting up **mcp-rubber-duck** as an MCP server in an AI coding tool.

## 1. Determine target tool

If `$ARGUMENTS` specifies a tool name, use it. Otherwise ask the user:

Supported tools: `claude-desktop`, `claude-code`, `cursor`, `windsurf`, `vscode`, `continue`

## 2. Detect platform

Run `uname -s` to detect macOS / Linux / Windows (Git Bash). This affects config file paths.

## 3. Detect install method

Check in order:
1. `which mcp-rubber-duck` — if found, use `mcp-rubber-duck` as the command
2. If we're inside the mcp-rubber-duck repo (check for `package.json` with `"name": "mcp-rubber-duck"`), offer from-source via `node dist/index.js`
3. Default to `npx -y mcp-rubber-duck`

## 4. Ask about providers

Ask the user which providers to include. Offer these choices:
- **OpenAI** (`OPENAI_API_KEY`) — most popular
- **Google Gemini** (`GEMINI_API_KEY`)
- **Groq** (`GROQ_API_KEY`) — fast inference
- **Ollama** (local, no key needed)
- **CLI agents** (Claude CLI, Codex, Gemini CLI, Aider)

Allow multiple selections.

## 5. Ask about API keys

For each selected HTTP provider that needs a key, ask: **provide a real key now** or **use a placeholder** to fill in later?

- If real key: validate it looks reasonable (starts with expected prefix like `sk-` for OpenAI, `gsk_` for Groq)
- If placeholder: use descriptive placeholders like `your-openai-api-key-here`

## 6. Load reference templates

Read the config template from `.claude/skills/setup-mcp-server/references/tool-configs.md` to get the exact JSON/YAML structure for the target tool.

## 7. Write the configuration

### For Claude Code (`claude-code`)

Use the `claude mcp add` CLI command — this is the idiomatic way:

```bash
claude mcp add --scope user rubber-duck -- mcp-rubber-duck
```

Then set env vars by editing `~/.claude.json` to add the `env` block, or suggest the user set them in their shell profile.

If the user prefers project-scope, use `--scope project` (writes to `.mcp.json`).

### For all other tools

1. Determine the config file path (platform-aware) from the reference templates
2. Read the existing config file if it exists
3. If `rubber-duck` entry already exists, **warn the user** and ask before overwriting
4. If other MCP servers exist, **merge** — never overwrite the entire file
5. If the file doesn't exist, create it (and parent directories with `mkdir -p`)
6. If existing JSON is invalid, warn and offer to backup the broken file before writing
7. Write the final config

### Important details

- **Always** include `"MCP_SERVER": "true"` in the env block — this is required
- **VS Code** uses `"servers"` key, not `"mcpServers"` — get this right
- **Continue** uses YAML with `mcpServers` as an array of objects
- **Windsurf & VS Code** support `${env:VAR_NAME}` syntax for env var interpolation

## 8. Print verification steps

After writing the config, tell the user:

1. **Restart** the tool (fully quit and relaunch for desktop apps)
2. **Test** by using the `list_ducks` tool with `check_health: true`
3. **Troubleshoot** — point them to `.claude/skills/setup-mcp-server/references/troubleshooting.md` if anything goes wrong

## Important rules

- Never overwrite existing MCP server entries for other servers
- Always create parent directories before writing config files
- Use the exact JSON structure from the reference templates
- For env var interpolation tools (VS Code, Windsurf), prefer `${env:VAR}` syntax over hardcoded keys
- Include `DEFAULT_PROVIDER` set to the first selected HTTP provider
