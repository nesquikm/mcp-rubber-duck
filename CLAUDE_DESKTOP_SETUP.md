# Claude Desktop Setup Guide for MCP Rubber Duck

## ✅ Build Status: COMPLETE

The project has been successfully built and is ready to use!

## 📝 Next Steps

### 1. Add Your API Keys

Edit the Claude Desktop config file:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

Replace these placeholders with your actual API keys:
- `YOUR_OPENAI_API_KEY_HERE` → Your OpenAI API key (starts with sk-)
- `YOUR_GEMINI_API_KEY_HERE` → Your Gemini API key

### 2. Restart Claude Desktop

1. Completely quit Claude Desktop (Cmd+Q)
2. Launch Claude Desktop again
3. The MCP server should connect automatically

### 3. Test the Tools

Once restarted, you can test these commands in Claude:

#### List Available Ducks
Ask Claude: "Use the list_ducks tool with check_health: true"

This should show:
- ✅ OpenAI (GPT Duck)
- ✅ Gemini (Gemini Duck)

#### List Available Models
Ask Claude: "Use the list_models tool"

This will show all available models for each provider.

#### Ask OpenAI
Ask Claude: "Use the ask_duck tool with prompt: 'What is rubber duck debugging?', provider: 'openai'"

#### Ask Gemini
Ask Claude: "Use the ask_duck tool with prompt: 'What is rubber duck debugging?', provider: 'gemini'"

#### Compare Both
Ask Claude: "Use the compare_ducks tool with prompt: 'Explain async/await in JavaScript'"

#### Test Specific Models
Ask Claude: "Use the ask_duck tool with prompt: 'Hello', provider: 'openai', model: 'gpt-4o-mini'"

## 🔍 Troubleshooting

### If Tools Don't Appear
1. Check that your API keys are correctly entered
2. Look for errors in Claude Desktop logs
3. Verify the build was successful: `ls -la dist/index.js`

### Check MCP Connection
In Claude, you should see the MCP tools available. If not:
1. Make sure you saved the config file
2. Fully quit and restart Claude Desktop
3. Check for typos in the config file

## 📋 Available Tools Summary

- **list_ducks** - Shows all configured providers and their health
- **list_models** - Lists available models for each provider
- **ask_duck** - Query a specific provider
- **chat_with_duck** - Have a conversation with context
- **compare_ducks** - Query multiple providers simultaneously
- **duck_council** - Get responses from all providers

## 🦆 Enjoy Your AI Duck Panel!

You now have OpenAI and Gemini ducks ready to help with your debugging and questions!