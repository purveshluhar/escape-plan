// Vite: one job beyond the defaults. The page calls POST /parse and POST /votes on its own origin, and
// Vite forwards them to the local server on 127.0.0.1 (server/proxy-guard.ts says how the checks hold). No host or
// allowedHosts setting here: Vite keeps its own loopback bind and Host check. Owner: P1.
import { defineConfig } from 'vite';
import type { Connect, ProxyOptions } from 'vite';
import { guardParseProxy, parseProxyTarget, proxyEnv } from './server/proxy-guard.ts';

const PROXIED_PATHS = ['/parse', '/votes'];

export default defineConfig(() => {
  // SERVER_HOST and SERVER_PORT only, read here in Node as the server reads them; nothing from it
  // reaches the browser (no VITE_ prefix).
  const env = proxyEnv(process.cwd(), process.env);
  // Exactly /parse and /votes (with or without a query), so the guard and the proxy cover the same
  // paths. A slow call is cut after 10 s, so it cannot hold one of the 4 places for long.
  const proxy: Record<string, ProxyOptions> = { '^/(parse|votes)(\\?.*)?$': { target: parseProxyTarget(env), changeOrigin: true, timeout: 10_000, proxyTimeout: 10_000 } };
  const guard = guardParseProxy as Connect.NextHandleFunction;
  return {
    plugins: [{
      name: 'parse-proxy-guard',
      configureServer(server) { for (const p of PROXIED_PATHS) server.middlewares.use(p, guard); },
      configurePreviewServer(server) { for (const p of PROXIED_PATHS) server.middlewares.use(p, guard); },
    }],
    server: { proxy },
    preview: { proxy },
  };
});
