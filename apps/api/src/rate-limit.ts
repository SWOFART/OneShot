export interface RateLimitInput {
  readonly correlationId: string;
  readonly route: string;
}

export interface RateLimiter {
  allow(input: RateLimitInput): Promise<boolean>;
}

export const allowAllRateLimiter: RateLimiter = {
  async allow() {
    return true;
  },
};
