import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * AC-R2JF6A.10: the Dockerfile describes opt-in HTTP mode, and server.json
 * carries the released version (kept equal to package.json's version, which
 * semantic-release bumps on release).
 */
const ROOT = process.cwd();
const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf-8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { version: string };
const serverJson = JSON.parse(readFileSync(join(ROOT, 'server.json'), 'utf-8')) as {
  version?: string;
  packages?: { identifier?: string; version?: string }[];
};

/** The comment block (consecutive `#` lines) directly above the EXPOSE instruction. */
function commentAboveExpose(): string {
  const lines = dockerfile.split('\n');
  const at = lines.findIndex((line) => /^\s*EXPOSE\b/.test(line));
  const comments: string[] = [];
  for (let i = at - 1; i >= 0 && /^\s*#/.test(lines[i]); i--) comments.unshift(lines[i]);
  return comments.join('\n');
}

describe('AC-R2JF6A.10: Dockerfile describes opt-in HTTP mode', () => {
  it('EXPOSEs the default HTTP port 3000', () => {
    expect(dockerfile).toMatch(/^\s*EXPOSE\s+3000\b/m);
  });

  it('the comment above EXPOSE no longer claims the port is stdio', () => {
    expect(commentAboveExpose()).not.toMatch(/expose\s+stdio/i);
  });

  it('the comment above EXPOSE names MCP_TRANSPORT=http as the opt-in', () => {
    expect(commentAboveExpose()).toMatch(/MCP_TRANSPORT=http/);
  });

  it('the Dockerfile comments state that MCP_HTTP_TOKEN is required for the container bind', () => {
    const comments = dockerfile
      .split('\n')
      .filter((line) => /^\s*#/.test(line))
      .join('\n');
    expect(comments).toMatch(/MCP_HTTP_TOKEN/);
  });
});

describe('AC-R2JF6A.10: server.json carries the released version', () => {
  it('top-level version equals package.json version', () => {
    expect(serverJson.version).toBe(pkg.version);
  });

  it('the npm package entry version equals package.json version', () => {
    const npm = serverJson.packages?.find((p) => p.identifier === 'mcp-rubber-duck');
    expect(npm?.version).toBe(pkg.version);
  });
});
