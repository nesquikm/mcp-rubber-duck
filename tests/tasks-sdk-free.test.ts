import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * AC-R2JF69.8: the hand-built tasks extension is SDK-independent. No file
 * under src/ imports a task API from any @modelcontextprotocol/* package, and
 * the store declares its own TaskStatus (the five SEP-2663 statuses) and
 * isTerminal.
 */
const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const STORE = join(SRC, 'services', 'retention-task-store.ts');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|mts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** Every `import ... from '@modelcontextprotocol/...'` (and re-export) in a file. */
function mcpImports(text: string): { specifiers: string[]; source: string }[] {
  const found: { specifiers: string[]; source: string }[] = [];
  const re =
    /(?:import|export)\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"](@modelcontextprotocol\/[^'"]+)['"]/g;
  for (const match of text.matchAll(re)) {
    const clause = match[1];
    const braces = clause.match(/\{([\s\S]*)\}/);
    const names = braces
      ? braces[1]
          .split(',')
          .map((s) => s.replace(/^\s*type\s+/, '').split(/\s+as\s+/)[0].trim())
          .filter(Boolean)
      : [clause.trim()];
    found.push({ specifiers: names, source: match[2] });
  }
  return found;
}

describe('AC-R2JF69.8: tasks extension is SDK-free', () => {
  it('no src/ file imports a task API from an @modelcontextprotocol/* package', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      for (const { specifiers, source } of mcpImports(readFileSync(file, 'utf-8'))) {
        const rel = relative(ROOT, file);
        if (/task/i.test(source)) offenders.push(`${rel}: ${source}`);
        for (const name of specifiers) {
          if (/task|isTerminal/i.test(name)) offenders.push(`${rel}: ${name} from ${source}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the store declares its own TaskStatus with the five SEP-2663 statuses', () => {
    const text = readFileSync(STORE, 'utf-8');
    const decl = text.match(/export\s+type\s+TaskStatus\s*=([^;]+);/);
    const statuses = decl ? [...decl[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort() : [];
    expect(statuses).toEqual(['cancelled', 'completed', 'failed', 'input_required', 'working']);
  });

  it('the store defines isTerminal itself (not re-exported from a package)', () => {
    const text = readFileSync(STORE, 'utf-8');
    expect(/export\s+function\s+isTerminal\s*\(/.test(text)).toBe(true);
  });
});
