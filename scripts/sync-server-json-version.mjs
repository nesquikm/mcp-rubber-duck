#!/usr/bin/env node
// Keeps server.json's versions equal to package.json's. Runs as the npm
// "version" lifecycle script, so semantic-release's `npm version` bump
// carries into server.json (committed via @semantic-release/git assets).
import { readFileSync, writeFileSync } from 'fs';

const { name, version } = JSON.parse(readFileSync('package.json', 'utf-8'));
const raw = readFileSync('server.json', 'utf-8');
const server = JSON.parse(raw);

server.version = version;
for (const pkg of server.packages ?? []) {
  if (pkg.registryType === 'npm' && pkg.identifier === name) pkg.version = version;
}

writeFileSync('server.json', JSON.stringify(server, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
