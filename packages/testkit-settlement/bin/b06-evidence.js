#!/usr/bin/env node
/**
 * B06 sponsor evidence runner.
 *
 * Verifies the recorded live evidence bundle and prints a sanitized report.
 * Exits non-zero when any section fails, so the bundle cannot be published or
 * cited while a claim is unsupported.
 *
 * Usage:
 *   node bin/b06-evidence.js            # verify the published bundle
 *   node bin/b06-evidence.js --json     # machine-readable report
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditSanitization,
  buildEvidenceReport,
  checkAmbiguityEvidence,
  checkArcEvidence,
  checkMainnetReadiness,
  checkPrivyEvidence,
  formatEvidenceReport,
  parseSettlementProof,
} from '../dist/b06-evidence.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '..', '..');

const REQUIRED_MAINNET_ARTIFACTS = [
  'docs/SAFE_DISABLE_RUNBOOK.md',
  'docs/SERVER_RUNTIME.md',
  'docs/settlement/SETTLEMENT_CONFIG_V1.md',
  'docs/settlement/PROVIDER_SETUP.md',
  'Dockerfile.api',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main() {
  const json = process.argv.includes('--json');
  const indexPath = join(repoRoot, 'evidence', 'b06', 'evidence-index.json');
  const index = readJson(indexPath);
  const proofPath = join(repoRoot, index.settlement_proof);
  const proof = parseSettlementProof(readJson(proofPath));

  const artifacts = REQUIRED_MAINNET_ARTIFACTS.map((path) => ({
    path,
    present: existsSync(join(repoRoot, path)),
  }));

  const sections = [
    checkPrivyEvidence(proof),
    checkArcEvidence(proof),
    checkAmbiguityEvidence(proof),
    checkMainnetReadiness(artifacts),
    auditSanitization({ index, proof }, 'B06 evidence bundle'),
  ];

  const report = buildEvidenceReport(sections, proof.status);

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatEvidenceReport(report)}\n`);
  }

  return report.status === 'PASS' ? 0 : 1;
}

process.exit(main());
