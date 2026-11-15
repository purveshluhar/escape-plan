// The local server (ADR 0008): POST /parse (JevParseRequest in, JevParse out) and POST /votes
// (a list of JevVoteRequest in, one JevVote each out). Listens on 127.0.0.1 only. Owner: P1. Node only; browser code never imports this file.
//
// Who may call: the game page on this machine. Loopback is the boundary, so there is no login.
// The Host check stops DNS rebinding, and the Origin list stops other web pages from posting.
// Every body is size-capped and checked against contract/schema/jev.schema.json.
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { JevParseRequest, JevVoteRequest } from '../contract/types.ts';
import { validate } from '../contract/validate.ts';
import { deciderFromEnv, parse } from './parse.ts';
import type { DeciderConfig, DeciderName } from './parse.ts';
import { strandsConfigFromEnv } from './strands.ts';
import type { StrandsConfig } from './strands.ts';
import { MAX_VOTE_REQUESTS, vote } from './votes.ts';

export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 8787;
export const MAX_BODY_BYTES = 64 * 1024; // 255 targets with plain names fit in well under this
export const MAX_TEXT_CHARS = 1000;
const MAX_DRAIN_BYTES = 1024 * 1024; // after a 413, read at most this much more, then cut the socket

// The game page: Vite dev (5173) and vite preview (4173), under either loopback name.
export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  ['localhost', '127.0.0.1'].flatMap((h) => [5173, 4173].map((p) => `http://${h}:${p}`)),
);

export interface ServerConfig {
  port: number;
  decider: DeciderName;
  strands: StrandsConfig;
}

// Reads SERVER_HOST, SERVER_PORT, DECIDER, STRANDS_URL and STRANDS_TIMEOUT_MS (from .env through
// `npm run server`, or the shell). STRANDS_* are checked whatever DECIDER is, so a typo shows at start.
// Not HOST and PORT: shells and tools export those for other reasons. An empty value means
// "not set". A SERVER_HOST other than 127.0.0.1 is refused, never widened.
export function readConfig(env: Record<string, string | undefined>): ServerConfig {
  const host = env.SERVER_HOST ?? '';
  if (host !== '' && host !== HOST) {
    throw new Error(`SERVER_HOST=${JSON.stringify(host)} refused: this server listens on ${HOST} only (ADR 0008). Remove SERVER_HOST or set it to ${HOST}.`);
  }
  const rawPort = env.SERVER_PORT ?? '';
  let port = DEFAULT_PORT;
  if (rawPort !== '') {
    if (!/^\d{1,5}$/.test(rawPort) || Number(rawPort) > 65535) {
      throw new Error(`SERVER_PORT=${JSON.stringify(rawPort)} refused: use a whole number from 0 to 65535.`);
    }
    port = Number(rawPort);
  }
  return { port, decider: deciderFromEnv(env.DECIDER), strands: strandsConfigFromEnv(env) };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

const fail = (res: ServerResponse, status: number, error: string, details: string[] = []) => send(res, status, { error, details });

// Checks the schema cannot express. keywordParse needs one op and one target to choose from.
function requestProblems(r: JevParseRequest): string[] {
  const out: string[] = [];
  if (r.text.length > MAX_TEXT_CHARS) out.push(`$.text: at most ${MAX_TEXT_CHARS} characters`);
  if (r.ops.length === 0) out.push('$.ops: needs at least 1 item');
  if (r.targets.length === 0) out.push('$.targets: needs at least 1 item');
  if (new Set(r.targets.map((t) => t.id)).size !== r.targets.length) out.push('$.targets: ids must be unique');
  if (r.value_range.min > r.value_range.max) out.push('$.value_range: min must be <= max');
  return out;
}

// Checks for POST /votes that the item schema cannot express: one vote per discipline, about one
// token each, all after the same edit.
const sameEdit = (a: JevVoteRequest, b: JevVoteRequest): boolean =>
  a.edit.op === b.edit.op && a.edit.target === b.edit.target && a.edit.value === b.edit.value && a.edit.source === b.edit.source;
function voteProblems(list: JevVoteRequest[]): string[] {
  const out: string[] = [];
  if (new Set(list.map((r) => r.discipline)).size !== list.length) out.push('$: one request per discipline');
  list.forEach((r, i) => {
    if (r.before.token !== r.after.token) out.push(`$[${i}]: before and after must be about the same token`);
    if (!sameEdit(r, list[0]!)) out.push(`$[${i}].edit: every request must be about the same edit`);
  });
  return out;
}

// The body as text, or null when it passed MAX_BODY_BYTES.
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (over) {
        if (size > MAX_BODY_BYTES + MAX_DRAIN_BYTES) req.destroy();
        return;
      }
      if (size > MAX_BODY_BYTES) {
        over = true;
        chunks.length = 0;
        resolve(null);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!over) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, decider: DeciderConfig, port: number): Promise<void> {
  const host = req.headers.host;
  if (host !== `${HOST}:${port}` && host !== `localhost:${port}`) return fail(res, 403, 'host not allowed');
  const origin = req.headers.origin;
  res.setHeader('vary', 'Origin');
  if (origin !== undefined) {
    if (!ALLOWED_ORIGINS.has(origin)) return fail(res, 403, 'origin not allowed');
    res.setHeader('access-control-allow-origin', origin);
  }
  const path = (req.url ?? '').split('?')[0];
  if (path !== '/parse' && path !== '/votes') return fail(res, 404, 'not found');
  const shape = path === '/parse' ? 'a JevParseRequest' : 'a list of JevVoteRequest';
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-methods': 'POST',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
    });
    return void res.end();
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST, OPTIONS');
    return fail(res, 405, 'use POST');
  }
  const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/json') return fail(res, 415, 'content-type must be application/json');
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_BODY_BYTES) {
    res.setHeader('connection', 'close');
    return fail(res, 413, `body over ${MAX_BODY_BYTES} bytes`);
  }
  const text = await readBody(req);
  if (text === null) {
    res.setHeader('connection', 'close');
    return fail(res, 413, `body over ${MAX_BODY_BYTES} bytes`);
  }
  let data: unknown;
  // Inherited key names ("__proto__", "constructor", "toString") are refused here, before the
  // schema check. This guard stays even where contract/validate.ts also refuses them.
  const inherited: string[] = [];
  try {
    data = JSON.parse(text, (key: string, value: unknown) => {
      if (key in Object.prototype) inherited.push(key);
      return value;
    });
  } catch {
    return fail(res, 400, 'body is not JSON');
  }
  if (inherited.length > 0) {
    return fail(res, 400, `body is not ${shape}`, inherited.map((k) => `field ${JSON.stringify(k)} is not allowed`));
  }
  if (path === '/votes') return answerVotes(res, data, decider);
  const schemaErrors = validate('jev.schema.json#/$defs/parse_request', data);
  if (schemaErrors.length > 0) return fail(res, 400, 'body is not a JevParseRequest', schemaErrors);
  const request = data as JevParseRequest;
  const problems = requestProblems(request);
  if (problems.length > 0) return fail(res, 400, 'body is not a usable JevParseRequest', problems);
  const answer = await parse(request, decider);
  // Fail closed: never hand the app a shape the contract does not allow.
  const answerErrors = validate('jev.schema.json#/$defs/parse', answer);
  if (answerErrors.length > 0) {
    console.error('parse() broke the JevParse schema:', answerErrors);
    return fail(res, 500, 'internal error');
  }
  res.setHeader('x-decider', decider.decider); // so a timing log shows which parser answered
  send(res, 200, answer);
}

