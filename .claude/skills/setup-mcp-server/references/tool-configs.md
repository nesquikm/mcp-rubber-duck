# Tool Configuration Templates

Per-tool JSON/YAML templates for adding mcp-rubber-duck as an MCP server.

Each section shows three install variants:
- **npm global** — `mcp-rubber-duck` command (after `npm install -g mcp-rubber-duck`)
- **npx** — `npx -y mcp-rubber-duck` (no install required)
- **from source** — `node /absolute/path/to/mcp-rubber-duck/dist/index.js`

Replace placeholder API keys with real values or leave as-is for the user to fill in later.

---

## Claude Desktop

**Config file:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Key:** `mcpServers`

### npm global
```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "mcp-rubber-duck",
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "your-openai-api-key-here",
        "GEMINI_API_KEY": "your-gemini-api-key-here",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

### npx
```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "npx",
      "args": ["-y", "mcp-rubber-duck"],
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "your-openai-api-key-here",
        "GEMINI_API_KEY": "your-gemini-api-key-here",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

### From source
```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-rubber-duck/dist/index.js"],
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "your-openai-api-key-here",
        "GEMINI_API_KEY": "your-gemini-api-key-here",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

---

## Claude Code

**Preferred method:** Use the `claude mcp add` CLI command.

**Config files (manual alternative):**
- User scope: `~/.claude.json` (key: `mcpServers`)
- Project scope: `.mcp.json` at project root (key: `mcpServers`)

### CLI method (recommended)

```bash
# npm global install
claude mcp add --scope user rubber-duck -- mcp-rubber-duck

# npx
claude mcp add --scope user rubber-duck -- npx -y mcp-rubber-duck

# from source
claude mcp add --scope user rubber-duck -- node /absolute/path/to/mcp-rubber-duck/dist/index.js
```

After adding via CLI, edit `~/.claude.json` to add env vars to the entry that was just created:
```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "mcp-rubber-duck",
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "your-openai-api-key-here",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

### Project scope (.mcp.json)
```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "npx",
      "args": ["-y", "mcp-rubber-duck"],
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "your-openai-api-key-here",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

**Note:** For project scope, consider whether API keys should be committed. Use shell environment variables or `.env` files instead of hardcoding keys in `.mcp.json`.

---

## Cursor

**Config files:**
- Project scope: `.cursor/mcp.json` (in project root)
- Global scope: `~/.cursor/mcp.json`

**Key:** `mcpServers`

### npm global
```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "mcp-rubber-duck",
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "your-openai-api-key-here",
        "GEMINI_API_KEY": "your-gemini-api-key-here",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

### npx
```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "npx",
      "args": ["-y", "mcp-rubber-duck"],
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "your-openai-api-key-here",
        "GEMINI_API_KEY": "your-gemini-api-key-here",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

### From source
```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-rubber-duck/dist/index.js"],
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "your-openai-api-key-here",
        "GEMINI_API_KEY": "your-gemini-api-key-here",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

---

## Windsurf

**Config file:** `~/.codeium/windsurf/mcp_config.json`

**Key:** `mcpServers`

Windsurf supports `${env:VAR_NAME}` interpolation — use this instead of hardcoding API keys.

### npm global (with env interpolation)
```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "mcp-rubber-duck",
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "${env:OPENAI_API_KEY}",
        "GEMINI_API_KEY": "${env:GEMINI_API_KEY}",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

### npx (with env interpolation)
```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "npx",
      "args": ["-y", "mcp-rubber-duck"],
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "${env:OPENAI_API_KEY}",
        "GEMINI_API_KEY": "${env:GEMINI_API_KEY}",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

