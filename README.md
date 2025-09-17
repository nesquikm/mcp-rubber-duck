# 🦆 MCP Rubber Duck

An MCP (Model Context Protocol) server that acts as a bridge to query multiple OpenAI-compatible LLMs. Just like rubber duck debugging, explain your problems to various AI "ducks" and get different perspectives!

[![npm version](https://badge.fury.io/js/mcp-rubber-duck.svg)](https://www.npmjs.com/package/mcp-rubber-duck)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/nesquikm/mcp-rubber-duck/pkgs/container/mcp-rubber-duck)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-green)](https://modelcontextprotocol.io/registry)

```
     __
   <(o )___
    ( ._> /
     `---'  Quack! Ready to debug!
```

## Features

- 🔌 **Universal OpenAI Compatibility**: Works with any OpenAI-compatible API endpoint
- 🦆 **Multiple Ducks**: Configure and query multiple LLM providers simultaneously  
- 💬 **Conversation Management**: Maintain context across multiple messages
- 🏛️ **Duck Council**: Get responses from all your configured LLMs at once
- 💾 **Response Caching**: Avoid duplicate API calls with intelligent caching
- 🔄 **Automatic Failover**: Falls back to other providers if primary fails
- 📊 **Health Monitoring**: Real-time health checks for all providers
- 🔗 **MCP Bridge**: Connect ducks to other MCP servers for extended functionality
- 🛡️ **Granular Security**: Per-server approval controls with session-based approvals
- 🎨 **Fun Duck Theme**: Rubber duck debugging with personality!

## Supported Providers

Any provider with an OpenAI-compatible API endpoint, including:

- **OpenAI** (GPT-4, GPT-3.5)
- **Google Gemini** (Gemini 2.5 Flash, Gemini 2.0 Flash)
- **Anthropic** (via OpenAI-compatible endpoints)
- **Groq** (Llama, Mixtral, Gemma)
- **Together AI** (Llama, Mixtral, and more)
- **Perplexity** (Online models with web search)
- **Anyscale** (Open source models)
- **Azure OpenAI** (Microsoft-hosted OpenAI)
- **Ollama** (Local models)
- **LM Studio** (Local models)
- **Custom** (Any OpenAI-compatible endpoint)

## Quick Start

### For Claude Desktop Users
👉 **Complete Claude Desktop setup instructions below in [Claude Desktop Configuration](#claude-desktop-configuration)**

## Installation

### Prerequisites

- Node.js 20 or higher
- npm or yarn
- At least one API key for a supported provider

### Installation Methods

#### Option 1: Install from NPM

```bash
npm install -g mcp-rubber-duck
```

#### Option 2: Install from Source

```bash
# Clone the repository
git clone https://github.com/nesquikm/mcp-rubber-duck.git
cd mcp-rubber-duck

# Install dependencies
npm install

# Build the project
npm run build

# Run the server
npm start
```

## Configuration

### Method 1: Environment Variables

Create a `.env` file in the project root:

```env
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o-mini  # Optional: defaults to gpt-4o-mini

# Google Gemini
GEMINI_API_KEY=...
GEMINI_DEFAULT_MODEL=gemini-2.5-flash  # Optional: defaults to gemini-2.5-flash

# Groq
GROQ_API_KEY=gsk_...
GROQ_DEFAULT_MODEL=llama-3.3-70b-versatile  # Optional: defaults to llama-3.3-70b-versatile

# Ollama (Local)
OLLAMA_BASE_URL=http://localhost:11434/v1  # Optional
OLLAMA_DEFAULT_MODEL=llama3.2  # Optional: defaults to llama3.2

# Together AI
TOGETHER_API_KEY=...

# Custom Providers (you can add multiple)
# Format: CUSTOM_{NAME}_* where NAME becomes the provider key (lowercase)

# Example: Add provider "myapi"
CUSTOM_MYAPI_API_KEY=...
CUSTOM_MYAPI_BASE_URL=https://api.example.com/v1
CUSTOM_MYAPI_DEFAULT_MODEL=custom-model  # Optional
CUSTOM_MYAPI_MODELS=model1,model2        # Optional: comma-separated list
CUSTOM_MYAPI_NICKNAME=My Custom Duck     # Optional: display name

# Example: Add provider "azure" 
CUSTOM_AZURE_API_KEY=...
CUSTOM_AZURE_BASE_URL=https://mycompany.openai.azure.com/v1

# Global Settings
DEFAULT_PROVIDER=openai
DEFAULT_TEMPERATURE=0.7
LOG_LEVEL=info

# MCP Bridge Settings (Optional)
MCP_BRIDGE_ENABLED=true                      # Enable ducks to access external MCP servers
MCP_APPROVAL_MODE=trusted                    # always, trusted, or never
MCP_APPROVAL_TIMEOUT=300                     # seconds

# MCP Server: Context7 Documentation (Example)
MCP_SERVER_CONTEXT7_TYPE=http
MCP_SERVER_CONTEXT7_URL=https://mcp.context7.com/mcp
MCP_SERVER_CONTEXT7_ENABLED=true

# Per-server trusted tools
MCP_TRUSTED_TOOLS_CONTEXT7=*                 # Trust all Context7 tools

# Optional: Custom Duck Nicknames (Have fun with these!)
OPENAI_NICKNAME="DUCK-4"              # Optional: defaults to "GPT Duck"
GEMINI_NICKNAME="Duckmini"            # Optional: defaults to "Gemini Duck"
GROQ_NICKNAME="Quackers"              # Optional: defaults to "Groq Duck"
OLLAMA_NICKNAME="Local Quacker"       # Optional: defaults to "Local Duck"
CUSTOM_NICKNAME="My Special Duck"     # Optional: defaults to "Custom Duck"
```

**Note:** Duck nicknames are completely optional! If you don't set them, you'll get the charming defaults (GPT Duck, Gemini Duck, etc.). If you use a `config.json` file, those nicknames take priority over environment variables.

### Method 2: Configuration File

Create a `config/config.json` file based on the example:

```bash
cp config/config.example.json config/config.json
# Edit config/config.json with your API keys and preferences
```

## Claude Desktop Configuration

This is the most common setup method for using MCP Rubber Duck with Claude Desktop.

### Step 1: Build the Project

First, ensure the project is built:

```bash
# Clone the repository
git clone https://github.com/nesquikm/mcp-rubber-duck.git
cd mcp-rubber-duck

# Install dependencies and build
npm install
npm run build
```

### Step 2: Configure Claude Desktop

Edit your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the MCP server configuration:

```json
{
  "mcpServers": {
    "rubber-duck": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-rubber-duck/dist/index.js"],
      "env": {
        "MCP_SERVER": "true",
        "OPENAI_API_KEY": "your-openai-api-key-here",
        "OPENAI_DEFAULT_MODEL": "gpt-4o-mini",
        "GEMINI_API_KEY": "your-gemini-api-key-here", 
        "GEMINI_DEFAULT_MODEL": "gemini-2.5-flash",
        "DEFAULT_PROVIDER": "openai",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Important**: Replace the placeholder API keys with your actual keys:
- `your-openai-api-key-here` → Your OpenAI API key (starts with `sk-`)
- `your-gemini-api-key-here` → Your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

**Note**: `MCP_SERVER: "true"` is required - this tells rubber-duck to run as an MCP server for any MCP client (not related to the MCP Bridge feature).

### Step 3: Restart Claude Desktop

1. Completely quit Claude Desktop (⌘+Q on Mac)
2. Launch Claude Desktop again
3. The MCP server should connect automatically

### Step 4: Test the Integration

Once restarted, test these commands in Claude:

#### Check Duck Health
```
Use the list_ducks tool with check_health: true
```
Should show:
- ✅ **GPT Duck** (openai) - Healthy
- ✅ **Gemini Duck** (gemini) - Healthy

#### List Available Models
```
Use the list_models tool
```

#### Ask a Specific Duck
```
Use the ask_duck tool with prompt: "What is rubber duck debugging?", provider: "openai"
```

#### Compare Multiple Ducks
```
Use the compare_ducks tool with prompt: "Explain async/await in JavaScript"
```

#### Test Specific Models
```
Use the ask_duck tool with prompt: "Hello", provider: "openai", model: "gpt-4"
```

### Troubleshooting Claude Desktop Setup

#### If Tools Don't Appear
1. **Check API Keys**: Ensure your API keys are correctly entered without typos
2. **Verify Build**: Run `ls -la dist/index.js` to confirm the project built successfully  
3. **Check Logs**: Look for errors in Claude Desktop's developer console
4. **Restart**: Fully quit and restart Claude Desktop after config changes

#### Connection Issues
1. **Config File Path**: Double-check you're editing the correct config file path
2. **JSON Syntax**: Validate your JSON syntax (no trailing commas, proper quotes)
3. **Absolute Paths**: Ensure you're using the full absolute path to `dist/index.js`
4. **File Permissions**: Verify Claude Desktop can read the dist directory

#### Health Check Failures
If ducks show as unhealthy:
1. **API Keys**: Verify keys are valid and have sufficient credits/quota
2. **Network**: Check internet connection and firewall settings
3. **Rate Limits**: Some providers have strict rate limits for new accounts

## MCP Bridge - Connect to Other MCP Servers

The MCP Bridge allows your ducks to access tools from other MCP servers, extending their capabilities beyond just chat. Your ducks can now search documentation, access files, query APIs, and much more!

**Note**: This is different from the MCP server integration above:
- **MCP Bridge** (`MCP_BRIDGE_ENABLED`): Ducks USE external MCP servers as clients
- **MCP Server** (`MCP_SERVER`): Rubber-duck SERVES as an MCP server to any MCP client

### Quick Setup

Add these environment variables to enable MCP Bridge:

```bash
# Basic MCP Bridge Configuration
MCP_BRIDGE_ENABLED="true"                # Enable ducks to access external MCP servers
MCP_APPROVAL_MODE="trusted"              # always, trusted, or never
MCP_APPROVAL_TIMEOUT="300"               # 5 minutes

# Example: Context7 Documentation Server
MCP_SERVER_CONTEXT7_TYPE="http"
MCP_SERVER_CONTEXT7_URL="https://mcp.context7.com/mcp"
MCP_SERVER_CONTEXT7_ENABLED="true"

# Trust all Context7 tools (no approval needed)
MCP_TRUSTED_TOOLS_CONTEXT7="*"
```

### Approval Modes

**`always`**: Every tool call requires approval (with session-based memory)
- First use of a tool → requires approval
- Subsequent uses of the same tool → automatic (until restart)

**`trusted`**: Only untrusted tools require approval
- Tools in trusted lists execute immediately
- Unknown tools require approval

**`never`**: All tools execute immediately (use with caution)

### Per-Server Trusted Tools

Configure trust levels per MCP server for granular security:

```bash
# Trust all tools from Context7 (documentation server)
MCP_TRUSTED_TOOLS_CONTEXT7="*"

# Trust specific filesystem operations only
MCP_TRUSTED_TOOLS_FILESYSTEM="read-file,list-directory"

# Trust specific GitHub tools
MCP_TRUSTED_TOOLS_GITHUB="get-repo-info,list-issues"

# Global fallback for servers without specific config
MCP_TRUSTED_TOOLS="common-safe-tool"
```

### MCP Server Configuration

Configure MCP servers using environment variables:

#### HTTP Servers
```bash
MCP_SERVER_{NAME}_TYPE="http"
MCP_SERVER_{NAME}_URL="https://api.example.com/mcp"
MCP_SERVER_{NAME}_API_KEY="your-api-key"        # Optional
MCP_SERVER_{NAME}_ENABLED="true"
```

#### STDIO Servers  
```bash
MCP_SERVER_{NAME}_TYPE="stdio"
MCP_SERVER_{NAME}_COMMAND="python"
MCP_SERVER_{NAME}_ARGS="/path/to/script.py,--arg1,--arg2"
MCP_SERVER_{NAME}_ENABLED="true"
```

### Example: Enable Context7 Documentation

```bash
# Enable MCP Bridge
MCP_BRIDGE_ENABLED="true"
MCP_APPROVAL_MODE="trusted"

# Configure Context7 server
MCP_SERVER_CONTEXT7_TYPE="http"
MCP_SERVER_CONTEXT7_URL="https://mcp.context7.com/mcp"
MCP_SERVER_CONTEXT7_ENABLED="true"

# Trust all Context7 tools
MCP_TRUSTED_TOOLS_CONTEXT7="*"
```

Now your ducks can search and retrieve documentation from Context7:

```
Ask: "Can you find React hooks documentation from Context7 and return only the key concepts?"
Duck: *searches Context7 and returns focused, essential React hooks information*
```

### 💡 Token Optimization Benefits

**Smart Token Management**: Ducks can retrieve comprehensive data from MCP servers but return only the essential information you need, saving tokens in your host LLM conversations:

- **Ask for specifics**: "Find TypeScript interfaces documentation and return only the core concepts"
- **Duck processes full docs**: Accesses complete documentation from Context7
- **Returns condensed results**: Provides focused, relevant information while filtering out unnecessary details
- **Token savings**: Reduces response size by 70-90% compared to raw documentation dumps

**Example Workflow:**
```
You: "Find Express.js routing concepts from Context7, keep it concise"
Duck: *Retrieves full Express docs, processes, and returns only routing essentials*
Result: 500 tokens instead of 5,000+ tokens of raw documentation
```

### Session-Based Approvals

When using `always` mode, the system remembers your approvals:

1. **First time**: "Duck wants to use `search-docs` - Approve? ✅"
2. **Next time**: Duck uses `search-docs` automatically (no new approval needed)
3. **Different tool**: "Duck wants to use `get-examples` - Approve? ✅"  
4. **Restart**: Session memory clears, start over

This eliminates approval fatigue while maintaining security!

### Available Tools (Enhanced with MCP)

### 🦆 ask_duck
Ask a single question to a specific LLM provider. When MCP Bridge is enabled, ducks can automatically access tools from connected MCP servers.

```typescript
{
  "prompt": "What is rubber duck debugging?",
  "provider": "openai",  // Optional, uses default if not specified
  "temperature": 0.7     // Optional
}
```

### 💬 chat_with_duck
Have a conversation with context maintained across messages.

```typescript
{
  "conversation_id": "debug-session-1",
  "message": "Can you help me debug this code?",
  "provider": "groq"  // Optional, can switch providers mid-conversation
}
```

### 🧹 clear_conversations
Clear all conversation history and start fresh. Useful when switching topics or when context becomes too large.

```typescript
{
  // No parameters required
}
```

### 📋 list_ducks
List all configured providers and their health status.

```typescript
{
  "check_health": true  // Optional, performs fresh health check
}
```

### 📊 list_models
List available models for LLM providers.

```typescript
{
  "provider": "openai",     // Optional, lists all if not specified
  "fetch_latest": false     // Optional, fetch latest from API vs cached
}
```

### 🔍 compare_ducks
Ask the same question to multiple providers simultaneously.

```typescript
{
  "prompt": "What's the best programming language?",
  "providers": ["openai", "groq", "ollama"]  // Optional, uses all if not specified
}
```

### 🏛️ duck_council
Get responses from all configured ducks - like a panel discussion!

```typescript
{
  "prompt": "How should I architect a microservices application?"
}
```

## Usage Examples

### Basic Query
```javascript
// Ask the default duck
await ask_duck({ 
  prompt: "Explain async/await in JavaScript" 
});
```

### Conversation
```javascript
// Start a conversation
await chat_with_duck({
  conversation_id: "learning-session",
  message: "What is TypeScript?"
});

// Continue the conversation
await chat_with_duck({
  conversation_id: "learning-session", 
  message: "How does it differ from JavaScript?"
});
```

### Compare Responses
```javascript
// Get different perspectives
await compare_ducks({
  prompt: "What's the best way to handle errors in Node.js?",
  providers: ["openai", "groq", "ollama"]
});
```

### Duck Council
```javascript
// Convene the council for important decisions
await duck_council({
  prompt: "Should I use REST or GraphQL for my API?"
});
```

## Provider-Specific Setup

### Ollama (Local)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull llama3.2

# Ollama automatically provides OpenAI-compatible endpoint at localhost:11434/v1
```

### LM Studio (Local)
1. Download LM Studio from https://lmstudio.ai/
2. Load a model in LM Studio
3. Start the local server (provides OpenAI-compatible endpoint at localhost:1234/v1)

### Google Gemini
1. Get API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Add to environment: `GEMINI_API_KEY=...`
3. Uses OpenAI-compatible endpoint (beta)

### Groq
1. Get API key from https://console.groq.com/keys
2. Add to environment: `GROQ_API_KEY=gsk_...`

### Together AI
1. Get API key from https://api.together.xyz/
2. Add to environment: `TOGETHER_API_KEY=...`

## Verifying OpenAI Compatibility

To check if a provider is OpenAI-compatible:

1. Look for `/v1/chat/completions` endpoint in their API docs
2. Check if they support the OpenAI SDK
3. Test with curl:

```bash
curl -X POST "https://api.provider.com/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "model-name",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Development

### Run in Development Mode
```bash
npm run dev
```

### Run Tests
```bash
npm test
```

### Lint Code
```bash
npm run lint
```

### Type Checking
```bash
npm run typecheck
```

## Docker Support

MCP Rubber Duck provides multi-platform Docker support, working on **macOS (Intel & Apple Silicon)**, **Linux (x86_64 & ARM64)**, **Windows (WSL2)**, and **Raspberry Pi 3+**.

### Quick Start with Pre-built Image

The easiest way to get started is with our pre-built multi-architecture image:

```bash
# Pull the image (works on all platforms)
docker pull ghcr.io/nesquikm/mcp-rubber-duck:latest

# Create environment file
cp .env.template .env
# Edit .env and add your API keys

# Run with Docker Compose (recommended)
docker compose up -d
```

### Platform-Specific Deployment

#### 🖥️ Desktop/Server (macOS, Linux, Windows)

```bash
# Use desktop-optimized settings
./scripts/deploy.sh --platform desktop

# Or with more resources and local AI
./scripts/deploy.sh --platform desktop --profile with-ollama
```

#### 🥧 Raspberry Pi

```bash
# Use Pi-optimized settings (memory limits, etc.)
./scripts/deploy.sh --platform pi

# Or copy optimized config directly
cp .env.pi.example .env
# Edit .env and add your API keys
docker compose up -d
```

#### 🌐 Remote Deployment via SSH

```bash
# Deploy to remote Raspberry Pi
./scripts/deploy.sh --mode ssh --ssh-host pi@192.168.1.100
```

### Universal Deployment Script

The `scripts/deploy.sh` script auto-detects your platform and applies optimal settings:

```bash
# Auto-detect platform and deploy
./scripts/deploy.sh

# Options:
./scripts/deploy.sh --help
```

**Available options:**
- `--mode`: `docker` (default), `local`, or `ssh`
- `--platform`: `pi`, `desktop`, or `auto` (default)
- `--profile`: `lightweight`, `desktop`, `with-ollama`
- `--ssh-host`: For remote deployment

### Platform-Specific Configuration

#### Raspberry Pi (Memory-Optimized)
```env
# .env.pi.example - Optimized for Pi 3+
DOCKER_CPU_LIMIT=1.5
DOCKER_MEMORY_LIMIT=512M
NODE_OPTIONS=--max-old-space-size=256
```

#### Desktop/Server (High-Performance)
```env
# .env.desktop.example - Optimized for powerful systems
DOCKER_CPU_LIMIT=4.0
DOCKER_MEMORY_LIMIT=2G
NODE_OPTIONS=--max-old-space-size=1024
```

### Docker Compose Profiles

```bash
# Default profile (lightweight, good for Pi)
docker compose up -d

# Desktop profile (higher resource limits)
docker compose --profile desktop up -d

# With local Ollama AI
docker compose --profile with-ollama up -d
```

### Build Multi-Architecture Images

For developers who want to build and publish their own multi-architecture images:

```bash
# Build for AMD64 + ARM64
./scripts/build-multiarch.sh --platforms linux/amd64,linux/arm64

# Build and push to GitHub Container Registry
./scripts/gh-deploy.sh --public
```

### Claude Desktop with Remote Docker

Connect Claude Desktop to MCP Rubber Duck running on a remote system:

```json
{
  "mcpServers": {
    "rubber-duck-remote": {
      "command": "ssh",
      "args": [
        "user@remote-host",
        "docker exec -i mcp-rubber-duck node /app/dist/index.js"
      ]
    }
  }
}
```

### Platform Compatibility

| Platform | Architecture | Status | Notes |
|----------|-------------|---------|-------|
| **macOS Intel** | AMD64 | ✅ Full | Via Docker Desktop |
| **macOS Apple Silicon** | ARM64 | ✅ Full | Native ARM64 support |
| **Linux x86_64** | AMD64 | ✅ Full | Direct Docker support |
| **Linux ARM64** | ARM64 | ✅ Full | Servers, Pi 4+ |
| **Raspberry Pi 3+** | ARM64 | ✅ Optimized | Memory-limited config |
| **Windows** | AMD64 | ✅ Full | Via Docker Desktop + WSL2 |

### Manual Docker Commands

If you prefer not to use docker-compose:

```bash
# Raspberry Pi
docker run -d \
  --name mcp-rubber-duck \
  --memory=512m --cpus=1.5 \
  --env-file .env \
  --restart unless-stopped \
  ghcr.io/nesquikm/mcp-rubber-duck:latest

# Desktop/Server
docker run -d \
  --name mcp-rubber-duck \
  --memory=2g --cpus=4 \
  --env-file .env \
  --restart unless-stopped \
  ghcr.io/nesquikm/mcp-rubber-duck:latest
```

## Architecture

```
mcp-rubber-duck/
├── src/
│   ├── server.ts           # MCP server implementation
│   ├── config/             # Configuration management
│   ├── providers/          # OpenAI client wrapper
│   ├── tools/              # MCP tool implementations
│   ├── services/           # Health, cache, conversations
│   └── utils/              # Logging, ASCII art
├── config/                 # Configuration examples
└── tests/                  # Test suites
```

## Troubleshooting

### Provider Not Working
1. Check API key is correctly set
2. Verify endpoint URL is correct
3. Run health check: `list_ducks({ check_health: true })`
4. Check logs for detailed error messages

### Connection Issues
- For local providers (Ollama, LM Studio), ensure they're running
- Check firewall settings for local endpoints
- Verify network connectivity to cloud providers

### Rate Limiting
- Enable caching to reduce API calls
- Configure failover to alternate providers
- Adjust `max_retries` and `timeout` settings

## Contributing

🦆 **Want to help make our duck pond better?** 

We love contributions! Whether you're fixing bugs, adding features, or teaching our ducks new tricks, we'd love to have you join the flock.

Check out our [Contributing Guide](./CONTRIBUTING.md) to get started. We promise it's more fun than a regular contributing guide - it has ducks! 🦆

**Quick start for contributors:**
1. Fork the repository
2. Create a feature branch  
3. Follow our [conventional commit guidelines](./CONTRIBUTING.md#commit-messages-duck-communication-protocol)
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Inspired by the rubber duck debugging method
- Built on the Model Context Protocol (MCP)
- Uses OpenAI SDK for universal compatibility

## 📝 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for a detailed history of changes and releases.

## 📦 Registry & Directory

MCP Rubber Duck is available through multiple channels:

- **NPM Package**: [npmjs.com/package/mcp-rubber-duck](https://www.npmjs.com/package/mcp-rubber-duck)
- **Docker Images**: [ghcr.io/nesquikm/mcp-rubber-duck](https://github.com/nesquikm/mcp-rubber-duck/pkgs/container/mcp-rubber-duck)
- **MCP Registry**: Official MCP server `io.github.nesquikm/rubber-duck`
- **Glama Directory**: [glama.ai/mcp/servers/@nesquikm/mcp-rubber-duck](https://glama.ai/mcp/servers/@nesquikm/mcp-rubber-duck)
- **Awesome MCP Servers**: Listed in the [community directory](https://github.com/punkpeye/awesome-mcp-servers)

## Support

- Report issues: https://github.com/nesquikm/mcp-rubber-duck/issues
- Documentation: https://github.com/nesquikm/mcp-rubber-duck/wiki
- Discussions: https://github.com/nesquikm/mcp-rubber-duck/discussions

---

🦆 **Happy Debugging with your AI Duck Panel!** 🦆