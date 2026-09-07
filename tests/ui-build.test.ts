import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(currentDir, '..');
const UI_DIR = join(ROOT, 'dist', 'ui');
const UI_SRC_DIR = join(ROOT, 'src', 'ui');
const VITE_CONFIG = join(ROOT, 'vite.config.ts');

const UI_ENTRIES = [
  'compare-ducks',
  'duck-vote',
  'duck-debate',
  'usage-stats',
];

const BUILD_FIX = [
  'Fix: run `npm run build` before the test suite.',
  'CI order is npm ci -> npm run build -> npm test (.github/workflows/security.yml).',
].join('\n');

// Files a single entry's bundle is built from: its own directory, the shared
// assets every entry imports (src/ui/shared/base.css), and the Vite config
// that drives the build.
function sourceFilesFor(entry: string): string[] {
  const files: string[] = [];

  for (const dir of [join(UI_SRC_DIR, entry), join(UI_SRC_DIR, 'shared')]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isFile()) files.push(path);
    }
  }

  if (existsSync(VITE_CONFIG)) files.push(VITE_CONFIG);
  return files;
}

function newestSource(entry: string): { file: string; mtimeMs: number } {
  return sourceFilesFor(entry).reduce(
    (newest, file) => {
      const { mtimeMs } = statSync(file);
      return mtimeMs > newest.mtimeMs ? { file, mtimeMs } : newest;
    },
    { file: '(no source files found)', mtimeMs: 0 }
  );
}

// dist/ is gitignored, so a fresh checkout has no build output. Throw a named
// error rather than letting the assertions below pass against nothing.
function requireArtifact(entry: string): string {
  const htmlPath = join(UI_DIR, entry, 'mcp-app.html');

  if (!existsSync(htmlPath)) {
    throw new Error(
      [
        `Missing UI build output: ${relative(ROOT, htmlPath)}`,
        '',
        'dist/ is gitignored, so a fresh checkout has no build output and every',
        'assertion in this file would otherwise pass vacuously.',
        '',
        BUILD_FIX,
      ].join('\n')
    );
  }

  return htmlPath;
}

describe('UI build output', () => {
  for (const entry of UI_ENTRIES) {
    describe(entry, () => {
      it(`should have built ${entry}/mcp-app.html`, () => {
        expect(existsSync(requireArtifact(entry))).toBe(true);
      });

      it('should not predate any source it is built from', () => {
        const htmlPath = requireArtifact(entry);
        const builtMs = statSync(htmlPath).mtimeMs;
        const newest = newestSource(entry);

        // Compare the artifact against its own sources, never against the
        // wall clock, so the check is order-dependent but not time-dependent.
        // >= keeps a same-second build from reading as stale.
        if (builtMs < newest.mtimeMs) {
          throw new Error(
            [
              `Stale UI build output: ${relative(ROOT, htmlPath)}`,
              `  bundle built: ${new Date(builtMs).toISOString()}`,
              `  newer source: ${new Date(newest.mtimeMs).toISOString()} (${relative(ROOT, newest.file)})`,
              '',
              'The bundle predates a source file it derives from, so the assertions',
              'below would be checking a previous build rather than the current tree.',
              '',
              BUILD_FIX,
            ].join('\n')
          );
        }

        expect(builtMs).toBeGreaterThanOrEqual(newest.mtimeMs);
      });

      it('should be a valid single-file HTML bundle', () => {
        const html = readFileSync(requireArtifact(entry), 'utf-8');

        // Must be valid HTML
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html');
        expect(html).toContain('</html>');

        // Must contain inlined script (no external src references for JS)
        expect(html).toContain('<script');

        // Must NOT have external script references (single-file)
        expect(html).not.toMatch(/<script[^>]+src="[^"]+\.js"/);
      });

      it('should contain ext-apps App class usage', () => {
        const html = readFileSync(requireArtifact(entry), 'utf-8');

        // The bundled JS should contain App class instantiation
        // (from @modelcontextprotocol/ext-apps)
        expect(html).toContain('ontoolresult');
      });
    });
  }
});
