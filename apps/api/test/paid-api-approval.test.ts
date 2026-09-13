import { describe, expect, it, vi } from 'vitest';
import type { PaidApiQuote, PaidApiResponse } from '@oneshot/contracts';
import type { IntentLedger } from '@oneshot/storage-postgres';
import { derivedPaidApiBusinessIntentId } from '@oneshot/domain';
import { CircleX402PaidApiService, PaidApiQuoteChangedError } from '../src/paid-api.js';

const task = { task_key: 'approved-task', tool_id: 'circle-x402-api-v1' } as const;
const approved: PaidApiQuote = {
  supplier_id: 'circle-x402-v1',
  resource_url: 'https://supplier.example.test/result',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '10000',
  asset: 'USDC',
  network: 'eip155:5042002',
  x402_version: 2,
  max_timeout_seconds: 60,
};
const saved: PaidApiResponse = {
  ...task,
  business_intent_id: derivedPaidApiBusinessIntentId('workspace', task),
  resource_url: approved.resource_url,
  quote: approved,
  payment_state: 'UNKNOWN',
  created_at: '2026-09-12T00:00:00Z',
  updated_at: '2026-09-12T00:00:00Z',
};
function setup(live: PaidApiQuote = approved) {
  const getPaidApi = vi.fn<IntentLedger['getPaidApi']>().mockResolvedValue(undefined);
  const listPaidApi = vi.fn<IntentLedger['listPaidApi']>().mockResolvedValue([]);
  const createPaidApiOrReplay = vi
    .fn<IntentLedger['createPaidApiOrReplay']>()
    .mockResolvedValue({ kind: 'ACCEPTED', request: saved });
  const fetchFn = vi.fn<typeof fetch>().mockImplementation(
    async () =>
      new Response('{}', {
        status: 402,
        headers: {
          'PAYMENT-REQUIRED': Buffer.from(
            JSON.stringify({
              x402Version: 2,
              resource: { url: live.resource_url },
              accepts: [
                {
                  scheme: 'exact',
                  network: live.network,
                  asset: '0x3600000000000000000000000000000000000000',
                  amount: live.amount_atomic,
                  payTo: live.recipient,
                  maxTimeoutSeconds: live.max_timeout_seconds,
                  extra: {
                    name: 'GatewayWalletBatched',
                    version: '1',
                    verifyingContract: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
                  },
                },
              ],
            }),
          ).toString('base64'),
        },
      }),
  );
  const service = new CircleX402PaidApiService({
    ledger: { getPaidApi, listPaidApi, createPaidApiOrReplay },
    workspaceId: 'workspace',
    url: approved.resource_url,
    maxAmountAtomic: 1000000n,
    fetchFn,
  });
  return { service, getPaidApi, createPaidApiOrReplay, fetchFn };
}

describe('approved x402 quote boundary', () => {
  it.each([
    { amount_atomic: '20000' },
    { recipient: '0x2222222222222222222222222222222222222222' },
    { resource_url: 'https://supplier.example.test/other' },
    { max_timeout_seconds: 120 },
  ])('rejects changed quote %j before any durable payment work', async (change) => {
    const { service, createPaidApiOrReplay } = setup({ ...approved, ...change });
    await expect(service.start(task, 'correlation', approved)).rejects.toBeInstanceOf(
      PaidApiQuoteChangedError,
    );
    expect(createPaidApiOrReplay).not.toHaveBeenCalled();
  });
  it('binds the exact approved amount and recipient into the durable request', async () => {
    const { service, createPaidApiOrReplay } = setup();
    await service.start(task, 'correlation', approved);
    expect(createPaidApiOrReplay).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        request: task,
        quote: expect.objectContaining({ amountAtomic: '10000', recipient: approved.recipient }),
      }),
    );
  });
  it('returns UNKNOWN unchanged across 10 replays without querying or submitting again', async () => {
    const { service, getPaidApi, createPaidApiOrReplay, fetchFn } = setup();
    getPaidApi.mockResolvedValue(saved);
    for (const result of await Promise.all(
      Array.from({ length: 10 }, () => service.start(task, 'correlation', approved)),
    )) {
      expect(result).toEqual({ kind: 'REPLAY_IDENTICAL', request: saved });
    }
    expect(fetchFn).not.toHaveBeenCalled();
    expect(createPaidApiOrReplay).not.toHaveBeenCalled();
  });
  it('reports conflicting approval for an existing task without new work', async () => {
    const { service, getPaidApi, createPaidApiOrReplay, fetchFn } = setup();
    getPaidApi.mockResolvedValue(saved);
    expect(
      (await service.start(task, 'correlation', { ...approved, amount_atomic: '20000' })).kind,
    ).toBe('INTENT_PAYLOAD_CONFLICT');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(createPaidApiOrReplay).not.toHaveBeenCalled();
  });
  it('reports a concurrent differently-approved binding as a conflict', async () => {
    const { service, createPaidApiOrReplay } = setup();
    createPaidApiOrReplay.mockResolvedValue({
      kind: 'REPLAY_IDENTICAL',
      request: { ...saved, quote: { ...approved, amount_atomic: '20000' } },
    });
    expect((await service.start(task, 'correlation', approved)).kind).toBe(
      'INTENT_PAYLOAD_CONFLICT',
    );
    expect(createPaidApiOrReplay).toHaveBeenCalledOnce();
  });
});
