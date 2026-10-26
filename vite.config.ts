import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import packageInfo from './package.json';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), {name: 'version-manifest', configureServer(server) {server.middlewares.use((req, res, next) => {if (req.url?.split('?')[0] !== '/version.json') return next(); res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify({version: packageInfo.version}));});}, generateBundle() {this.emitFile({type: 'asset', fileName: 'version.json', source: JSON.stringify({version: packageInfo.version})+'\n'});}}],
  server: { allowedHosts: ['terminal.local'] },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
