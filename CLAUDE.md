# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Rubber Duck is an MCP (Model Context Protocol) server that bridges to multiple OpenAI-compatible LLMs. It provides "rubber duck debugging" with AI - query multiple LLM providers simultaneously and get different perspectives.

## Common Commands

```bash
npm run build          # Build TypeScript to dist/
npm run dev            # Development with watch mode
npm test               # Run all tests
npm test -- tests/config.test.ts                    # Single test file
npm test -- --testNamePattern="should load config"  # Specific test
npm run lint           # ESLint
npm run format         # Prettier
npm run typecheck      # Type check without emit
```

## Architecture

### Entry Points
- `src/index.ts` - Application entry, creates `RubberDuckServer` and handles process lifecycle
- `src/server.ts` - Main MCP server implementation (`RubberDuckServer` class)

### Core Layers

**Configuration** (`src/config/`)
- `config.ts` - `ConfigManager` loads config from JSON file or environment variables
- `types.ts` - Zod schemas and TypeScript types (types inferred via `z.infer<>`)

**Providers** (`src/providers/`)
- `manager.ts` - `ProviderManager` manages all LLM provider connections
- `provider.ts` - `DuckProvider` wraps OpenAI SDK for individual provider calls
- `enhanced-manager.ts` - `EnhancedProviderManager` adds MCP Bridge functionality

**Services** (`src/services/`)
- `conversation.ts` - `ConversationManager` maintains chat context
- `cache.ts` - `ResponseCache` with TTL-based caching
- `health.ts` - `HealthMonitor` checks provider availability
- `mcp-client-manager.ts` - Connects to external MCP servers (for MCP Bridge)
- `approval.ts` - MCP tool approval workflow
- `consensus.ts` - Multi-agent voting and consensus logic

**Tools** (`src/tools/`)
Each file exports a tool handler function. See "Adding New Tools" below.

## Key Patterns

### ESM Modules
Project uses ES modules (`"type": "module"`). **Always use `.js` extension in imports**, even for TypeScript files:
```typescript
import { ProviderManager } from '../providers/manager.js';  // Correct
import { ProviderManager } from '../providers/manager';     // Wrong
```

### Tool Response Format
All tools return MCP-compliant response:
```typescript
return {
  content: [{ type: 'text', text: 'response string' }],
};
// On error:
return {
  content: [{ type: 'text', text: 'Error: ...' }],
  isError: true,
};
```

### Adding New Tools
1. Create `src/tools/my-tool.ts`:
```typescript
import { ProviderManager } from '../providers/manager.js';

export async function myTool(
  providerManager: ProviderManager,  // Dependencies vary per tool
  args: Record<string, unknown>
) {
  const { prompt } = args as { prompt?: string };
  if (!prompt) throw new Error('prompt is required');

  const response = await providerManager.askDuck(undefined, prompt, {});
  return { content: [{ type: 'text', text: response.content }] };
}
```
2. In `src/server.ts`:
   - Import: `import { myTool } from './tools/my-tool.js';`
   - Add to `getTools()` array with JSON Schema for inputs
   - Add case to switch in `CallToolRequestSchema` handler

Note: Tool dependencies vary - some take `providerManager`, others take `conversationManager`, `cache`, `healthMonitor`, etc. Check existing tools for patterns.

### Config Validation
Config uses Zod schemas in `src/config/types.ts`. When adding config options:
1. Add to appropriate schema (e.g., `ConfigSchema`)
2. Type is automatically inferred via `z.infer<typeof ConfigSchema>`

### MCP Terminology
- `MCP_SERVER=true` - This server runs AS an MCP server (for Claude Desktop)
- `MCP_BRIDGE_ENABLED=true` - Ducks can ACCESS external MCP servers as clients

## Environment Variables

```bash
# Provider API keys
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
GROQ_API_KEY=gsk_...

# Defaults
DEFAULT_PROVIDER=openai
DEFAULT_TEMPERATURE=0.7
LOG_LEVEL=info  # debug, info, warn, error

# MCP modes
MCP_SERVER=true           # Run as MCP server
MCP_BRIDGE_ENABLED=true   # Enable MCP Bridge feature

# Custom providers: CUSTOM_{NAME}_{FIELD}
CUSTOM_MYAPI_API_KEY=...
CUSTOM_MYAPI_BASE_URL=https://api.example.com/v1
CUSTOM_MYAPI_DEFAULT_MODEL=model-name
```
