import { startSellerFromEnvironment } from './server.js';

const runtime = await startSellerFromEnvironment();
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
process.stdout.write(`OneShot Circle seller listening at ${runtime.address}\n`);
