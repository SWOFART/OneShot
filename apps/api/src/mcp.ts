import { createHash, randomUUID } from 'node:crypto';
import { McpServer, createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import { asEvmAddress, ContractValidationError, type IntentResponse } from '@oneshot/contracts';
import type { IntentLedger } from '@oneshot/storage-postgres';
import { z } from 'zod';

const ARC_NETWORK = 'eip155:5042002' as const;
const USDC_DECIMALS = 6;
const REQUEST_KEY_MAX_LENGTH = 128;

const inputSchema = z.strictObject({
  request_key: z.string().min(1).max(REQUEST_KEY_MAX_LENGTH).describe('Configured demo key'),
  recipient: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u)
    .describe('Arc Testnet USDC recipient'),
  amount_usdc: z.string().min(1).max(79).describe('Positive decimal USDC, up to 6 decimals'),
  purpose: z.string().min(1).max(256).describe('Short non-secret payment purpose'),
});

const outputSchema = z.strictObject({
  request_key: z.string(),
  business_intent_id: z.string(),
  state: z.enum([
    'AUTHORIZING',
    'READY',
    'SUBMITTING',
    'COMMITTED',
    'FAILED_SAFE',
    'UNKNOWN',
    'REJECTED',
  ]),
  payer: z.strictObject({
    mode: z.literal('SERVER_PRIVY'),
    wallet_address: z.string(),
  }),
  recipient: z.string(),
  amount_usdc: z.string(),
  amount_atomic: z.string(),
  asset: z.literal('USDC'),
  network: z.literal(ARC_NETWORK),
  replayed: z.boolean(),
  settlement: z
    .strictObject({
      transaction_hash: z.string(),
      block_number: z.string(),
      explorer_url: z.string(),
    })
    .optional(),
  next_action: z.enum(['WAIT', 'CHECK_STATUS', 'VIEW_PROOF', 'FIX_REQUEST']),
});

export interface ArcPaymentMcpConfig {
  readonly workspaceId: string;
  readonly allowedRequestKey: string;
  readonly payerWallet: string;
  readonly submissionsDisabled?: boolean;
  readonly waitMs?: number;
  readonly pollMs?: number;
}

export interface ArcPaymentMcpDependencies {
  readonly ledger: Pick<IntentLedger, 'createOrReplay' | 'getIntent'>;
  readonly config: ArcPaymentMcpConfig;
}

function boundedText(value: string, name: string, maximum: number): string {
  if (
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    // eslint-disable-next-line no-control-regex -- MCP identifiers and display text reject controls.
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new ContractValidationError(`${name} is invalid`);
  }
  return value.normalize('NFC');
}

export function arcPaymentBusinessIntentId(workspaceId: string, requestKey: string): string {
  const workspace = boundedText(workspaceId, 'workspace_id', 128);
  const key = boundedText(requestKey, 'request_key', REQUEST_KEY_MAX_LENGTH);
  return `intent_${createHash('sha256')
    .update(`${workspace}\u0000arc-payment-v1\u0000${key}`, 'utf8')
    .digest('hex')}`;
}

export function parseUsdcAmount(value: string): {
  readonly atomic: string;
  readonly decimal: string;
} {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/u.exec(value);
  if (!match) {
    throw new ContractValidationError(
      'amount_usdc must be a canonical positive decimal string with at most six decimals',
    );
  }
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  const atomic = BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fraction.padEnd(6, '0'));
  if (atomic === 0n) throw new ContractValidationError('amount_usdc must be greater than zero');
  return {
    atomic: atomic.toString(10),
    decimal: `${whole}.${fraction.padEnd(6, '0')}`,
  };
}

function nextAction(
  state: IntentResponse['state'],
): 'WAIT' | 'CHECK_STATUS' | 'VIEW_PROOF' | 'FIX_REQUEST' {
  if (state === 'COMMITTED') return 'VIEW_PROOF';
  if (state === 'UNKNOWN') return 'CHECK_STATUS';
  if (state === 'FAILED_SAFE' || state === 'REJECTED') return 'FIX_REQUEST';
  return 'WAIT';
}

