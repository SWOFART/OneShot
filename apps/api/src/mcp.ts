import { createHash } from 'node:crypto';
import { McpServer, createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import {
  asBlockNumber,
  asBusinessIntentId,
  asEvmAddress,
  asProviderReferenceId,
  asTransactionHash,
  ContractValidationError,
  type JobView,
  type SupplierPort,
} from '@oneshot/contracts';
import { derivedJobId } from '@oneshot/domain';
import type { IntentLedger, JobLedger } from '@oneshot/storage-postgres';
import { z } from 'zod';
import type { UserWalletVerificationPort } from './user-wallet.js';

const ARC_NETWORK = 'eip155:5042002' as const;
const ARC_CHAIN_ID = 5042002 as const;
const ARC_USDC = '0x3600000000000000000000000000000000000000' as const;
const USDC_DECIMALS = 6;
const REQUEST_KEY_MAX_LENGTH = 128;
const TRANSFER_SELECTOR = 'a9059cbb';

const prepareInputSchema = z.strictObject({
  request_key: z
    .string()
    .min(1)
    .max(REQUEST_KEY_MAX_LENGTH)
    .describe(
      'Generate automatically as report-<purpose-slug>-<8 random hex>; reuse it exactly for retries and never ask the user for it',
    ),
  payer_wallet: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u)
    .describe('The connected Privy embedded or external EVM wallet that will sign the payment'),
  recipient: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u)
    .describe('Arc Testnet USDC recipient'),
  amount_usdc: z.string().min(1).max(79).describe('Positive decimal USDC, up to 6 decimals'),
  purpose: z.string().min(1).max(256).describe('Short non-secret payment purpose'),
});

const submitInputSchema = z.strictObject({
  business_intent_id: z
    .string()
    .regex(/^intent_[0-9a-f]{64}$/u)
    .describe('The business_intent_id returned by the prepare call'),
  transaction_hash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/u)
    .describe(
      'The hash returned by Privy or MetaMask after the user signed and broadcast the transfer',
    ),
});

const outputSchema = z.strictObject({
  request_key: z.string(),
  job_id: z.string(),
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
    mode: z.literal('USER_WALLET'),
    wallet_address: z.string(),
  }),
  recipient: z.string(),
  amount_usdc: z.string(),
  amount_atomic: z.string(),
  asset: z.literal('USDC'),
  network: z.literal(ARC_NETWORK),
  replayed: z.boolean(),
  quote: z.strictObject({
    supplier_id: z.literal('team-report-v1'),
    order_reference: z.string(),
    recipient: z.string(),
    amount_atomic: z.string(),
    asset: z.literal('USDC'),
    network: z.literal(ARC_NETWORK),
    expires_at: z.string(),
  }),
  transaction: z
    .strictObject({
      chain_id: z.literal(ARC_CHAIN_ID),
      from: z.string(),
      to: z.string(),
      data: z.string(),
      value: z.literal('0x0'),
    })
    .optional(),
  settlement: z
    .strictObject({
      transaction_hash: z.string(),
      block_number: z.string(),
      explorer_url: z.string(),
    })
    .optional(),
  next_action: z.enum(['SIGN', 'CHECK_STATUS', 'VIEW_PROOF', 'FIX_REQUEST']),
});

export interface ArcPaymentMcpConfig {
  readonly workspaceId: string;
  readonly submissionsDisabled?: boolean;

  /**
   * НЕ УДАЛЯТЬ: legacy corporate autonomous-agent server-wallet configuration.
   * It is intentionally not consumed by the active personal user-wallet MCP flow.
   */
  readonly payerWallet?: string;
  /** НЕ УДАЛЯТЬ: retained only for the disabled legacy server-wallet mode. */
  readonly waitMs?: number;
}

