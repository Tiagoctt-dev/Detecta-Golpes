import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Gera um único index.html com tudo embutido: abre por link, por pendrive ou sem internet.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
});
