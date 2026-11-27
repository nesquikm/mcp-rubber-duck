/**
 * E2E project: spawns the BUILT server (dist/index.js). Builds nothing itself —
 * run `npm run build` before `npm run test:e2e`.
 * @type {import('jest').Config}
 */
import base from './jest.config.js';

export default {
  ...base,
  testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverage: false,
};
