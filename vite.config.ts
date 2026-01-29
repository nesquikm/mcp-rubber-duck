import { resolve } from 'path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build a single entry at a time. The build:ui script iterates over entries.
// Entry name is passed via VITE_UI_ENTRY env var.
const entry = process.env.VITE_UI_ENTRY || 'compare-ducks';

export default defineConfig({
  root: resolve(__dirname, `src/ui/${entry}`),
  plugins: [viteSingleFile()],
  build: {
    rollupOptions: {
      input: resolve(__dirname, `src/ui/${entry}/mcp-app.html`),
    },
    outDir: resolve(__dirname, `dist/ui/${entry}`),
    emptyOutDir: true,
  },
});
