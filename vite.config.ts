// Vite: one job beyond the defaults. The page calls POST /parse on its own origin, and Vite forwards
// it to the local server on 127.0.0.1 (server/proxy-guard.ts says how the checks hold). No host or
// allowedHosts setting here: Vite keeps its own loopback bind and Host check. Owner: P1.
import { defineConfig } from 'vite';
import type { Connect, ProxyOptions } from 'vite';
import { guardParseProxy, parseProxyTarget, proxyEnv } from './server/proxy-guard.ts';

export default defineConfig(() => {
  // SERVER_HOST and SERVER_PORT only, read here in Node as the server reads them; nothing from it
  // reaches the browser (no VITE_ prefix).
  const env = proxyEnv(process.cwd(), process.env);
  // Exactly /parse (with or without a query), so the guard and the proxy cover the same paths.
  // A slow call is cut after 10 s, so it cannot hold one of the 4 places for long.
  const proxy: Record<string, ProxyOptions> = { '^/parse(\\?.*)?$': { target: parseProxyTarget(env), changeOrigin: true, timeout: 10_000, proxyTimeout: 10_000 } };
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
