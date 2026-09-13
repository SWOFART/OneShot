import type { JobView } from '@oneshot/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApi, staticBearerAuthenticator, type ApiDependencies } from '../src/index.js';
import { arcPaymentBusinessIntentId, parseUsdcAmount } from '../src/mcp.js';

const MCP_TOKEN = 'mcp-test-token-with-at-least-32-characters';
const SERVICE_TOKEN = 'service-test-token';
const REQUEST_KEY = 'arc-demo-payment-1';
const RECIPIENT = '0x292d3fca76142e0c6136b934563f3a0750b633eb';
const PAYER = '0x1111111111111111111111111111111111111111';
const TRANSACTION_HASH = `0x${'1'.repeat(64)}`;

function userWalletJob(overrides: Partial<JobView> = {}): JobView {
  return {
    job_id: `job_${'a'.repeat(64)}`,
    task_key: REQUEST_KEY,
    tool_id: 'team-report-v1',
    business_intent_id: `intent_${'b'.repeat(64)}`,
    supplier: {
      supplier_id: 'team-report-v1',
      order_reference: 'team_report_mcp_payment',
      recipient: RECIPIENT,
      amount_atomic: '1000000',
      asset: 'USDC',
      network: 'eip155:5042002',
      expires_at: '2099-09-12T12:00:00.000Z',
    },
    payment_state: 'READY',
    payment_mode: 'USER_WALLET',
    user_payment: {
      chain_id: 5042002,
      network: 'eip155:5042002',
      token_contract: '0x3600000000000000000000000000000000000000',
      payer_wallet: PAYER,
      recipient: RECIPIENT,
      amount_atomic: '1000000',
    },
    delivery_state: 'NOT_REQUESTED',
    created_at: '2026-09-13T10:00:00.000Z',
    updated_at: '2026-09-13T10:00:00.000Z',
    ...overrides,
  };
}

function app() {
  let saved = userWalletJob();
  const verified = vi.fn(async () => ({
    kind: 'CONFIRMED' as const,
    transactionHash: TRANSACTION_HASH,
    blockNumber: '123',
    transferLogIndex: 7,
  }));
  const ledger = {
    async beginUserWalletSubmission() {
      return {
        begun: true as const,
        intent: {} as never,
        attemptId: 'attempt-mcp-payment',
        state: 'SUBMITTING' as const,
        version: 2,
      };
    },
    async recordUserWalletTransaction() {
      return 'RECORDED' as const;
    },
    async completeSubmission() {
      saved = userWalletJob({
        payment_state: 'COMMITTED',
        user_payment: { ...saved.user_payment!, transaction_hash: TRANSACTION_HASH },
        settlement: {
          provider_reference_id: `user-wallet:${TRANSACTION_HASH}`,
          transaction_hash: TRANSACTION_HASH,
          block_number: '123',
          transfer_log_index: 7,
        },
      });
      return { completed: true as const, state: 'COMMITTED' as const, version: 3 };
    },
    async markUserWalletUnknown() {
      saved = userWalletJob({ payment_state: 'UNKNOWN' });
      return { completed: true as const, state: 'UNKNOWN' as const, version: 3 };
    },
  } as unknown as ApiDependencies['ledger'];
  const jobs = {
    async createUserWalletOrReplay() {
      const replayed = saved.payment_state !== 'READY';
      return { kind: replayed ? ('REPLAYED' as const) : ('ACCEPTED' as const), job: saved };
    },
    async getByBusinessIntentId() {
      return saved;
    },
  } as unknown as ApiDependencies['jobs'];
  const supplier = {
    async createOrder(request: { readonly recipient: string; readonly amount_atomic: string }) {
      return {
        supplier_id: 'team-report-v1' as const,
        order_reference: 'team_report_mcp_payment',
        recipient: request.recipient,
        amount_atomic: request.amount_atomic,
        asset: 'USDC' as const,
        network: 'eip155:5042002' as const,
        expires_at: '2099-09-12T12:00:00.000Z',
        supplier_payload_fingerprint: 'a'.repeat(64),
      };
    },
    async fulfillOrder() {
      throw new Error('not used');
    },
    async getResult() {
      return null;
    },
  };
  const server = buildApi({
    ledger,
    jobs,
    supplier,
    userWalletVerifier: { verify: verified },
    authenticator: staticBearerAuthenticator(SERVICE_TOKEN),
    mcp: {
      authenticator: staticBearerAuthenticator(MCP_TOKEN),
      workspaceId: 'mcp-demo-workspace',
      waitMs: 0,
    },
  });
  return { server, verified };
}

