import type { WorkerOptions } from './types.js';
import { drainOutboxJobs, runStartupRecovery } from './worker.js';

export interface RestartRunnerOptions {
  readonly workerOptions: WorkerOptions;
  readonly leaseExpiryIntervalMs?: number;
  readonly maxJobsPerCycle?: number;
}

export class RestartRunner {
  readonly #options: WorkerOptions;
  readonly #leaseIntervalMs: number;
  readonly #maxJobs: number;
  #running = false;
  #sweepTimer?: ReturnType<typeof setInterval> | undefined;

  constructor(options: RestartRunnerOptions) {
    this.#options = options.workerOptions;
    this.#leaseIntervalMs = options.leaseExpiryIntervalMs ?? 10_000;
    this.#maxJobs = options.maxJobsPerCycle ?? 50;
  }

  get isRunning(): boolean {
    return this.#running;
  }

  async start(): Promise<{ readonly startupRecovered: number }> {
    this.#running = true;
    // Step 1: Run startup recovery on boot to heal any orphaned SUBMITTING records
    const startupRecovered = await runStartupRecovery(this.#options);

    // Step 2: Set up periodic lease expiry sweep and outbox draining
    this.#sweepTimer = setInterval(() => {
      if (!this.#running) return;
      void runStartupRecovery(this.#options).catch(() => {});
      void drainOutboxJobs(this.#options, this.#maxJobs).catch(() => {});
    }, this.#leaseIntervalMs);

    return { startupRecovered };
  }

  async stop(): Promise<void> {
    this.#running = false;
    if (this.#sweepTimer) {
      clearInterval(this.#sweepTimer);
      this.#sweepTimer = undefined;
    }
  }
}
