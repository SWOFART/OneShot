#!/usr/bin/env node
/** Circle x402 demo: one explicit, Privy-signed paid API request. */
import { createPrivyX402Signer } from '../packages/privy-adapter/dist/index.js';
import {
  CircleX402Client,
  CircleX402AmbiguousError,
} from '../packages/supplier-adapter/dist/index.js';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const url = required('ONESHOT_X402_URL');
if (process.env.ONESHOT_X402_GATEWAY_FUNDED !== 'true') {
  throw new Error(
    'Set ONESHOT_X402_GATEWAY_FUNDED=true only after the Privy wallet has a funded Circle Gateway testnet balance',
  );
}

const maxAmountAtomic = BigInt(process.env.ONESHOT_X402_MAX_AMOUNT_ATOMIC?.trim() || '10000');
const businessIntentId = required('ONESHOT_X402_BUSINESS_INTENT_ID');
const signer = createPrivyX402Signer({
  appId: required('ONESHOT_PRIVY_APP_ID'),
  appSecret: required('ONESHOT_PRIVY_APP_SECRET'),
  walletId: required('ONESHOT_PRIVY_WALLET_ID'),
  walletAddress: required('ONESHOT_PRIVY_WALLET_ADDRESS'),
});
const client = new CircleX402Client({ signer, maxAmountAtomic });

try {
  const quote = await client.quote(url);
  console.log(`Circle x402 quote: ${quote.requirements.amount} atomic USDC`);
  console.log(`Arc Testnet recipient: ${quote.requirements.payTo}`);
  console.log('Mode: Paid API purchase via Circle x402 (separate from direct Arc transfer demo)');
  const result = await client.payOnce({ businessIntentId, url, quote });
  console.log(`x402 response received; settlement: ${result.settlement.transaction}`);
  console.log(`Business Intent: ${result.businessIntentId}`);
} catch (error) {
  if (error instanceof CircleX402AmbiguousError) {
    console.error(
      `x402 outcome is UNKNOWN for ${error.businessIntentId}; reconcile Gateway/Arc evidence before retrying`,
    );
  }
  throw error;
}
