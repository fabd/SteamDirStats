import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import svgLoader from 'vite-svg-loader';

// The about dialog shows the same version the exe carries.
const { version } = JSON.parse(
  readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
) as { version: string };

// The Vue app lives in ui/; core/ and tools/ sit beside it in the same package,
// which keeps them inside Vite's workspace root (no server.fs.allow needed).
export default defineConfig({
  root: 'ui',
  define: { __APP_VERSION__: JSON.stringify(version) },
  // `import Icon from '...svg?component'` gives an inline <svg> Vue component,
  // so icons take their colour from CSS. SVGO is off: the files are already
  // minimal, and its defaults can strip the viewBox the CSS sizing relies on.
  plugins: [vue(), tailwindcss(), svgLoader({ svgo: false, defaultImport: 'url' })],
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
