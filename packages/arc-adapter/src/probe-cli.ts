/**
 * Read-only readiness command (B03.1 §7).
 *
 * Loads configuration from the environment, probes the configured Arc
 * endpoint, and prints a per-check report. It performs no mutation, signs
 * nothing, and prints no credential.
 *
 * This exists because `npm run check` runs unit tests against stubs. Those
 * prove the probe's logic; they say nothing about whether a particular
 * operator's endpoint, chain, and token are correct. Only this command does.
 *
 * Exit codes: 0 ready, 1 not ready.
 */

import { loadSettlementConfig } from './config.js';
import { probeReadiness } from './readiness.js';
import { createViemProbe } from './viem-probe.js';

const SYMBOL: Readonly<Record<string, string>> = {
  PASS: 'PASS   ',
  MISMATCH: 'MISMATCH',
  UNAVAILABLE: 'UNAVAIL',
  SKIPPED: 'SKIP   ',
};

export async function runProbe(env: NodeJS.ProcessEnv): Promise<number> {
  let config;
  try {
    config = loadSettlementConfig(env);
  } catch (error) {
    // Configuration errors name the variable, never its value.
    console.error(`Configuration error: ${(error as Error).message}`);
    return 1;
  }

  console.log(`profile : ${config.profile.id} (chain ${config.profile.chainId})`);
  console.log(`token   : ${config.profile.tokenContract}`);
  console.log(`settle  : ${config.profile.tokenDecimals} decimals`);
  console.log(`gas     : ${config.profile.nativeDecimals} decimals`);
  console.log('');

  const report = await probeReadiness(config, createViemProbe(config));

  for (const check of report.checks) {
    console.log(`${SYMBOL[check.status] ?? check.status}  ${check.name}: ${check.detail}`);
  }

  console.log('');
  if (report.ready) {
    console.log('READY');
    return 0;
  }

  if (report.hasMismatch) {
    // The distinction that matters to whoever is reading this output.
    console.log('NOT READY: identity mismatch. A human must fix the configuration.');
    console.log('Do not retry; a mismatch will not resolve on its own.');
  } else {
    console.log('NOT READY: endpoint unavailable. Configuration may be correct.');
    console.log('Retrying later is reasonable.');
  }
  return 1;
}
