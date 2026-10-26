import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // Only src/ and public/ are browser content; backend .env stays server-side.
  envPrefix: 'VITE_PUBLIC_',
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        controller: fileURLToPath(new URL('./controller.html', import.meta.url)),
      },
    },
  },
});
