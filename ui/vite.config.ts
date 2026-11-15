import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // Relative asset URLs: pywebview loads ui/dist/index.html over file://,
  // where absolute paths like /assets/app.js resolve to the drive root.
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // `python app.py --dev` points the window at this exact URL, so fail
    // rather than silently moving to another port.
    port: 5173,
    strictPort: true,
  },
});