function resultView(
  requestKey: string,
  amountUsdc: string,
  payerWallet: string,
  intent: IntentResponse,
  replayed: boolean,
) {
  return {
    request_key: requestKey,
    business_intent_id: intent.business_intent_id,
    state: intent.state,
    payer: {
      mode: 'SERVER_PRIVY' as const,
      wallet_address: payerWallet,
    },
    recipient: intent.recipient,
    amount_usdc: amountUsdc,
    amount_atomic: intent.amount_atomic,
    asset: intent.asset,
    network: intent.network,
    replayed,
    ...(intent.settlement
      ? {
          settlement: {
            transaction_hash: intent.settlement.transaction_hash,
            block_number: intent.settlement.block_number,
            explorer_url:
              intent.settlement.explorer_url ??
              `https://testnet.arcscan.app/tx/${intent.settlement.transaction_hash}`,
          },
        }
      : {}),
    next_action: nextAction(intent.state),
  };
}

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true as const,
  };
}

async function latestIntent(
  ledger: ArcPaymentMcpDependencies['ledger'],
  initial: IntentResponse,
  waitMs: number,
  pollMs: number,
): Promise<IntentResponse> {
  if (waitMs <= 0 || ['COMMITTED', 'FAILED_SAFE', 'UNKNOWN', 'REJECTED'].includes(initial.state)) {
    return initial;
  }
  const deadline = Date.now() + waitMs;
  let current = initial;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, deadline - Date.now())));
    current = (await ledger.getIntent(initial.business_intent_id)) ?? current;
    if (['COMMITTED', 'FAILED_SAFE', 'UNKNOWN', 'REJECTED'].includes(current.state)) break;
  }
  return current;
}

export function createArcPaymentMcpHandler({
  ledger,
  config,
}: ArcPaymentMcpDependencies): McpHttpHandler {
  const allowedRequestKey = boundedText(
    config.allowedRequestKey,
    'allowed_request_key',
    REQUEST_KEY_MAX_LENGTH,
  );
  const payerWallet = asEvmAddress(config.payerWallet);
  const waitMs = config.waitMs ?? 2_500;
  const pollMs = config.pollMs ?? 250;
  if (!Number.isSafeInteger(waitMs) || waitMs < 0 || waitMs > 5_000) {
    throw new Error('MCP wait must be an integer from 0 to 5000 milliseconds');
  }
  if (!Number.isSafeInteger(pollMs) || pollMs < 10 || pollMs > 1_000) {
    throw new Error('MCP poll interval must be an integer from 10 to 1000 milliseconds');
  }

  return createMcpHandler(() => {
    const server = new McpServer({ name: 'oneshot-arc-payments', version: '1.0.0' });
    server.registerTool(
      'arc_payment',
      {
        title: 'Arc USDC payment',
        description:
          'Create or replay the single approved Arc Testnet USDC payment through the policy-bound Privy server wallet.',
        inputSchema,
        outputSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async ({ request_key, recipient, amount_usdc, purpose }) => {
        try {
          const requestKey = boundedText(request_key, 'request_key', REQUEST_KEY_MAX_LENGTH);
          if (requestKey !== allowedRequestKey) {
            return toolError('This MCP credential is limited to its configured demo request key.');
          }
          if (config.submissionsDisabled) {
            return toolError('Arc payment submission is disabled for this deployment.');
          }
          const amount = parseUsdcAmount(amount_usdc);
          const result = await ledger.createOrReplay(
            {
              business_intent_id: arcPaymentBusinessIntentId(config.workspaceId, requestKey),
              recipient: asEvmAddress(recipient),
              amount_atomic: amount.atomic,
              asset: 'USDC',
              network: ARC_NETWORK,
              purpose: boundedText(purpose, 'purpose', 256),
            },
            randomUUID(),
          );
          if (result.kind === 'INTENT_PAYLOAD_CONFLICT') {
            return toolError(
              'The request key already belongs to a different payment. Reuse the original immutable fields.',
            );
          }
          const intent = await latestIntent(ledger, result.intent, waitMs, pollMs);
          const output = resultView(
            requestKey,
            amount.decimal,
            payerWallet,
            intent,
            result.kind === 'REPLAY_IDENTICAL',
          );
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (error) {
          if (error instanceof ContractValidationError) return toolError(error.message);
          throw error;
        }
      },
    );
    return server;
  });
}
