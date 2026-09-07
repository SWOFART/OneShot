/**
 * Fixture-driven RPC simulator (B01.5 / B01.6).
 *
 * Lets the readiness probe be exercised across every outcome with no network
 * and no credential, which is what allows the B01 packet to close on its own.
 *
 * The simulator never invents a result. An unknown scenario name throws rather
 * than falling back to a healthy response: `.agent/AGENTS.md` requires that
 * simulators never silently default an unknown enum to a successful or
 * retryable result.
 */

/** Minimal probe surface, structurally identical to the adapter's `RpcProbe`. */
export interface SimulatedRpcProbe {
  getChainId(): Promise<number>;
  getCode(address: `0x${string}`): Promise<string | null>;
}

export type RpcScenario =
  /** Correct chain, token address holds bytecode. */
  | 'healthy'
  /** Endpoint answers, but for a different chain. Permanent misconfiguration. */
  | 'wrong-chain'
  /** Chain is right, configured token address holds no code. */
  | 'token-missing-bytecode'
  /** Endpoint answers null for the token address. */
  | 'token-null-code'
  /** Endpoint unreachable. May resolve on its own. */
  | 'unreachable'
  /** Chain reads fine, then the token read fails. Partial availability. */
  | 'chain-ok-token-unreachable'
  /** Provider returns an enormous error body. */
  | 'oversized-error';

export interface SimulatorOptions {
  readonly chainId?: number;
}

const DEFAULT_CHAIN_ID = 5042002;
const BYTECODE = '0x60806040';

/**
 * Build a probe for a named scenario.
 *
 * `chainId` sets what the healthy case reports, so one simulator serves any
 * deployment profile.
 */
export function simulateRpc(
  scenario: RpcScenario,
  options: SimulatorOptions = {},
): SimulatedRpcProbe {
  const chainId = options.chainId ?? DEFAULT_CHAIN_ID;

  switch (scenario) {
    case 'healthy':
      return {
        getChainId: () => Promise.resolve(chainId),
        getCode: () => Promise.resolve(BYTECODE),
      };

    case 'wrong-chain':
      return {
        // Ethereum mainnet. A settlement sent here would be irrecoverable.
        getChainId: () => Promise.resolve(1),
        getCode: () => Promise.resolve(BYTECODE),
      };

    case 'token-missing-bytecode':
      return {
        getChainId: () => Promise.resolve(chainId),
        getCode: () => Promise.resolve('0x'),
      };

    case 'token-null-code':
      return {
        getChainId: () => Promise.resolve(chainId),
        getCode: () => Promise.resolve(null),
      };

    case 'unreachable':
      return {
        getChainId: () => Promise.reject(new Error('ECONNREFUSED')),
        getCode: () => Promise.reject(new Error('ECONNREFUSED')),
      };

    case 'chain-ok-token-unreachable':
      return {
        getChainId: () => Promise.resolve(chainId),
        getCode: () => Promise.reject(new Error('ETIMEDOUT')),
      };

    case 'oversized-error':
      return {
        getChainId: () => Promise.reject(new Error('x'.repeat(20_000))),
        getCode: () => Promise.reject(new Error('x'.repeat(20_000))),
      };

    default: {
      // Exhaustiveness guard. An unhandled scenario is a bug, never a default.
      const unreachable: never = scenario;
      throw new Error(`Unknown RPC scenario: ${String(unreachable)}`);
    }
  }
}
