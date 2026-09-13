#!/usr/bin/env node
/** Gate P6 demo: deterministic, offline, and safe to rerun. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAllInvariantScenarios } from '../apps/worker/dist/index.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const proof = JSON.parse(readFileSync(resolve(root, 'evidence/c06/sanitized-proof.json'), 'utf8'));

function fail(message) {
  console.error(`DEMO FAIL: ${message}`);
  process.exit(1);
}

const results = await runAllInvariantScenarios();
if (results.some((entry) => entry.status !== 'PASS' || !entry.atMostOneSettlementSatisfied)) {
  fail('invariant scenarios did not pass');
}

if (proof.amount_atomic !== '1000000' || proof.settlement?.status !== 'CONFIRMED') {
  fail('recorded 1.00 USDC settlement proof is invalid');
}
if (
  !proof.denials?.length ||
  proof.denials.some((entry) => entry.broadcast_count !== 0 || entry.settlement_count !== 0)
) {
  fail('policy denial proof does not show zero external effects');
}
if (
  proof.recovery?.lost_response_initial_state !== 'UNKNOWN' ||
  proof.recovery?.external_recovery_submissions !== 0 ||
  proof.recovery?.total_settlements_for_intent !== 1
) {
  fail('lost-response recovery proof violates at-most-once settlement');
}

console.log('\nGate P6 demo PASS (testnet evidence + offline invariants)');
console.log('1.00 USDC: CONFIRMED on Arc Testnet (atomic amount 1000000)');
console.log('Privy policy denial: 0 broadcasts, 0 settlements');
console.log('Lost response: UNKNOWN -> reconciled existing payment, 0 replacement submissions');
console.log('No video artifact is included; use docs/DEMO_SCRIPT.md for the live walkthrough.');
