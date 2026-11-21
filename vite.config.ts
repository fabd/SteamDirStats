import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// The about dialog shows the same version the exe carries.
const { version } = JSON.parse(
  readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
) as { version: string };

// The Vue app lives in ui/; core/ and tools/ sit beside it in the same package,
// which keeps them inside Vite's workspace root (no server.fs.allow needed).
export default defineConfig({
  root: 'ui',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [vue(), tailwindcss()],
  // Tauri shows the Rust compiler's output in the same terminal.
  clearScreen: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./ui/src', import.meta.url)),
      '@core': fileURLToPath(new URL('./core', import.meta.url)),
      // The title bar shows the same icon the window and the exe carry.
      '@icons': fileURLToPath(new URL('./src-tauri/icons', import.meta.url)),
    },
  },
  server: {
    // tauri.conf.json points the window at this exact URL, so fail rather
    // than silently moving to another port.
    port: 5173,
    strictPort: true,
  },
});
