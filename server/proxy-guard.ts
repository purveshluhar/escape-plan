// The Vite proxy in front of POST /parse (root vite.config.ts). Node only. Owner: P1.
//
// The page calls /parse on its own origin, so it works on localhost and through a tunnel, where
// the browser cannot reach 127.0.0.1:8787. Vite forwards the call with Host set to the server's own
// (changeOrigin), so the server's Host check (DNS rebinding) holds unchanged.
// The server's Origin list stops other web pages. A tunnel origin is not on it, so the proxy does
// that job: it lets a call through only when the browser marks it same-origin (Sec-Fetch-Site,
// which a web page cannot set), then drops Origin. Every other call gets 403 here, including one
// with no browser headers at all (curl), so the proxy serves the page and nothing else; the server
// never sees the rest. Vite's own Host check and CORS run before this.
// This is not authentication: a program that can reach Vite can send any header. Who can reach
// Vite is the gate (127.0.0.1, or a tunnel's own sign-in). See server/README.md.
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { HOST, readConfig } from './http.ts';

// The page sends one sentence at a time; a few at once allows a second tab. More get 429.
export const PROXY_MAX_IN_FLIGHT = 4;
let inFlight = 0;

// SERVER_* as `npm run server` reads them: `.env` in `dir`, then the shell, which wins
// (node --env-file-if-exists). Not .env.local or .env.<mode>: the server never reads those.
export function proxyEnv(dir: string, shell: Record<string, string | undefined>): Record<string, string | undefined> {
  const file = join(dir, '.env');
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  return { SERVER_HOST: shell.SERVER_HOST ?? fromFile.SERVER_HOST, SERVER_PORT: shell.SERVER_PORT ?? fromFile.SERVER_PORT };
}

// Where the proxy sends /parse: always 127.0.0.1, at SERVER_PORT (default 8787). The same rules
// as the server: a SERVER_HOST other than 127.0.0.1 or a bad port stops Vite at start.
export function parseProxyTarget(env: Record<string, string | undefined>): string {
  const { port } = readConfig({ SERVER_HOST: env.SERVER_HOST, SERVER_PORT: env.SERVER_PORT });
  return `http://${HOST}:${port}`;
}

function refuse(res: ServerResponse, status: number, error: string, detail: string): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({ error, details: [detail] }));
}

// This machine only. With `vite --host`, Vite takes calls from the network; they never reach the
// server. A tunnel client runs on this machine, so it connects from loopback.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function guardParseProxy(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (!LOOPBACK.has(req.socket?.remoteAddress ?? '')) return refuse(res, 403, 'not this machine', 'only this machine may call /parse');
  if (req.headers['sec-fetch-site'] !== 'same-origin') return refuse(res, 403, 'origin not allowed', 'only this page may call /parse');
  if (inFlight >= PROXY_MAX_IN_FLIGHT) return refuse(res, 429, 'too many calls', `at most ${PROXY_MAX_IN_FLIGHT} at once`);
  inFlight++;
  res.once('close', () => { inFlight--; });
  delete req.headers.origin;
  next();
}
