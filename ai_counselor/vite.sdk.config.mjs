import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/sdk',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: 'src/sdk/index.js',
      formats: ['es'],
      fileName: () => 'ai-counselor.esm.js',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'ai-counselor.esm.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
