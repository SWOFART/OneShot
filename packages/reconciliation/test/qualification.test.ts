import { describe, expect, it } from 'vitest';

import {
  assessSponsorQualification,
  QUALIFICATION_CHECK_IDS,
  renderQualificationMarkdown,
  type QualificationCheckId,
  type QualificationEvidenceCheck,
  type QualificationEvidenceInput,
} from '../src/index.js';

const pass = (
  evidenceType: QualificationEvidenceCheck['evidenceType'] = 'LIVE_CAPTURE',
): QualificationEvidenceCheck => ({
  state: 'PASS',
  evidenceType,
  evidenceRef: 'evidence/c06/sanitized-proof.json',
  note: 'Sanitized qualifying evidence.',
});

function completeInput(): QualificationEvidenceInput {
  return Object.fromEntries(
    QUALIFICATION_CHECK_IDS.map((id) => [
      id,
      pass(
        id === 'SANITIZED_EVIDENCE' || id === 'AT_MOST_ONE_SETTLEMENT' ? 'CODE_TEST' : undefined,
      ),
    ]),
  ) as Record<QualificationCheckId, QualificationEvidenceCheck>;
}

describe('C06 sponsor qualification evidence guard', () => {
  it('reports every sponsor NOT_VERIFIED when live proof is absent', () => {
    const report = assessSponsorQualification({
      SANITIZED_EVIDENCE: pass('CODE_TEST'),
      AT_MOST_ONE_SETTLEMENT: pass('CODE_TEST'),
    });

    expect(report.results.PRIVY.verdict).toBe('NOT_VERIFIED');
    expect(report.results.ARC.verdict).toBe('NOT_VERIFIED');
    expect(report.results.THE_GRAPH.verdict).toBe('NOT_VERIFIED');
  });

  it.each(['SIMULATOR', 'PLAN'] as const)(
    'does not accept %s proof for a live Graph requirement',
    (evidenceType) => {
      const report = assessSponsorQualification({
        ...completeInput(),
        GRAPH_SUBGRAPH_MCP_TRACE: pass(evidenceType),
      });

      expect(report.results.THE_GRAPH.verdict).toBe('NOT_VERIFIED');
      expect(report.results.THE_GRAPH.missing).toContain('GRAPH_SUBGRAPH_MCP_TRACE');
      expect(report.results.THE_GRAPH.diagnostics).toContain(
        `GRAPH_SUBGRAPH_MCP_TRACE: ${evidenceType} is not qualifying evidence`,
      );
    },
  );

  it('reports NOT_QUALIFIED for a evidenced live failure', () => {
    const report = assessSponsorQualification({
      ...completeInput(),
      PRIVY_POLICY_NORMAL_PATH: {
        state: 'FAIL',
        evidenceType: 'LIVE_CAPTURE',
        evidenceRef: 'evidence/c06/privy-policy-denial.json',
        note: 'Normal path bypass observed.',
      },
    });

    expect(report.results.PRIVY.verdict).toBe('NOT_QUALIFIED');
    expect(report.results.PRIVY.failed).toEqual(['PRIVY_POLICY_NORMAL_PATH']);
  });

  it('requires a non-empty evidence reference even for PASS', () => {
    const report = assessSponsorQualification({
      ...completeInput(),
      ARC_REAL_TESTNET_USDC: { ...pass(), evidenceRef: '  ' },
    });

    expect(report.results.ARC.verdict).toBe('NOT_VERIFIED');
    expect(report.results.ARC.missing).toContain('ARC_REAL_TESTNET_USDC');
  });

  it('qualifies only when all sponsor-specific requirements have accepted proof', () => {
    const report = assessSponsorQualification(completeInput());

    expect(report.results.PRIVY.verdict).toBe('QUALIFIED');
    expect(report.results.ARC.verdict).toBe('QUALIFIED');
    expect(report.results.THE_GRAPH.verdict).toBe('QUALIFIED');
    expect(renderQualificationMarkdown(report)).toContain('| THE_GRAPH | QUALIFIED |');
  });
});
