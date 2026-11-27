# MCP surface fixture (v1.20.15)

Captured from the unmodified v1.20.15 tree (`@modelcontextprotocol/sdk` 1.32.1) before the
SDK v2 port, as the AC-K1F5Q5.3 / AC-K1F5Q5.4 baseline. Environment at capture time:
`OPENAI_API_KEY=test-key` only (no other provider keys, no config file), so every
provider enum is `["openai"]`. `bridge-on` adds `MCP_BRIDGE_ENABLED=true`.

Lists are sorted by `name` (tools, prompts) or `uri` (resources). Do not regenerate
these from a post-port tree: they are the reference the v2 surface is compared against.