async function answerVotes(res: ServerResponse, data: unknown, decider: DeciderConfig): Promise<void> {
  if (!Array.isArray(data) || data.length === 0 || data.length > MAX_VOTE_REQUESTS) {
    return fail(res, 400, 'body is not a list of JevVoteRequest', [`$: a list of 1 to ${MAX_VOTE_REQUESTS} requests`]);
  }
  const schemaErrors = data.flatMap((item, i) =>
    validate('jev.schema.json#/$defs/vote_request', item).map((e) => e.replace(/^\$/, `$[${i}]`)));
  if (schemaErrors.length > 0) return fail(res, 400, 'body is not a list of JevVoteRequest', schemaErrors);
  const list = data as JevVoteRequest[];
  const problems = voteProblems(list);
  if (problems.length > 0) return fail(res, 400, 'body is not a usable list of JevVoteRequest', problems);
  const { votes, voter } = await vote(list, decider);
  // Fail closed: one schema-valid JevVote per request, about the token and discipline asked.
  const broken = votes.length !== list.length || votes.some((v, i) => validate('jev.schema.json#/$defs/vote', v).length > 0
    || v.token !== list[i]!.after.token || v.discipline !== list[i]!.discipline);
  if (broken) {
    console.error('vote() broke the JevVote schema or order');
    return fail(res, 500, 'internal error');
  }
  res.setHeader('x-decider', decider.decider);
  res.setHeader('x-voter', voter); // who voted: the model, or the rules when no model answered
  send(res, 200, votes);
}

export function createParseServer(decider: DeciderConfig): Server {
  // A slow sender is cut after about 10 s: Node checks the timeouts every second, not every 30 s.
  const server = createServer({ requestTimeout: 10_000, headersTimeout: 5_000, connectionsCheckingInterval: 1_000 }, (req, res) => {
    const { port } = server.address() as AddressInfo;
    handle(req, res, decider, port).catch((e: unknown) => {
      // A client that hangs up mid-body is normal: one line, no stack.
      console.error(`request failed: ${e instanceof Error ? e.message : String(e)}`);
      if (!res.headersSent && !res.destroyed) fail(res, 500, 'internal error');
      else res.destroy();
    });
  });
  server.maxConnections = 64; // one game page needs a few; this stops a local flood
  return server;
}

// Binds to the HOST constant, never to a value from config, so loopback-only holds by construction.
export function startServer(config: ServerConfig): Promise<Server> {
  const server = createParseServer(config);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, HOST, () => {
      server.off('error', reject);
      server.on('error', (e) => console.error(`server error: ${e.message}`));
      resolve(server);
    });
  });
}
