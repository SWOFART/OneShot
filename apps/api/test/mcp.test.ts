import type { IntentResponse } from '@oneshot/contracts';
import type { CreateIntentResult } from '@oneshot/storage-postgres';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApi, staticBearerAuthenticator, type ApiDependencies } from '../src/index.js';
import { arcPaymentBusinessIntentId, parseUsdcAmount } from '../src/mcp.js';

const MCP_TOKEN = 'mcp-test-token-with-at-least-32-characters';
const SERVICE_TOKEN = 'service-test-token';
const REQUEST_KEY = 'arc-demo-payment-1';
const RECIPIENT = '0x292d3fca76142e0c6136b934563f3a0750b633eb';
const PAYER = '0x1111111111111111111111111111111111111111';

function intent(overrides: Partial<IntentResponse> = {}): IntentResponse {
  return {
    business_intent_id: arcPaymentBusinessIntentId('mcp-demo-workspace', REQUEST_KEY),
    recipient: RECIPIENT,
    amount_atomic: '1000000',
    asset: 'USDC',
    network: 'eip155:5042002',
    purpose: 'Pay for one report',
    payload_fingerprint: 'a'.repeat(64),
    state: 'AUTHORIZING',
    version: 1,
    attempts: [],
    evidence: [],
    ...overrides,
  };
}

function ledger(createOrReplay = vi.fn<() => Promise<CreateIntentResult>>()) {
  return {
    createOrReplay,
    getIntent: vi.fn(async () => undefined),
    enqueueReconciliation: vi.fn(),
    getRecoveryView: vi.fn(),
    getSystemMetrics: vi.fn(),
    ping: vi.fn(),
    beginUserWalletSubmission: vi.fn(),
    recordUserWalletTransaction: vi.fn(),
    completeSubmission: vi.fn(),
    markUserWalletUnknown: vi.fn(),
  } as unknown as ApiDependencies['ledger'];
}

function app(createOrReplay: ApiDependencies['ledger']['createOrReplay']) {
  return buildApi({
    ledger: ledger(createOrReplay),
    authenticator: staticBearerAuthenticator(SERVICE_TOKEN),
    mcp: {
      authenticator: staticBearerAuthenticator(MCP_TOKEN),
      workspaceId: 'mcp-demo-workspace',
      payerWallet: PAYER,
      waitMs: 0,
    },
  });
}

const rpcHeaders = (token = MCP_TOKEN) => ({
  authorization: `Bearer ${token}`,
  accept: 'application/json, text/event-stream',
  'content-type': 'application/json',
  'mcp-protocol-version': '2025-06-18',
});

