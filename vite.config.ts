// Vite: one job beyond the defaults. The page calls POST /parse on its own origin, and Vite forwards
// it to the local server on 127.0.0.1 (server/proxy-guard.ts says how the checks hold). No host or
// allowedHosts setting here: Vite keeps its own loopback bind and Host check. Owner: P1.
import { defineConfig, loadEnv } from 'vite';
import type { Connect, ProxyOptions } from 'vite';
import { guardParseProxy, parseProxyTarget } from './server/proxy-guard.ts';

export default defineConfig(({ mode }) => {
  // SERVER_* only, read here in Node; nothing from it reaches the browser (no VITE_ prefix).
  const env = loadEnv(mode, process.cwd(), 'SERVER_');
  const proxy: Record<string, ProxyOptions> = { '/parse': { target: parseProxyTarget(env), changeOrigin: true } };
  const guard = guardParseProxy as Connect.NextHandleFunction;
  return {
    plugins: [{
      name: 'parse-proxy-guard',
      configureServer(server) { server.middlewares.use('/parse', guard); },
      configurePreviewServer(server) { server.middlewares.use('/parse', guard); },
    }],
    server: { proxy },
    preview: { proxy },
  };
});
