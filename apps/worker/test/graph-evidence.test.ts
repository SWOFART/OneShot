import { describe, expect, it, vi } from 'vitest';
import {
  createRecoverySimulatorComposition,
  type SubgraphMcpRecoveryPort,
} from '@oneshot/reconciliation';
import { IntentLedgerGraphEvidenceCapturePort } from '../src/recovery-bridge.js';

describe('post-commit Graph evidence capture', () => {
  it('records a bounded Graph observation for a confirmed transaction', async () => {
    const composition = createRecoverySimulatorComposition();
    const port = new IntentLedgerGraphEvidenceCapturePort(
      composition.localState,
      composition.subgraphMcp,
      () => '2026-09-13T10:00:00.000Z',
    );

    const evidence = await port.capture({
      businessIntentId: composition.job.businessIntentId,
      transactionHash: `0x${'a'.repeat(64)}`,
      blockNumber: '110',
    });

    expect(evidence).toMatchObject({
      source: 'THE_GRAPH',
      authority_class: 'OBSERVATION',
      freshness: 'FRESH',
      block_number: '112',
    });
    expect(evidence.digest).toMatch(/^graph-capture:[0-9a-f]{64}$/u);
  });

  it('records unavailable evidence when the Graph boundary fails', async () => {
    const composition = createRecoverySimulatorComposition();
    const unavailable: SubgraphMcpRecoveryPort = {
      lookup: vi.fn().mockRejectedValue(new Error('Graph timeout')),
    };
    const port = new IntentLedgerGraphEvidenceCapturePort(
      composition.localState,
      unavailable,
      () => '2026-09-13T10:00:00.000Z',
    );

    await expect(
      port.capture({
        businessIntentId: composition.job.businessIntentId,
        transactionHash: `0x${'b'.repeat(64)}`,
        blockNumber: '111',
      }),
    ).resolves.toMatchObject({
      source: 'THE_GRAPH',
      authority_class: 'OBSERVATION',
      freshness: 'UNAVAILABLE',
    });
  });
});