### From source (with env interpolation)
```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-rubber-duck/dist/index.js"],
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "${env:OPENAI_API_KEY}",
        "GEMINI_API_KEY": "${env:GEMINI_API_KEY}",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

**Note:** With `${env:VAR}` syntax, set the actual API keys in your shell profile (`~/.zshrc`, `~/.bashrc`, etc.) and Windsurf will read them at runtime.

---

## VS Code

**Config file:** `.vscode/mcp.json` (in project root)

**Key:** `servers` (NOT `mcpServers` — VS Code uses a different key!)

VS Code supports `${env:VAR_NAME}` interpolation.

### npm global (with env interpolation)
```json
{
  "servers": {
    "rubber-duck": {
      "command": "mcp-rubber-duck",
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "${env:OPENAI_API_KEY}",
        "GEMINI_API_KEY": "${env:GEMINI_API_KEY}",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

### npx (with env interpolation)
```json
{
  "servers": {
    "rubber-duck": {
      "command": "npx",
      "args": ["-y", "mcp-rubber-duck"],
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "${env:OPENAI_API_KEY}",
        "GEMINI_API_KEY": "${env:GEMINI_API_KEY}",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

### From source (with env interpolation)
```json
{
  "servers": {
    "rubber-duck": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-rubber-duck/dist/index.js"],
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "${env:OPENAI_API_KEY}",
        "GEMINI_API_KEY": "${env:GEMINI_API_KEY}",
        "DEFAULT_PROVIDER": "openai"
      }
    }
  }
}
```

**Note:** VS Code MCP support requires the GitHub Copilot extension with agent mode enabled.

---

## Continue

**Config file:** `.continue/config.yaml` (in project root or `~/.continue/config.yaml` for global)

**Key:** `mcpServers` (YAML array — not an object map like other tools)

### npm global
```yaml
mcpServers:
  - name: rubber-duck
    command: mcp-rubber-duck
    env:
      MCP_SERVER: "true"
      OPENAI_API_KEY: your-openai-api-key-here
      GEMINI_API_KEY: your-gemini-api-key-here
      DEFAULT_PROVIDER: openai
```

### npx
```yaml
mcpServers:
  - name: rubber-duck
    command: npx
    args:
      - "-y"
      - mcp-rubber-duck
    env:
      MCP_SERVER: "true"
      OPENAI_API_KEY: your-openai-api-key-here
      GEMINI_API_KEY: your-gemini-api-key-here
      DEFAULT_PROVIDER: openai
```

### From source
```yaml
mcpServers:
  - name: rubber-duck
    command: node
    args:
      - /absolute/path/to/mcp-rubber-duck/dist/index.js
    env:
      MCP_SERVER: "true"
      OPENAI_API_KEY: your-openai-api-key-here
      GEMINI_API_KEY: your-gemini-api-key-here
      DEFAULT_PROVIDER: openai
```

**Note:** Continue's `mcpServers` is a YAML array. When merging, append a new array element — don't convert to an object.

---

## Adding providers to any template

### Ollama (local, no API key)
Add to the `env` block:
```json
"OLLAMA_BASE_URL": "http://localhost:11434/v1",
"OLLAMA_DEFAULT_MODEL": "llama3.2"
```

### Groq
Add to the `env` block:
```json
"GROQ_API_KEY": "your-groq-api-key-here"
```

### CLI agents
Add to the `env` block:
```json
"CLI_CLAUDE_ENABLED": "true",
"CLI_CODEX_ENABLED": "true",
"CLI_GEMINI_ENABLED": "true",
"CLI_AIDER_ENABLED": "true"
```

### Custom providers
Add to the `env` block (replace `MYAPI` with your provider name):
```json
"CUSTOM_MYAPI_API_KEY": "your-api-key",
"CUSTOM_MYAPI_BASE_URL": "https://api.example.com/v1",
"CUSTOM_MYAPI_DEFAULT_MODEL": "model-name",
"CUSTOM_MYAPI_NICKNAME": "My Custom Duck"
```

---

## ChatGPT

ChatGPT does not use a config file. To add MCP servers:
1. Open ChatGPT settings
2. Navigate to Developer Mode
3. Use "Add MCP Server" in the UI
4. Enter the server URL or command

See the troubleshooting reference for more details.
