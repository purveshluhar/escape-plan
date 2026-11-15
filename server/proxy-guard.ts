// The Vite proxy in front of POST /parse (root vite.config.ts). Node only. Owner: P1.
//
// The page calls /parse on its own origin, so it works on localhost and through a tunnel, where
// the browser cannot reach 127.0.0.1:8787. Vite forwards the call with Host set to the server's own
// (changeOrigin), so the server's Host check (DNS rebinding) holds unchanged.
// The server's Origin list stops other web pages. A tunnel origin is not on it, so the proxy does
// that job: it lets a call through only when the browser marks it same-origin (Sec-Fetch-Site,
// which a page cannot set), then drops Origin. Vite's own Host check and CORS run before this.
// Any other call with an Origin gets 403 here; the server never sees it.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HOST, readConfig } from './http.ts';

// Where the proxy sends /parse: always 127.0.0.1, at SERVER_PORT (default 8787). The same rules
// as the server: a SERVER_HOST other than 127.0.0.1 or a bad port stops Vite at start.
export function parseProxyTarget(env: Record<string, string | undefined>): string {
  const { port } = readConfig({ SERVER_HOST: env.SERVER_HOST, SERVER_PORT: env.SERVER_PORT });
  return `http://${HOST}:${port}`;
}

export function guardParseProxy(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (req.headers.origin !== undefined) {
    if (req.headers['sec-fetch-site'] !== 'same-origin') {
      res.statusCode = 403;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify({ error: 'origin not allowed', details: ['only this page may call /parse'] }));
      return;
    }
    delete req.headers.origin;
  }
  next();
}
