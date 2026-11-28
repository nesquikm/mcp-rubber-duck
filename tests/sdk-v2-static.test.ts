import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * FR K1F5Q5 (SDK v2 port): checks on package metadata and source text that need
 * no running server. Runtime behaviour lives in tests/mcp-v2-surface.test.ts,
 * tests/server-factory-once.test.ts, tests/services/mcp-client-manager-v2.test.ts
 * and the e2e project under tests/e2e/.
 */
const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
};
const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|mts|js|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

describe('AC-K1F5Q5.1: package.json dependencies', () => {
  it('declares no @modelcontextprotocol/sdk dependency', () => {
    expect(Object.keys(allDeps)).not.toContain('@modelcontextprotocol/sdk');
  });

  it('declares @modelcontextprotocol/server at ~2.4.0', () => {
    expect(pkg.dependencies?.['@modelcontextprotocol/server']).toBe('~2.4.0');
  });

  it('declares @modelcontextprotocol/client at ~2.4.0', () => {
    expect(pkg.dependencies?.['@modelcontextprotocol/client']).toBe('~2.4.0');
  });

  it('declares @modelcontextprotocol/ext-apps at ^2.0.4', () => {
    expect(pkg.dependencies?.['@modelcontextprotocol/ext-apps']).toBe('^2.0.4');
  });

  it('declares engines.node >=20', () => {
    expect(pkg.engines).toEqual({ node: '>=20' });
  });

  it('npm ls resolves @modelcontextprotocol/core to exactly one version', () => {
    let raw: string;
    try {
      raw = execFileSync('npm', ['ls', '@modelcontextprotocol/core', '--all', '--json'], {
        cwd: ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      // npm ls exits non-zero on an invalid tree but still prints the JSON.
      raw = (error as { stdout?: string }).stdout ?? '{}';
    }
    const versions = new Set<string>();
    const walk = (node: { dependencies?: Record<string, { version?: string }> }) => {
      for (const [name, child] of Object.entries(node.dependencies ?? {})) {
        if (name === '@modelcontextprotocol/core' && child.version) versions.add(child.version);
        walk(child as typeof node);
      }
    };
    walk(JSON.parse(raw));
    expect([...versions]).toHaveLength(1);
  });

  it('installs ext-apps 2.x', () => {
    const extApps = JSON.parse(
      readFileSync(
        join(ROOT, 'node_modules', '@modelcontextprotocol', 'ext-apps', 'package.json'),
        'utf-8'
      )
    ) as { version: string };
    expect(extApps.version).toMatch(/^2\./);
  });
});

describe('AC-K1F5Q5.5: no MCP logging surface in source', () => {
  const offenders = (pattern: RegExp) =>
    sourceFiles(join(ROOT, 'src'))
      .filter((file) => pattern.test(readFileSync(file, 'utf-8')))
      .map((file) => file.slice(ROOT.length + 1));

  it('no source file calls sendLoggingMessage', () => {
    expect(offenders(/\bsendLoggingMessage\s*\(/)).toEqual([]);
  });

  it('no source file calls ctx.mcpReq.log', () => {
    expect(offenders(/\bmcpReq\s*\.\s*log\s*\(/)).toEqual([]);
  });

  it('no source file imports the removed v1 SDK', () => {
    expect(offenders(/from\s+['"]@modelcontextprotocol\/sdk[/'"]/)).toEqual([]);
  });
});

describe('AC-K1F5Q5.7: MCPClientManager imports only from @modelcontextprotocol/client', () => {
  const source = readFileSync(join(ROOT, 'src', 'services', 'mcp-client-manager.ts'), 'utf-8');
  const mcpImports = [...source.matchAll(/from\s+['"](@modelcontextprotocol\/[^'"]+)['"]/g)].map(
    (m) => m[1]
  );

  it('imports at least the client package', () => {
    expect(mcpImports).toContain('@modelcontextprotocol/client');
  });

  it('every @modelcontextprotocol import is the client package or its subpath', () => {
    expect(mcpImports.filter((spec) => !/^@modelcontextprotocol\/client(\/|$)/.test(spec))).toEqual(
      []
    );
  });
});

describe('AC-K1F5Q5.9: npm run test:e2e', () => {
  it('defines a test:e2e script', () => {
    expect(typeof pkg.scripts?.['test:e2e']).toBe('string');
  });

  it('test:e2e builds nothing itself', () => {
    const script = pkg.scripts?.['test:e2e'] ?? '<missing>';
    expect(script).toMatch(/jest/);
    expect(script).not.toMatch(/\b(build|tsc|vite)\b/);
  });

  it('the default jest project (npm test) does not pick up tests/e2e', () => {
    const listed = execFileSync(join(ROOT, 'node_modules', '.bin', 'jest'), ['--listTests'], {
      cwd: ROOT,
      encoding: 'utf-8',
      env: { ...process.env, NODE_OPTIONS: '--experimental-vm-modules' },
    })
      .split('\n')
      .filter(Boolean);
    // Precondition: the listing is real (this very file is in it).
    expect(listed.some((p) => p.endsWith('sdk-v2-static.test.ts'))).toBe(true);
    expect(listed.filter((p) => p.includes(`${join('tests', 'e2e')}`))).toEqual([]);
  });

  it('the e2e project lists the tests/e2e suites', () => {
    const script = pkg.scripts?.['test:e2e'] ?? '';
    expect(script).toMatch(/\bjest\b/);
    // Re-run the script's own jest arguments with --listTests appended.
    const jestArgs =
      script
        .split(/\bjest\b/)[1]
        ?.trim()
        .split(/\s+/)
        .filter(Boolean) ?? [];
    const listed = execFileSync(
      join(ROOT, 'node_modules', '.bin', 'jest'),
      [...jestArgs, '--listTests'],
      {
        cwd: ROOT,
        encoding: 'utf-8',
        env: { ...process.env, NODE_OPTIONS: '--experimental-vm-modules' },
      }
    )
      .split('\n')
      .filter(Boolean);
    expect(listed.some((p) => p.includes(join('tests', 'e2e')))).toBe(true);
  });
});

describe('AC-K1F5Q5.10: views subscribe via addEventListener("toolresult")', () => {
  const VIEWS = ['compare-ducks', 'duck-vote', 'duck-debate', 'usage-stats'];

  it.each(VIEWS)('%s/app.ts uses addEventListener("toolresult", …)', (view) => {
    const source = readFileSync(join(ROOT, 'src', 'ui', view, 'app.ts'), 'utf-8');
    expect(source).toMatch(/\.addEventListener\(\s*['"`]toolresult['"`]\s*,/);
  });

  it.each(VIEWS)('%s/app.ts no longer assigns the deprecated ontoolresult setter', (view) => {
    const source = readFileSync(join(ROOT, 'src', 'ui', view, 'app.ts'), 'utf-8');
    expect(source).not.toMatch(/\.ontoolresult\s*=/);
  });
});