const rpcHeaders = (token = MCP_TOKEN) => ({
  authorization: `Bearer ${token}`,
  accept: 'application/json, text/event-stream',
  'content-type': 'application/json',
  'mcp-protocol-version': '2025-06-18',
});

async function rpc(
  server: ReturnType<typeof buildApi>,
  body: Record<string, unknown>,
  token = MCP_TOKEN,
) {
  return server.inject({ method: 'POST', url: '/mcp', headers: rpcHeaders(token), payload: body });
}

function rpcBody(response: Awaited<ReturnType<typeof rpc>>) {
  if (!response.headers['content-type']?.startsWith('text/event-stream')) return response.json();
  const data = response.body
    .split(/\r?\n/u)
    .find((line) => line.startsWith('data: '))
    ?.slice(6);
  if (!data) throw new Error('MCP SSE response did not contain a message');
  return JSON.parse(data);
}

afterEach(() => vi.restoreAllMocks());

describe('MCP user-wallet Arc payment', () => {
  it('converts USDC decimal strings without floating point', () => {
    expect(parseUsdcAmount('1')).toEqual({ atomic: '1000000', decimal: '1.000000' });
    expect(parseUsdcAmount('0.000001')).toEqual({ atomic: '1', decimal: '0.000001' });
    expect(() => parseUsdcAmount('1.0000001')).toThrow('at most six decimals');
    expect(() => parseUsdcAmount('0')).toThrow('greater than zero');
  });

  it('retains the stable legacy identity helper without using a server payer', () => {
    const first = arcPaymentBusinessIntentId('mcp-demo-workspace', REQUEST_KEY);
    expect(arcPaymentBusinessIntentId('mcp-demo-workspace', REQUEST_KEY)).toBe(first);
    expect(arcPaymentBusinessIntentId('another-workspace', REQUEST_KEY)).not.toBe(first);
    expect(first).toMatch(/^intent_[0-9a-f]{64}$/u);
  });

  it('lists prepare and submit tools and rejects non-MCP credentials', async () => {
    const { server } = app();
    const missing = await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(missing.statusCode).toBe(401);
    const listed = await rpc(server, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(listed.statusCode).toBe(200);
    expect(
      (rpcBody(listed).result.tools as Array<{ name: string }>).map((tool) => tool.name),
    ).toEqual(['arc_payment', 'arc_payment_submit']);
    await server.close();
  });

  it('prepares a payer-bound direct transfer and verifies the same signed hash', async () => {
    const { server, verified } = app();
    const prepared = rpcBody(
      await rpc(server, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'arc_payment',
          arguments: {
            request_key: REQUEST_KEY,
            payer_wallet: PAYER,
            recipient: RECIPIENT,
            amount_usdc: '1',
            purpose: 'Pay for one report',
          },
        },
      }),
    ).result.structuredContent;
    expect(prepared).toMatchObject({
      state: 'READY',
      signing_url: `https://oneshot.kapustazh.dev/app?mcp_job_id=${prepared.job_id}`,
      payer: { mode: 'USER_WALLET', wallet_address: PAYER },
      amount_usdc: '1.000000',
      amount_atomic: '1000000',
      next_action: 'SIGN',
      transaction: {
        chain_id: 5042002,
        from: PAYER,
        to: '0x3600000000000000000000000000000000000000',
        value: '0x0',
      },
    });
    expect(prepared.transaction.data).toBe(
      `0xa9059cbb${RECIPIENT.slice(2).padStart(64, '0')}${'f4240'.padStart(64, '0')}`,
    );

    const submitted = rpcBody(
      await rpc(server, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'arc_payment_submit',
          arguments: {
            business_intent_id: prepared.business_intent_id,
            transaction_hash: TRANSACTION_HASH,
          },
        },
      }),
    ).result.structuredContent;
    expect(submitted).toMatchObject({
      state: 'COMMITTED',
      payer: { mode: 'USER_WALLET', wallet_address: PAYER },
      next_action: 'VIEW_PROOF',
      settlement: { transaction_hash: TRANSACTION_HASH, block_number: '123' },
    });
    expect(verified).toHaveBeenCalledWith({
      transactionHash: TRANSACTION_HASH,
      walletAddress: PAYER,
      recipient: RECIPIENT,
      amountAtomic: '1000000',
    });
    await server.close();
  });
});