async function rpc(
  server: ReturnType<typeof app>,
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

function toolRequest(id: number, overrides: Record<string, unknown> = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name: 'arc_payment',
      arguments: {
        request_key: REQUEST_KEY,
        recipient: RECIPIENT,
        amount_usdc: '1',
        purpose: 'Pay for one report',
        ...overrides,
      },
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('MCP arc_payment', () => {
  it('converts USDC decimal strings without floating point', () => {
    expect(parseUsdcAmount('1')).toEqual({ atomic: '1000000', decimal: '1.000000' });
    expect(parseUsdcAmount('0.000001')).toEqual({ atomic: '1', decimal: '0.000001' });
    expect(() => parseUsdcAmount('1.0000001')).toThrow('at most six decimals');
    expect(() => parseUsdcAmount('0')).toThrow('greater than zero');
  });

  it('derives one stable intent ID from workspace and request key', () => {
    const first = arcPaymentBusinessIntentId('mcp-demo-workspace', REQUEST_KEY);
    expect(arcPaymentBusinessIntentId('mcp-demo-workspace', REQUEST_KEY)).toBe(first);
    expect(arcPaymentBusinessIntentId('another-workspace', REQUEST_KEY)).not.toBe(first);
    expect(first).toMatch(/^intent_[0-9a-f]{64}$/u);
  });

  it('derives the intent from the personal bearer workspace', async () => {
    let seenId = '';
    const createOrReplay = vi.fn(async (request: unknown): Promise<CreateIntentResult> => {
      seenId = (request as IntentResponse).business_intent_id;
      return { kind: 'ACCEPTED', intent: intent(request as Partial<IntentResponse>) };
    });
    const server = buildApi({
      ledger: ledger(createOrReplay),
      authenticator: staticBearerAuthenticator(SERVICE_TOKEN),
      mcp: {
        authenticator: {
          async authenticate() {
            return { decision: 'AUTHORIZED' as const, workspaceId: 'privy_alice' };
          },
        },
        workspaceId: 'legacy-workspace',
        payerWallet: PAYER,
        waitMs: 0,
      },
    });

    await rpc(server, toolRequest(1));
    expect(seenId).toBe(arcPaymentBusinessIntentId('privy_alice', REQUEST_KEY));
    await server.close();
  });

  it('isolates the MCP credential and lists exactly one tool', async () => {
    const server = app(vi.fn(async () => ({ kind: 'ACCEPTED', intent: intent() })));
    const missing = await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(missing.statusCode).toBe(401);
    expect(
      (await rpc(server, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, SERVICE_TOKEN))
        .statusCode,
    ).toBe(401);

    const initialized = await rpc(server, {
      jsonrpc: '2.0',
      id: 3,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'oneshot-test', version: '1.0.0' },
      },
    });
    expect(rpcBody(initialized).result.serverInfo.name).toBe('oneshot-arc-payments');
    const listed = await rpc(server, { jsonrpc: '2.0', id: 3, method: 'tools/list' });
    expect(listed.statusCode).toBe(200);
    const tools = rpcBody(listed).result.tools as Array<{
      name: string;
      inputSchema: { properties: { request_key: { description: string } } };
    }>;
    expect(tools.map((tool) => tool.name)).toEqual(['arc_payment']);
    expect(tools[0]?.inputSchema.properties.request_key.description).toContain(
      'never ask the user',
    );

    const apiAttempt = await server.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: `Bearer ${MCP_TOKEN}` },
      payload: {
        business_intent_id: 'mcp-cannot-call-api',
        recipient: RECIPIENT,
        amount_atomic: '1',
        asset: 'USDC',
        network: 'eip155:5042002',
        purpose: 'Denied',
      },
    });
    expect(apiAttempt.statusCode).toBe(401);
    await server.close();
  });

  it('creates and replays the same durable intent with authoritative status', async () => {
    let saved: IntentResponse | undefined;
    const createOrReplay = vi.fn(async (request: unknown): Promise<CreateIntentResult> => {
      const next = { ...intent(), ...(request as object) } as IntentResponse;
      if (!saved) {
        saved = next;
        return { kind: 'ACCEPTED', intent: saved };
      }
      return JSON.stringify(request) ===
        JSON.stringify({
          business_intent_id: saved.business_intent_id,
          recipient: saved.recipient,
          amount_atomic: saved.amount_atomic,
          asset: saved.asset,
          network: saved.network,
          purpose: saved.purpose,
        })
        ? { kind: 'REPLAY_IDENTICAL', intent: saved }
        : { kind: 'INTENT_PAYLOAD_CONFLICT', intent: saved };
    });
    const server = app(createOrReplay);

    const first = rpcBody(await rpc(server, toolRequest(1))).result;
    const replay = rpcBody(await rpc(server, toolRequest(2))).result;
    expect(first.structuredContent).toMatchObject({
      business_intent_id: arcPaymentBusinessIntentId('mcp-demo-workspace', REQUEST_KEY),
      state: 'AUTHORIZING',
      payer: { mode: 'SERVER_PRIVY', wallet_address: PAYER },
      amount_usdc: '1.000000',
      amount_atomic: '1000000',
      replayed: false,
      next_action: 'WAIT',
    });
    expect(replay.structuredContent).toMatchObject({
      business_intent_id: first.structuredContent.business_intent_id,
      replayed: true,
    });
    await server.close();
  });

  it('makes sequential and parallel redelivery converge on one intent identity', async () => {
    const ids = new Set<string>();
    const createOrReplay = vi.fn(async (request: unknown): Promise<CreateIntentResult> => {
      const value = request as IntentResponse;
      ids.add(value.business_intent_id);
      return {
        kind: ids.size === 1 ? 'REPLAY_IDENTICAL' : 'INTENT_PAYLOAD_CONFLICT',
        intent: intent(value),
      };
    });
    const server = app(createOrReplay);
    for (let index = 0; index < 10; index += 1) await rpc(server, toolRequest(index));
    await Promise.all(
      Array.from({ length: 10 }, (_, index) => rpc(server, toolRequest(index + 10))),
    );
    expect(ids).toEqual(new Set([arcPaymentBusinessIntentId('mcp-demo-workspace', REQUEST_KEY)]));
    expect(createOrReplay).toHaveBeenCalledTimes(20);
    await server.close();
  });

  it('accepts agent-generated keys and rejects immutable-payload conflicts', async () => {
    const createOrReplay = vi
      .fn<(request: unknown) => Promise<CreateIntentResult>>()
      .mockImplementationOnce(async (request) => ({
        kind: 'ACCEPTED',
        intent: intent(request as Partial<IntentResponse>),
      }))
      .mockImplementationOnce(async () => ({
        kind: 'INTENT_PAYLOAD_CONFLICT',
        intent: intent(),
      }));
    const server = app(createOrReplay);

    const generatedKey = 'report-werwerwe-63368792';
    const accepted = rpcBody(await rpc(server, toolRequest(1, { request_key: generatedKey })))
      .result.structuredContent;
    expect(accepted.business_intent_id).toBe(
      arcPaymentBusinessIntentId('mcp-demo-workspace', generatedKey),
    );

    const conflict = rpcBody(await rpc(server, toolRequest(2, { amount_usdc: '1.000001' })));
    expect(conflict.result.isError).toBe(true);
    expect(conflict.result.content[0].text).toContain('different payment');
    expect(createOrReplay).toHaveBeenCalledTimes(2);
    await server.close();
  });

  it('returns stored Arc proof for a committed replay', async () => {
    const committed = intent({
      state: 'COMMITTED',
      settlement: {
        provider_reference_id: 'privy-reference',
        transaction_hash: `0x${'1'.repeat(64)}`,
        block_number: '123',
        transfer_log_index: 0,
      },
    });
    const server = app(vi.fn(async () => ({ kind: 'REPLAY_IDENTICAL', intent: committed })));
    const result = rpcBody(await rpc(server, toolRequest(1))).result.structuredContent;
    expect(result).toMatchObject({
      state: 'COMMITTED',
      replayed: true,
      next_action: 'VIEW_PROOF',
      settlement: {
        transaction_hash: committed.settlement?.transaction_hash,
        explorer_url: `https://testnet.arcscan.app/tx/${committed.settlement?.transaction_hash}`,
      },
    });
    await server.close();
  });
});
