# Troubleshooting

Common issues when setting up mcp-rubber-duck in AI coding tools.

## "No tools found" / Server doesn't appear

**Cause:** Missing `MCP_SERVER=true` environment variable.

This is the #1 setup mistake. Without it, the server starts in standalone mode instead of MCP mode.

**Fix:** Ensure `"MCP_SERVER": "true"` is in the `env` block of your config. The value must be the string `"true"`, not a boolean.

## JSON syntax errors

**Symptoms:** Tool fails to load, config file seems ignored.

**Common mistakes:**
- Trailing commas after the last property in an object or array
- Missing commas between properties
- Single quotes instead of double quotes
- Unquoted keys

**Fix:** Validate your JSON with `cat config.json | python3 -m json.tool` or paste into [jsonlint.com](https://jsonlint.com).

## "command not found: mcp-rubber-duck"

**Cause:** The npm global package isn't installed or isn't in PATH.

**Fixes:**
1. Install globally: `npm install -g mcp-rubber-duck`
2. Or switch to npx: use `"command": "npx"` with `"args": ["-y", "mcp-rubber-duck"]`
3. Or use the full path: `which mcp-rubber-duck` to find the installed location

## API key errors / "401 Unauthorized"

**Cause:** Invalid or expired API key.

**Fixes:**
- OpenAI: Key should start with `sk-`. Get a new one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Gemini: Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- Groq: Key should start with `gsk_`. Get one at [console.groq.com/keys](https://console.groq.com/keys)
- Check for extra whitespace or quotes around the key value

## Ducks show as "unhealthy"

**Possible causes:**
1. **Invalid API key** — see above
2. **Network issues** — check internet connection, proxy, or firewall
3. **Rate limits** — new accounts often have strict rate limits
4. **Provider outage** — check the provider's status page

**Diagnosis:** Use `list_ducks` with `check_health: true` to see specific error messages per duck.

## Config file not found / wrong path

**Per-tool config locations:**

| Tool | macOS | Windows | Linux |
|------|-------|---------|-------|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | `%APPDATA%\Claude\claude_desktop_config.json` | `~/.config/Claude/claude_desktop_config.json` |
| Claude Code (user) | `~/.claude.json` | `~/.claude.json` | `~/.claude.json` |
| Claude Code (project) | `.mcp.json` | `.mcp.json` | `.mcp.json` |
| Cursor | `.cursor/mcp.json` | `.cursor/mcp.json` | `.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `~/.codeium/windsurf/mcp_config.json` | `~/.codeium/windsurf/mcp_config.json` |
| VS Code | `.vscode/mcp.json` | `.vscode/mcp.json` | `.vscode/mcp.json` |

## Changes not taking effect

**Fix:** Most tools require a full restart after config changes:
- **Claude Desktop:** Cmd+Q (Mac) or fully quit (Windows), then relaunch
- **Cursor/VS Code/Windsurf:** Reload window (Cmd+Shift+P → "Reload Window") or restart
- **Claude Code:** Start a new session (`/quit` then relaunch)

## VS Code: using wrong key name

**Cause:** VS Code uses `"servers"` not `"mcpServers"`.

```json
// WRONG for VS Code
{ "mcpServers": { "rubber-duck": { ... } } }

// CORRECT for VS Code
{ "servers": { "rubber-duck": { ... } } }
```

## Ollama: connection refused

**Cause:** Ollama server not running.

**Fix:**
1. Start Ollama: `ollama serve`
2. Pull a model: `ollama pull llama3.2`
3. Verify: `curl http://localhost:11434/v1/models`

## npx: "package not found" or stale version

**Fix:**
- Clear npx cache: `npx clear-npx-cache` or `rm -rf ~/.npm/_npx`
- Use explicit version: `npx -y mcp-rubber-duck@latest`

## ChatGPT

ChatGPT does not use config files for MCP. Add MCP servers via:
1. Settings → Developer Mode → Enable
2. Add MCP Server → enter server details via UI