export interface ArcPaymentMcpDependencies {
  readonly ledger: Pick<
    IntentLedger,
    | 'beginUserWalletSubmission'
    | 'recordUserWalletTransaction'
    | 'completeSubmission'
    | 'markUserWalletUnknown'
  >;
  readonly jobs: Pick<JobLedger, 'createUserWalletOrReplay' | 'getByBusinessIntentId'>;
  readonly supplier: SupplierPort;
  readonly userWalletVerifier?: UserWalletVerificationPort;
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

/**
 * Retained for compatibility with the old server-wallet intent identity. The
 * active MCP flow uses the resumable user-wallet job identity instead.
 */
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

function formatUsdcAmount(amountAtomic: string): string {
  const atomic = BigInt(amountAtomic);
  const whole = atomic / 10n ** 6n;
  const fraction = (atomic % 10n ** 6n).toString(10).padStart(6, '0');
  return `${whole.toString(10)}.${fraction}`;
}

function transferCalldata(recipient: string, amountAtomic: string): string {
  const addressWord = recipient.slice(2).padStart(64, '0');
  const amountWord = BigInt(amountAtomic).toString(16).padStart(64, '0');
  return `0x${TRANSFER_SELECTOR}${addressWord}${amountWord}`;
}

function nextAction(
  state: JobView['payment_state'],
): 'SIGN' | 'CHECK_STATUS' | 'VIEW_PROOF' | 'FIX_REQUEST' {
  if (state === 'READY') return 'SIGN';
  if (state === 'COMMITTED') return 'VIEW_PROOF';
  if (state === 'UNKNOWN' || state === 'SUBMITTING') return 'CHECK_STATUS';
  return 'FIX_REQUEST';
}

function transactionFor(job: JobView) {
  const payment = job.user_payment;
  if (!payment) throw new Error('User-wallet payment binding is missing');
  if (payment.token_contract !== ARC_USDC) {
    throw new Error('User-wallet payment is bound to an unsupported token contract');
  }
  return {
    chain_id: ARC_CHAIN_ID,
    from: payment.payer_wallet,
    to: payment.token_contract,
    data: transferCalldata(payment.recipient, payment.amount_atomic),
    value: '0x0' as const,
  };
}

function resultView(requestKey: string, job: JobView, replayed: boolean) {
  const payment = job.user_payment;
  if (!payment) throw new Error('User-wallet payment binding is missing');
  return {
    request_key: requestKey,
    job_id: job.job_id,
    business_intent_id: job.business_intent_id,
    state: job.payment_state,
    payer: {
      mode: 'USER_WALLET' as const,
      wallet_address: payment.payer_wallet,
    },
    recipient: payment.recipient,
    amount_usdc: formatUsdcAmount(payment.amount_atomic),
    amount_atomic: payment.amount_atomic,
    asset: 'USDC' as const,
    network: payment.network,
    replayed,
    quote: job.supplier,
    ...(job.payment_state !== 'COMMITTED' && job.payment_state !== 'FAILED_SAFE'
      ? { transaction: transactionFor(job) }
      : {}),
    ...(job.settlement
      ? {
          settlement: {
            transaction_hash: job.settlement.transaction_hash,
            block_number: job.settlement.block_number,
            explorer_url:
              job.settlement.explorer_url ??
              `https://testnet.arcscan.app/tx/${job.settlement.transaction_hash}`,
          },
        }
      : {}),
    next_action: nextAction(job.payment_state),
  };
}

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true as const,
  };
}

function jsonResult(output: ReturnType<typeof resultView>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(output) }],
    structuredContent: output,
  };
}

