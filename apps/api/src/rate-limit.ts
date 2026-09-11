import type { Pool } from 'pg';

export interface RateLimitInput {
  readonly correlationId: string;
  readonly key: string;
  readonly route: string;
}

export interface RateLimiter {
  allow(input: RateLimitInput): Promise<boolean>;
}

export interface PostgresRateLimiterOptions {
  readonly maxRequests: number;
  readonly windowMs: number;
  readonly now?: () => number;
  readonly cleanupIntervalMs?: number;
}

/** Shared fixed-window admission control for horizontally scaled API nodes. */
export class PostgresRateLimiter implements RateLimiter {
  readonly #pool: Pool;
  readonly #maxRequests: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  readonly #cleanupIntervalMs: number;
  #nextCleanupAt = 0;

  constructor(pool: Pool, options: PostgresRateLimiterOptions) {
    if (!Number.isSafeInteger(options.maxRequests) || options.maxRequests < 1) {
      throw new Error('Rate limiter maxRequests must be a positive integer');
    }
    if (!Number.isSafeInteger(options.windowMs) || options.windowMs < 1_000) {
      throw new Error('Rate limiter windowMs must be at least 1000 milliseconds');
    }
    this.#pool = pool;
    this.#maxRequests = options.maxRequests;
    this.#windowMs = options.windowMs;
    this.#now = options.now ?? Date.now;
    this.#cleanupIntervalMs = options.cleanupIntervalMs ?? Math.max(options.windowMs, 60_000);
  }

  async allow(input: RateLimitInput): Promise<boolean> {
    const now = this.#now();
    const bucketStart = new Date(Math.floor(now / this.#windowMs) * this.#windowMs);
    try {
      const result = await this.#pool.query<{ request_count: number }>(
        `INSERT INTO api_rate_limit_buckets
           (bucket_start, client_key, route, request_count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (bucket_start, client_key, route)
         DO UPDATE SET request_count = LEAST(
           api_rate_limit_buckets.request_count + 1,
           $4 + 1
         )
         RETURNING request_count`,
        [bucketStart, input.key, input.route, this.#maxRequests],
      );
      const requestCount = Number(result.rows[0]?.request_count ?? this.#maxRequests + 1);

      if (now >= this.#nextCleanupAt) {
        this.#nextCleanupAt = now + this.#cleanupIntervalMs;
        void this.#pool
          .query('DELETE FROM api_rate_limit_buckets WHERE bucket_start < $1', [
            new Date(now - this.#windowMs * 2),
          ])
          .catch(() => undefined);
      }
      return requestCount <= this.#maxRequests;
    } catch {
      // Admission control fails closed if its durable store is unavailable.
      return false;
    }
  }
}

export const allowAllRateLimiter: RateLimiter = {
  async allow() {
    return true;
  },
};
