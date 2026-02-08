# Claude Desktop Configuration

<p align="center">
  <img src="../assets/docs-claude-desktop.jpg" alt="Claude Desktop setup" width="600">
</p>

This is the most common setup method for using MCP Rubber Duck with Claude Desktop.

## Step 1: Install

Choose one of these options:

**Option A: NPM (Recommended)**
```bash
npm install -g mcp-rubber-duck
```

**Option B: From Source** (see [Installation](../README.md#installation))

## Step 2: Configure Claude Desktop

Edit your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Add the MCP server configuration:

**If installed via NPM:**
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

**If installed from source:**
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

**Important**: Replace the placeholder API keys with your actual keys:
- `your-openai-api-key-here` -> Your OpenAI API key (starts with `sk-`)
- `your-gemini-api-key-here` -> Your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

**Note**: `MCP_SERVER: "true"` is required - this tells rubber-duck to run as an MCP server for any MCP client (not related to the MCP Bridge feature).

**Tip**: See [Configuration](./configuration.md) for additional options like `LOG_LEVEL`, custom model defaults, and duck nicknames.

## Step 3: Restart Claude Desktop

1. Completely quit Claude Desktop (Cmd+Q on Mac)
2. Launch Claude Desktop again
3. The MCP server should connect automatically

## Step 4: Test the Integration

Once restarted, test these commands in Claude:

### Check Duck Health
```
Use the list_ducks tool with check_health: true
```
Should show:
- GPT Duck (openai) - Healthy
- Gemini Duck (gemini) - Healthy

### List Available Models
```
Use the list_models tool
```

### Ask a Specific Duck
```
Use the ask_duck tool with prompt: "What is rubber duck debugging?", provider: "openai"
```

### Compare Multiple Ducks
```
Use the compare_ducks tool with prompt: "Explain async/await in JavaScript"
```

### Test Specific Models
```
Use the ask_duck tool with prompt: "Hello", provider: "openai", model: "gpt-4o"
```

## Troubleshooting

### If Tools Don't Appear
1. **Check API Keys**: Ensure your API keys are correctly entered without typos
2. **Verify Build**: Run `ls -la dist/index.js` to confirm the project built successfully
3. **Check Logs**: Look for errors in Claude Desktop's developer console
4. **Restart**: Fully quit and restart Claude Desktop after config changes

### Connection Issues
1. **Config File Path**: Double-check you're editing the correct config file path
2. **JSON Syntax**: Validate your JSON syntax (no trailing commas, proper quotes)
3. **Absolute Paths**: Ensure you're using the full absolute path to `dist/index.js`
4. **File Permissions**: Verify Claude Desktop can read the dist directory

### Health Check Failures
If ducks show as unhealthy:
1. **API Keys**: Verify keys are valid and have sufficient credits/quota
2. **Network**: Check internet connection and firewall settings
3. **Rate Limits**: Some providers have strict rate limits for new accounts
