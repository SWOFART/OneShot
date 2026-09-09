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
  #cycle?: Promise<void> | undefined;
  #lastError?: string | undefined;
  #lastSuccessfulCycleAt?: string | undefined;
  #sweepTimer?: ReturnType<typeof setInterval> | undefined;

  constructor(options: RestartRunnerOptions) {
    this.#options = options.workerOptions;
    this.#leaseIntervalMs = options.leaseExpiryIntervalMs ?? 10_000;
    this.#maxJobs = options.maxJobsPerCycle ?? 50;
  }

  get isRunning(): boolean {
    return this.#running;
  }

  get status(): {
    readonly running: boolean;
    readonly cycleInFlight: boolean;
    readonly lastError?: string;
    readonly lastSuccessfulCycleAt?: string;
  } {
    return {
      running: this.#running,
      cycleInFlight: this.#cycle !== undefined,
      ...(this.#lastError ? { lastError: this.#lastError } : {}),
      ...(this.#lastSuccessfulCycleAt
        ? { lastSuccessfulCycleAt: this.#lastSuccessfulCycleAt }
        : {}),
    };
  }

  async #runCycle(): Promise<void> {
    if (this.#cycle) return this.#cycle;
    this.#cycle = (async () => {
      try {
        await runStartupRecovery(this.#options);
        await drainOutboxJobs(this.#options, this.#maxJobs);
        this.#lastError = undefined;
        this.#lastSuccessfulCycleAt = new Date().toISOString();
      } catch (error) {
        // Do not retain arbitrary provider/SDK error text in process state.
        this.#lastError = 'Worker cycle failed';
        throw error;
      } finally {
        this.#cycle = undefined;
      }
    })();
    return this.#cycle;
  }

  async start(): Promise<{ readonly startupRecovered: number }> {
    if (this.#running) throw new Error('RestartRunner is already running');
    this.#running = true;
    // Step 1: Run startup recovery on boot to heal any orphaned SUBMITTING records
    let startupRecovered: number;
    try {
      startupRecovered = await runStartupRecovery(this.#options);
      await drainOutboxJobs(this.#options, this.#maxJobs);
      this.#lastSuccessfulCycleAt = new Date().toISOString();
    } catch (error) {
      this.#running = false;
      throw error;
    }

    // Step 2: Set up periodic lease expiry sweep and outbox draining
    this.#sweepTimer = setInterval(() => {
      if (!this.#running) return;
      void this.#runCycle().catch(() => {});
    }, this.#leaseIntervalMs);

    return { startupRecovered };
  }

  async stop(): Promise<void> {
    this.#running = false;
    if (this.#sweepTimer) {
      clearInterval(this.#sweepTimer);
      this.#sweepTimer = undefined;
    }
    await this.#cycle?.catch(() => {});
  }
}