export function createArcPaymentMcpHandler({
  ledger,
  jobs,
  supplier,
  userWalletVerifier,
  config,
}: ArcPaymentMcpDependencies): McpHttpHandler {
  return createMcpHandler(() => {
    const server = new McpServer({ name: 'oneshot-arc-payments', version: '2.0.0' });
    server.registerTool(
      'arc_payment',
      {
        title: 'Prepare Arc USDC payment',
        description:
          'Create or replay a payer-bound Arc Testnet USDC payment. The user must review and sign the returned ERC-20 transaction with the connected Privy or MetaMask wallet. This tool never uses a server wallet and never broadcasts a transaction.',
        inputSchema: prepareInputSchema,
        outputSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async ({ request_key, payer_wallet, recipient, amount_usdc, purpose }) => {
        try {
          const requestKey = boundedText(request_key, 'request_key', REQUEST_KEY_MAX_LENGTH);
          if (config.submissionsDisabled) {
            return toolError('Arc payment preparation is disabled for this deployment.');
          }
          const amount = parseUsdcAmount(amount_usdc);
          const parsedPayer = asEvmAddress(payer_wallet);
          const parsedRecipient = asEvmAddress(recipient);
          const jobRequest = {
            task_key: requestKey,
            tool_id: 'team-report-v1' as const,
            report_subject: boundedText(purpose, 'purpose', 256),
            recipient: parsedRecipient,
            amount_atomic: amount.atomic,
          };
          const jobId = derivedJobId(config.workspaceId, jobRequest);
          const supplierOrder = await supplier.createOrder(jobRequest, jobId);
          const result = await jobs.createUserWalletOrReplay({
            workspaceId: config.workspaceId,
            request: { ...jobRequest, payer_wallet: parsedPayer },
            supplierOrder,
            correlationId: `mcp-${requestKey.slice(0, 124)}`,
          });
          if (result.kind === 'TASK_PAYLOAD_CONFLICT') {
            return toolError(
              'The request key already belongs to a different user-wallet payment. Reuse the original immutable fields and payer wallet.',
            );
          }
          return jsonResult(resultView(requestKey, result.job, result.kind === 'REPLAYED'));
        } catch (error) {
          if (error instanceof ContractValidationError) {
            if (error.message.includes('Supplier task payload conflicts')) {
              return toolError(
                'The request key already belongs to a different user-wallet payment. Reuse the original immutable fields and payer wallet.',
              );
            }
            return toolError(error.message);
          }
          throw error;
        }
      },
    );

    server.registerTool(
      'arc_payment_submit',
      {
        title: 'Verify signed Arc USDC payment',
        description:
          'Bind the transaction hash returned by the user wallet to the prepared payment, verify the Arc receipt and exact USDC Transfer log, and return the durable payment status. This tool never submits or retries a transaction.',
        inputSchema: submitInputSchema,
        outputSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async ({ business_intent_id, transaction_hash }) => {
        try {
          if (config.submissionsDisabled) {
            return toolError('Arc payment verification is disabled for this deployment.');
          }
          if (!userWalletVerifier) {
            return toolError(
              'Arc receipt verification is not configured. Set ONESHOT_ARC_RPC_URL before enabling user-wallet MCP payments.',
            );
          }
          const businessIntentId = asBusinessIntentId(business_intent_id);
          const transactionHash = asTransactionHash(transaction_hash);
          const job = await jobs.getByBusinessIntentId(config.workspaceId, businessIntentId);
          if (!job) return toolError('The prepared payment was not found in this workspace.');
          if (job.payment_mode !== 'USER_WALLET' || !job.user_payment) {
            return toolError('The prepared payment is not configured for a user wallet.');
          }

          const begun = await ledger.beginUserWalletSubmission(
            job.business_intent_id,
            job.user_payment.payer_wallet,
            `mcp-submit-${transactionHash.slice(2, 18)}`,
          );
          if (!begun.begun) {
            if (begun.currentState === 'COMMITTED' || begun.currentState === 'FAILED_SAFE') {
              const current = await jobs.getByBusinessIntentId(
                config.workspaceId,
                job.business_intent_id,
              );
              return current
                ? jsonResult(resultView(job.task_key, current, true))
                : toolError('The completed payment could not be read back from durable storage.');
            }
            return toolError(
              begun.reason === 'NOT_USER_WALLET'
                ? 'The payer wallet does not match the durable user-wallet authorization.'
                : 'This user-wallet payment is no longer available for verification.',
            );
          }
          if (begun.transactionHash && begun.transactionHash !== transactionHash) {
            return toolError(
              'A different transaction hash is already bound to this payment; do not submit another transaction.',
            );
          }
          const recorded = await ledger.recordUserWalletTransaction(
            begun.attemptId,
            transactionHash,
          );
          if (recorded === 'CONFLICT' || recorded === 'NOT_FOUND') {
            return toolError(
              'The transaction hash could not be bound to the durable payment attempt.',
            );
          }

          let verification;
          try {
            verification = await userWalletVerifier.verify({
              transactionHash,
              walletAddress: job.user_payment.payer_wallet,
              recipient: job.user_payment.recipient,
              amountAtomic: job.user_payment.amount_atomic,
            });
          } catch {
            return toolError(
              'Arc receipt verification is temporarily unavailable; the hash is recorded and no retry was submitted.',
            );
          }

          if (verification.kind === 'CONFIRMED') {
            await ledger.completeSubmission(job.business_intent_id, begun.attemptId, {
              kind: 'CONFIRMED',
              provider_reference_id: asProviderReferenceId(`user-wallet:${transactionHash}`),
              transaction_hash: asTransactionHash(verification.transactionHash),
              block_number: asBlockNumber(verification.blockNumber),
              transfer_log_index: verification.transferLogIndex,
              verified_by: 'ARC_RPC_EXACT_TRANSFER',
            });
          } else if (verification.kind === 'FINAL_REVERT') {
            await ledger.completeSubmission(job.business_intent_id, begun.attemptId, {
              kind: 'DEFINITELY_NOT_SUBMITTED',
              reason: verification.reason,
            });
          } else {
            await ledger.markUserWalletUnknown(
              job.business_intent_id,
              begun.attemptId,
              verification.kind === 'PENDING'
                ? 'User wallet transaction is not final; receipt is not available yet'
                : verification.reason,
            );
          }
          const updated = await jobs.getByBusinessIntentId(
            config.workspaceId,
            job.business_intent_id,
          );
          if (!updated) return toolError('Updated payment could not be read from durable storage.');
          return jsonResult(resultView(job.task_key, updated, false));
        } catch (error) {
          if (error instanceof ContractValidationError) return toolError(error.message);
          throw error;
        }
      },
    );

    /*
     * НЕ УДАЛЯТЬ: the former policy-bound Privy server-wallet MCP handler is
     * intentionally disabled. Corporate autonomous-agent settlement may be
     * restored later as a separate explicitly selected mode. It must never be
     * used as a fallback for personal Privy/MetaMask payments.
     */
    return server;
  });
}
