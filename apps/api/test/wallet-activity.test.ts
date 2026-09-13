import { describe, expect, it } from 'vitest';
import { StudioWalletActivityPort } from '../src/index.js';

describe('StudioWalletActivityPort', () => {
  it('queries all payer wallets recorded by the site', async () => {
    let request: { variables?: { senders?: string[] } } | undefined;
    const port = new StudioWalletActivityPort({
      endpoint: 'https://graph.example.test/graphql',
      fetchFn: async (_input, init) => {
        request = JSON.parse(String(init?.body)) as typeof request;
        return new Response(
          JSON.stringify({
            data: { settlementCandidates: [], _meta: { deployment: 'studio-deployment' } },
          }),
          { status: 200 },
        );
      },
    });

    await port.refresh([
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x1111111111111111111111111111111111111111',
    ]);

    expect(request?.variables?.senders).toEqual([
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ]);
  });

  it('validates Graph activity and reports indexed coverage', async () => {
    const port = new StudioWalletActivityPort({
      endpoint: 'https://graph.example.test/graphql',
      wallet: '0x1111111111111111111111111111111111111111',
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            data: {
              settlementCandidates: [
                {
                  transactionHash: `0x${'a'.repeat(64)}`,
                  logIndex: '3',
                  sender: '0x1111111111111111111111111111111111111111',
                  tokenContract: '0x3600000000000000000000000000000000000000',
                  blockNumber: '98',
                  blockTimestamp: '1726200000',
                  network: 'eip155:5042002',
                  recipient: '0x2222222222222222222222222222222222222222',
                  amountAtomic: '2500000',
                },
              ],
              _meta: {
                deployment: 'studio-deployment',
                hasIndexingErrors: false,
                block: { number: 99 },
              },
            },
          }),
          { status: 200 },
        ),
    });

    await expect(port.refresh()).resolves.toEqual({
      freshness: 'FRESH',
      coverageNote: 'Indexed sender activity through block 99.',
      payload: {
        deployment: 'studio-deployment',
        transfers: [
          {
            transaction_hash: `0x${'a'.repeat(64)}`,
            log_index: 3,
            sender: '0x1111111111111111111111111111111111111111',
            token_contract: '0x3600000000000000000000000000000000000000',
            block_number: '98',
            block_timestamp: new Date(1726200000 * 1_000).toISOString(),
            network: 'eip155:5042002',
            recipient: '0x2222222222222222222222222222222222222222',
            amount_atomic: '2500000',
          },
        ],
      },
    });
  });

  it('rejects malformed Graph activity instead of presenting it as wallet evidence', async () => {
    const port = new StudioWalletActivityPort({
      endpoint: 'https://graph.example.test/graphql',
      wallet: '0x1111111111111111111111111111111111111111',
      fetchFn: async () =>
        new Response(
          JSON.stringify({ data: { settlementCandidates: [{ logIndex: -1 }], _meta: {} } }),
          { status: 200 },
        ),
    });

    await expect(port.refresh()).rejects.toThrow('Graph activity entry failed validation');
  });
});
