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

**`always`** (default): Every tool call requires approval (with session-based memory)
- First use of a tool (with specific arguments) -> requires approval
- Subsequent *identical* calls (same provider + server + tool + arguments) -> automatic, until the approval TTL expires
- A material change in arguments, or TTL expiry -> re-prompts
- Trusted-tool lists are **ignored** in this mode — trust is only consulted in `trusted` mode

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
MCP_TRUSTED_TOOLS_FILESYSTEM="read_text_file,list_directory"

# Trust specific tools from another server — substitute that server's real
# tool names; they are matched exactly, so placeholders never match
MCP_TRUSTED_TOOLS_GITHUB="<tool_name>,<other_tool_name>"

# Global fallback, used ONLY for servers that have no MCP_TRUSTED_TOOLS_<SERVER> entry
MCP_TRUSTED_TOOLS="common_safe_tool"
```

Tool names are matched by **exact string** (`read_text_file`, not `read-file`) against
either the bare tool name or the `server:tool` form. A name that no connected server
actually exposes is inert — it silently trusts nothing. Confirm the real names with the
`mcp_status` tool.

Two things about the global list are easy to get wrong:

- **A per-server list replaces the global list, it does not extend it.** If
  `MCP_TRUSTED_TOOLS_FILESYSTEM` is set, `MCP_TRUSTED_TOOLS` is never consulted for the
  `filesystem` server. Any name you still want trusted there has to be repeated in the
  per-server list.
- **`"*"` is not supported in the global list.** The wildcard is only honoured in a
  per-server list; in `MCP_TRUSTED_TOOLS` it is treated as a literal tool name and
  matches nothing (a warning is logged at startup if you set it, except in `never` mode
  where nothing is gated anyway). To trust everything from one server use
  `MCP_TRUSTED_TOOLS_<SERVER>="*"` — which requires `MCP_APPROVAL_MODE="trusted"`, since
  the default `always` ignores trusted lists entirely; to drop approvals entirely use
  `MCP_APPROVAL_MODE="never"`.

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

## Example: Give Ducks Read Access to Files

Wire the official [`@modelcontextprotocol/server-filesystem`](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem)
through the bridge over stdio, with only its read tools on the trusted list:

```bash
# Enable the bridge; anything not trusted stops for approval
MCP_BRIDGE_ENABLED="true"
MCP_APPROVAL_MODE="trusted"

# Filesystem server over stdio. ARGS is comma-split, one argv entry per element,
# and the trailing entries are the directories the server is allowed to touch.
MCP_SERVER_FILESYSTEM_TYPE="stdio"
MCP_SERVER_FILESYSTEM_COMMAND="npx"
MCP_SERVER_FILESYSTEM_ARGS="-y,@modelcontextprotocol/server-filesystem@2026.7.10,/Users/you/projects/my-app,/Users/you/notes"
MCP_SERVER_FILESYSTEM_ENABLED="true"

