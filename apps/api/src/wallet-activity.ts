import { asEvmAddress, asTransactionHash } from '@oneshot/contracts';

export interface WalletActivitySnapshot {
  readonly freshness: 'FRESH' | 'LAGGING' | 'UNHEALTHY' | 'UNAVAILABLE' | 'UNKNOWN_FRESHNESS';
  readonly coverageNote: string;
  readonly payload: {
    readonly deployment?: string;
    readonly transfers: readonly {
      readonly transaction_hash: string;
      readonly log_index: number;
      readonly recipient: string;
      readonly amount_atomic: string;
    }[];
  };
}

export interface WalletActivityPort {
  refresh(): Promise<WalletActivitySnapshot>;
}

const QUERY = `query OneShotWalletActivity($sender: Bytes!) { settlementCandidates(first: 100, orderBy: blockNumber, orderDirection: desc, where: { sender: $sender }) { transactionHash logIndex recipient amountAtomic } _meta { deployment hasIndexingErrors block { number } } }`;

export class StudioWalletActivityPort implements WalletActivityPort {
  constructor(
    private readonly options: {
      readonly endpoint: string;
      readonly wallet: string;
      readonly apiKey?: string;
      readonly fetchFn?: typeof fetch;
    },
  ) {}
  async refresh(): Promise<WalletActivitySnapshot> {
    const response = await (this.options.fetchFn ?? fetch)(this.options.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { sender: asEvmAddress(this.options.wallet) },
      }),
    });
    if (!response.ok) throw new Error('Graph activity query is unavailable');
    const body = (await response.json()) as {
      data?: {
        settlementCandidates?: unknown;
        _meta?: { deployment?: unknown; hasIndexingErrors?: unknown; block?: { number?: unknown } };
      };
    };
    const data = body.data;
    if (
      !data ||
      !Array.isArray(data.settlementCandidates) ||
      data.settlementCandidates.length > 100
    )
      throw new Error('Graph activity response failed validation');
    const transfers = data.settlementCandidates.map((entry) => {
      if (!entry || typeof entry !== 'object')
        throw new Error('Graph activity entry failed validation');
      const row = entry as Record<string, unknown>;
      const index = Number(row.logIndex);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        typeof row.amountAtomic !== 'string' ||
        !/^(0|[1-9][0-9]*)$/u.test(row.amountAtomic)
      )
        throw new Error('Graph activity entry failed validation');
      return {
        transaction_hash: asTransactionHash(row.transactionHash),
        log_index: index,
        recipient: asEvmAddress(row.recipient),
        amount_atomic: row.amountAtomic,
      };
    });
    const meta = data._meta;
    const deployment = typeof meta?.deployment === 'string' ? meta.deployment : undefined;
    return {
      freshness:
        meta?.hasIndexingErrors === true || !deployment
          ? 'UNHEALTHY'
          : transfers.length === 100
            ? 'LAGGING'
            : 'FRESH',
      coverageNote:
        transfers.length === 100
          ? 'Newest 100 indexed transfers only; query pagination is required for full history.'
          : `Indexed sender activity through block ${typeof meta?.block?.number === 'number' ? meta.block.number : 'not reported'}.`,
      payload: { ...(deployment ? { deployment } : {}), transfers },
    };
  }
}

export class UnavailableWalletActivityPort implements WalletActivityPort {
  async refresh(): Promise<WalletActivitySnapshot> {
    return {
      freshness: 'UNAVAILABLE',
      coverageNote:
        'Graph activity is not configured; recorded settlement state remains available.',
      payload: { transfers: [] },
    };
  }
}
