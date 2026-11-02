import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

let cachedVersion: string | undefined;

/**
 * Version of the mcp-rubber-duck package, read from package.json.
 * Works from both src/utils (dev/tests) and dist/utils (built) — both sit two levels below the root.
 */
export function getPackageVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string; version?: string };
    cachedVersion = pkg.name === 'mcp-rubber-duck' && pkg.version ? pkg.version : '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }
  return cachedVersion;
}
