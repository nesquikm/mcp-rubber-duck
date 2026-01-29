import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(currentDir, '..', 'dist', 'ui');

const UI_ENTRIES = [
  'compare-ducks',
  'duck-vote',
  'duck-debate',
  'usage-stats',
];

describe('UI build output', () => {
  for (const entry of UI_ENTRIES) {
    describe(entry, () => {
      const htmlPath = join(UI_DIR, entry, 'mcp-app.html');

      it(`should have built ${entry}/mcp-app.html`, () => {
        expect(existsSync(htmlPath)).toBe(true);
      });

      it('should be a valid single-file HTML bundle', () => {
        if (!existsSync(htmlPath)) return;

        const html = readFileSync(htmlPath, 'utf-8');

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
        if (!existsSync(htmlPath)) return;

        const html = readFileSync(htmlPath, 'utf-8');

        // The bundled JS should contain App class instantiation
        // (from @modelcontextprotocol/ext-apps)
        expect(html).toContain('ontoolresult');
      });
    });
  }
});
