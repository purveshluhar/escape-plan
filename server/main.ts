// Starts the local server: `npm run server`. Node reads the git-ignored .env, if there is one,
// through --env-file-if-exists; shell variables win over .env. Owner: P1.
import type { AddressInfo } from 'node:net';
import { readConfig, startServer } from './http.ts';

try {
  const config = readConfig(process.env);
  const server = await startServer(config);
  const { address, port } = server.address() as AddressInfo;
  console.log(`escape-plan server on http://${address}:${port} (DECIDER=${config.decider})`);
} catch (e) {
  console.error(`server not started: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
