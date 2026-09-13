export const SPONSORS = ['PRIVY', 'ARC', 'THE_GRAPH'] as const;
export type Sponsor = (typeof SPONSORS)[number];

export const QUALIFICATION_VERDICTS = ['QUALIFIED', 'NOT_QUALIFIED', 'NOT_VERIFIED'] as const;
export type QualificationVerdict = (typeof QUALIFICATION_VERDICTS)[number];

export type QualificationCheckState = 'PASS' | 'FAIL' | 'MISSING';
export type QualificationEvidenceType = 'LIVE_CAPTURE' | 'CODE_TEST' | 'SIMULATOR' | 'PLAN';

export const QUALIFICATION_CHECK_IDS = [
  'SANITIZED_EVIDENCE',
  'AT_MOST_ONE_SETTLEMENT',
  'PRIVY_CORPORATE_WALLET_AUTHORIZATION',
  'PRIVY_POLICY_NORMAL_PATH',
  'PRIVY_DENIAL_ZERO_SETTLEMENT',
  'ARC_REAL_TESTNET_USDC',
  'ARC_EXACT_RECEIPT_TRANSFER',
  'ARC_DURABLE_SETTLEMENT_IDENTITY',
  'GRAPH_PINNED_LIVE_DEPLOYMENT',
  'GRAPH_SUBGRAPH_MCP_TRACE',
  'GRAPH_HASHLESS_DISCOVERY',
  'GRAPH_LLM_MATERIAL_USE',
  'GRAPH_ARC_CANDIDATE_VERIFICATION',
  'GRAPH_DETERMINISTIC_CORE_ZERO_SUBMIT',
] as const;
export type QualificationCheckId = (typeof QUALIFICATION_CHECK_IDS)[number];

export interface QualificationEvidenceCheck {
  readonly state: QualificationCheckState;
  readonly evidenceType: QualificationEvidenceType;
  readonly evidenceRef: string | null;
  readonly note: string;
}

export type QualificationEvidenceInput = Partial<
  Readonly<Record<QualificationCheckId, QualificationEvidenceCheck>>
>;

export interface SponsorQualificationResult {
  readonly sponsor: Sponsor;
  readonly verdict: QualificationVerdict;
  readonly passed: readonly QualificationCheckId[];
  readonly failed: readonly QualificationCheckId[];
  readonly missing: readonly QualificationCheckId[];
  readonly diagnostics: readonly string[];
}

export interface QualificationReport {
  readonly schemaVersion: 'sponsor-qualification-v1';
  readonly results: Readonly<Record<Sponsor, SponsorQualificationResult>>;
}

interface CheckRequirement {
  readonly id: QualificationCheckId;
  readonly acceptedEvidence: readonly QualificationEvidenceType[];
}

const codeOrLive = ['CODE_TEST', 'LIVE_CAPTURE'] as const;
const liveOnly = ['LIVE_CAPTURE'] as const;

const REQUIREMENTS: Readonly<Record<Sponsor, readonly CheckRequirement[]>> = {
  PRIVY: [
    { id: 'SANITIZED_EVIDENCE', acceptedEvidence: codeOrLive },
    { id: 'AT_MOST_ONE_SETTLEMENT', acceptedEvidence: codeOrLive },
    { id: 'PRIVY_CORPORATE_WALLET_AUTHORIZATION', acceptedEvidence: liveOnly },
    { id: 'PRIVY_POLICY_NORMAL_PATH', acceptedEvidence: liveOnly },
    { id: 'PRIVY_DENIAL_ZERO_SETTLEMENT', acceptedEvidence: liveOnly },
  ],
  ARC: [
    { id: 'SANITIZED_EVIDENCE', acceptedEvidence: codeOrLive },
    { id: 'AT_MOST_ONE_SETTLEMENT', acceptedEvidence: codeOrLive },
    { id: 'ARC_REAL_TESTNET_USDC', acceptedEvidence: liveOnly },
    { id: 'ARC_EXACT_RECEIPT_TRANSFER', acceptedEvidence: liveOnly },
    { id: 'ARC_DURABLE_SETTLEMENT_IDENTITY', acceptedEvidence: liveOnly },
  ],
  THE_GRAPH: [
    { id: 'SANITIZED_EVIDENCE', acceptedEvidence: codeOrLive },
    { id: 'AT_MOST_ONE_SETTLEMENT', acceptedEvidence: codeOrLive },
    { id: 'GRAPH_PINNED_LIVE_DEPLOYMENT', acceptedEvidence: liveOnly },
    { id: 'GRAPH_SUBGRAPH_MCP_TRACE', acceptedEvidence: liveOnly },
    { id: 'GRAPH_HASHLESS_DISCOVERY', acceptedEvidence: liveOnly },
    { id: 'GRAPH_LLM_MATERIAL_USE', acceptedEvidence: liveOnly },
    { id: 'GRAPH_ARC_CANDIDATE_VERIFICATION', acceptedEvidence: liveOnly },
    { id: 'GRAPH_DETERMINISTIC_CORE_ZERO_SUBMIT', acceptedEvidence: liveOnly },
  ],
};

function assessSponsor(
  sponsor: Sponsor,
  input: QualificationEvidenceInput,
): SponsorQualificationResult {
  const passed: QualificationCheckId[] = [];
  const failed: QualificationCheckId[] = [];
  const missing: QualificationCheckId[] = [];
  const diagnostics: string[] = [];

  for (const requirement of REQUIREMENTS[sponsor]) {
    const check = input[requirement.id];
    if (check === undefined || check.state === 'MISSING') {
      missing.push(requirement.id);
      continue;
    }
    if (!requirement.acceptedEvidence.includes(check.evidenceType)) {
      missing.push(requirement.id);
      diagnostics.push(`${requirement.id}: ${check.evidenceType} is not qualifying evidence`);
      continue;
    }
    if (check.evidenceRef === null || check.evidenceRef.trim().length === 0) {
      missing.push(requirement.id);
      diagnostics.push(`${requirement.id}: qualifying evidence reference is missing`);
      continue;
    }
    if (check.state === 'FAIL') failed.push(requirement.id);
    else passed.push(requirement.id);
  }

  return {
    sponsor,
    verdict:
      failed.length > 0 ? 'NOT_QUALIFIED' : missing.length > 0 ? 'NOT_VERIFIED' : 'QUALIFIED',
    passed,
    failed,
    missing,
    diagnostics,
  };
}

export function assessSponsorQualification(input: QualificationEvidenceInput): QualificationReport {
  return {
    schemaVersion: 'sponsor-qualification-v1',
    results: {
      PRIVY: assessSponsor('PRIVY', input),
      ARC: assessSponsor('ARC', input),
      THE_GRAPH: assessSponsor('THE_GRAPH', input),
    },
  };
}

export function renderQualificationMarkdown(report: QualificationReport): string {
  const lines = [
    '| Sponsor | Verdict | Passed | Failed | Missing |',
    '| --- | --- | ---: | ---: | ---: |',
  ];
  for (const sponsor of SPONSORS) {
    const result = report.results[sponsor];
    lines.push(
      `| ${sponsor} | ${result.verdict} | ${result.passed.length} | ${result.failed.length} | ${result.missing.length} |`,
    );
  }
  return lines.join('\n');
}
