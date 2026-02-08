# MCP Bridge - Connect to Other MCP Servers

<p align="center">
  <img src="../assets/docs-mcp-bridge.jpg" alt="MCP Bridge - ducks crossing to external servers" width="600">
</p>

The MCP Bridge allows your ducks to access tools from other MCP servers, extending their capabilities beyond just chat. Your ducks can now search documentation, access files, query APIs, and much more!

**Note**: This is different from the MCP server integration:
- **MCP Bridge** (`MCP_BRIDGE_ENABLED`): Ducks USE external MCP servers as clients
- **MCP Server** (`MCP_SERVER`): Rubber-duck SERVES as an MCP server to any MCP client

## Quick Setup

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

## Approval Modes

**`always`**: Every tool call requires approval (with session-based memory)
- First use of a tool -> requires approval
- Subsequent uses of the same tool -> automatic (until restart)

**`trusted`**: Only untrusted tools require approval
- Tools in trusted lists execute immediately
- Unknown tools require approval

**`never`**: All tools execute immediately (use with caution)

## Per-Server Trusted Tools

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

## MCP Server Configuration

Configure MCP servers using environment variables:

### HTTP Servers
```bash
MCP_SERVER_{NAME}_TYPE="http"
MCP_SERVER_{NAME}_URL="https://api.example.com/mcp"
MCP_SERVER_{NAME}_API_KEY="your-api-key"        # Optional
MCP_SERVER_{NAME}_ENABLED="true"
```

### STDIO Servers
```bash
MCP_SERVER_{NAME}_TYPE="stdio"
MCP_SERVER_{NAME}_COMMAND="python"
MCP_SERVER_{NAME}_ARGS="/path/to/script.py,--arg1,--arg2"
MCP_SERVER_{NAME}_ENABLED="true"
```

## Example: Enable Context7 Documentation

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

## Token Optimization Benefits

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

## Session-Based Approvals

When using `always` mode, the system remembers your approvals:

1. **First time**: "Duck wants to use `search-docs` - Approve?"
2. **Next time**: Duck uses `search-docs` automatically (no new approval needed)
3. **Different tool**: "Duck wants to use `get-examples` - Approve?"
4. **Restart**: Session memory clears, start over

This eliminates approval fatigue while maintaining security!
