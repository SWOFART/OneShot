import { startWorkerFromEnvironment } from './runtime.js';

const runtime = await startWorkerFromEnvironment();
let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await runtime.close();
}

function requestShutdown(): void {
  void shutdown().catch(() => {
    process.exitCode = 1;
  });
}

process.once('SIGTERM', requestShutdown);
process.once('SIGINT', requestShutdown);
process.stdout.write(`OneShot worker health server listening at ${runtime.address}\n`);