# Read-only allowlist: only these run without an approval prompt
MCP_TRUSTED_TOOLS_FILESYSTEM="read_text_file,read_multiple_files,list_directory,directory_tree,search_files,get_file_info,list_allowed_directories"
```

Now a duck can read and navigate those two directories without interrupting you:

```
Ask: "Read /Users/you/projects/my-app/src/config/config.ts and summarise how env vars override the config file."
Duck: *calls read_text_file, returns a summary*
```

The seven names above are the read-only tools of `@modelcontextprotocol/server-filesystem`
version `2026.7.10`; that release also ships `read_file` (deprecated in favour of
`read_text_file`), `read_media_file`, and `list_directory_with_sizes`, which you can add if
you want them. Tool names are matched exactly, so **confirm the names your installed version
actually exposes with the `mcp_status` tool** — it lists each connected server, its tool
count, and the first three tool names.

Caveats worth knowing before you paste this in:

- **`ARGS` is split on commas and each element is trimmed.** A path containing a comma
  cannot be expressed. A *trailing* comma is worse than a typo: it produces an empty argv
  entry, which the filesystem server resolves to the working directory of the rubber-duck
  process and silently adds to the allowed directories. Use absolute paths, no trailing
  comma.
- **`MCP_SERVER_<NAME>_ENABLED` is truthy unless it is exactly `"false"`.** `"0"`, `"no"`,
  and an unset value all leave the server enabled.
- **Deleting `MCP_BRIDGE_ENABLED` does not turn the bridge off.** When the variable is
  *set*, the bridge is enabled only if the value is exactly `"true"`; when it is *unset*,
  the mere presence of any `MCP_SERVER_*` variable enables the bridge automatically — and
  the recipe above defines several. To actually disable the bridge, set
  `MCP_BRIDGE_ENABLED="false"` (or `"enabled": false` under `mcp_bridge` in `config.json`, which
  wins over the environment) rather than removing the line.
- **Server names are normalised, and the trusted-tools variable must match.** The `<NAME>`
  in `MCP_SERVER_<NAME>_*` is lowercased with underscores turned into hyphens, so
  `MCP_SERVER_FILESYSTEM_*` registers the server as `filesystem`.
  `MCP_TRUSTED_TOOLS_<NAME>` goes through the same normalisation, so the two must use the
  same spelling of `<NAME>`: `MCP_SERVER_MY_FILES_*` (server `my-files`) pairs with
  `MCP_TRUSTED_TOOLS_MY_FILES`, never with `MCP_TRUSTED_TOOLS_MYFILES`.
- **CLI ducks never get bridge tools.** Providers of `type: "cli"` are skipped when
  MCP-enhanced providers are built, and calls to them fall back to a plain chat request.
  Only HTTP/OpenAI-compatible ducks can call filesystem tools.
- **`npx` has to be on `PATH`, and the child gets a stripped environment.** The stdio child
  is spawned without a shell and with only the MCP SDK's default inherited variables —
  `HOME`, `LOGNAME`, `PATH`, `SHELL`, `TERM`, `USER` on macOS and Linux. Rubber-duck passes
  no extra `env` and no `cwd`, so none of your other variables (API keys included) reach the
  child, and it inherits rubber-duck's working directory. If rubber-duck is launched by a
  GUI app with a minimal `PATH`, give the absolute path instead, e.g.
  `MCP_SERVER_FILESYSTEM_COMMAND="/usr/local/bin/npx"`.
- **Pin the server version.** `npx -y` resolves to the latest release. Because trust is
  exact-string matching, an upstream rename or removal empties your allowlist without any
  error: the tool still exists under its new name, it just is not trusted any more, so every
  call starts prompting (or, in `never` mode, runs unguarded). A pinned version keeps the
  names stable until you choose to bump it.

### Caveat: trusted tools gate calls, not tool exposure

The trusted-tools list is an **approval filter, not a visibility filter**.

`getFunctionDefinitions()` in `src/services/function-bridge.ts` turns *every* tool of *every*
connected server into a function definition and hands the whole set to the model — there is
no trust filtering at that step. Trust is consulted only later, in `handleFunctionCall()`,
once a call has actually arrived.

So the read-only allowlist above does **not** hide `write_file`, `edit_file`, `move_file`, or
`create_directory` from the duck. The duck still sees them and can still decide to call one;
what you get is an approval prompt instead of a silent write. That prompt is the whole of the
protection.

Two ways to throw it away:

- `MCP_TRUSTED_TOOLS_FILESYSTEM="*"` trusts every tool from that server, writes included —
  no prompt at all. This is the trap: the wildcard looks like a convenience and is actually
  the entire security boundary.
- `MCP_APPROVAL_MODE="never"` skips approval for every server.

The bridge cannot work read-only-ness out for you either. The filesystem server has no
read-only flag — its arguments are just the allowed directories — and while it does annotate
its tools with `readOnlyHint`, the bridge's `MCPTool` type keeps only `serverName`, `name`,
`description`, and `inputSchema`, so annotations are discarded on the way in and cannot be
used for filtering.

A genuine read-only guarantee needs a server that has no write tools at all, plus OS-level
protection: a read-only bind mount, a dedicated user with no write permission on those paths,
or a container with the directory mounted `:ro`.

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

When using `always` mode, the system remembers your approvals — but scoped
narrowly so a one-time approval can never be replayed against a different action.

A session approval is keyed by **provider name + server + tool + a hash of the
normalized arguments**, and each approval carries a **TTL** equal to
`MCP_APPROVAL_TIMEOUT` (default 300s). It auto-approves only an *identical* later
call, and only until it expires:

1. **First time**: "Duck wants to use `search-docs` (with these arguments) - Approve?"
2. **Next time (same tool + same arguments)**: runs automatically — until the TTL expires
3. **Same tool, different arguments**: re-prompts (a new approval is required)
4. **After the TTL elapses**: re-prompts
5. **Different tool / different server**: re-prompts
6. **Different provider that happens to share a nickname**: does **not** inherit the approval — the principal is the stable provider *name*, not the display nickname
7. **Restart**: session memory clears, start over

This eliminates approval fatigue for genuinely repeated actions while ensuring a
single approval can never authorize a different tool, different arguments, or a
different provider.

> **Single-use approval IDs.** When a duck retries a call with a pre-issued
> `_approval_id`, that ID is bound to its originating call (provider + server +
> tool + arguments) and is consumed after one successful execution — it cannot be
> replayed for a different tool, different arguments, or used twice.
