import { sha256 } from './query.js';
import type {
  BoundEvidenceRecord,
  ContradictionCode,
  EvidenceBinding,
  IndexView,
  KnownIdentityRecoveryEvidence,
} from './types.js';

function sameBinding(left: EvidenceBinding, right: EvidenceBinding): boolean {
  return (
    left.businessIntentId === right.businessIntentId &&
    left.requestFingerprint === right.requestFingerprint &&
    left.network === right.network &&
    left.tokenContract.toLowerCase() === right.tokenContract.toLowerCase() &&
    left.recipient.toLowerCase() === right.recipient.toLowerCase() &&
    left.amountAtomic === right.amountAtomic
  );
}

export function isAuthoritativeArcProof(
  binding: EvidenceBinding,
  arcEvidence: KnownIdentityRecoveryEvidence['arc'],
): boolean {
  if (arcEvidence === null) return false;
  if (arcEvidence.receiptStatus !== 'SUCCESS') return false;
  if (arcEvidence.finality !== 'FINAL') return false;
  if (arcEvidence.network !== binding.network) return false;
  if (arcEvidence.transfer === null) return false;

  return (
    arcEvidence.transfer.recipient.toLowerCase() === binding.recipient.toLowerCase() &&
    arcEvidence.transfer.tokenContract.toLowerCase() === binding.tokenContract.toLowerCase() &&
    arcEvidence.transfer.amountAtomic === binding.amountAtomic
  );
}

export function isAuthoritativeArcRevert(
  binding: EvidenceBinding,
  arcEvidence: KnownIdentityRecoveryEvidence['arc'],
): boolean {
  if (arcEvidence === null) return false;
  if (arcEvidence.receiptStatus !== 'REVERT') return false;
  if (arcEvidence.finality !== 'FINAL') return false;
  if (arcEvidence.network !== binding.network) return false;

  return true;
}

export interface ExtractedEvidenceBundle {
  readonly records: readonly BoundEvidenceRecord[];
  readonly hasAuthoritativeSuccess: boolean;
  readonly hasAuthoritativeRevert: boolean;
  readonly contradictions: readonly ContradictionCode[];
}

export function buildBoundEvidenceRecords(
  binding: EvidenceBinding,
  evidence: KnownIdentityRecoveryEvidence,
  indexView?: IndexView | null,
): ExtractedEvidenceBundle {
  const records: BoundEvidenceRecord[] = [];
  const contradictions: ContradictionCode[] = [];
  const exactBinding = sameBinding(binding, evidence.binding);

  if (!exactBinding) contradictions.push('UNBOUND_EVIDENCE');

  // 1. Local OneShot durable state
  records.push({
    id: `oneshot:${evidence.binding.businessIntentId}:${evidence.local.stateVersion}`,
    source: 'ONESHOT',
    authorityClass: 'AUTHORITATIVE_ONESHOT',
    binding,
    retrievedAt: evidence.local.persistedAt,
    digest: evidence.local.digest,
    details: {
      settlementState: evidence.local.settlementState,
      stateVersion: evidence.local.stateVersion,
    },
  });

  // 2. Arc on-chain settlement evidence
  let hasAuthoritativeSuccess = false;
  let hasAuthoritativeRevert = false;

  if (evidence.arc !== null) {
    const arc = evidence.arc;
    let arcContradiction = false;

    if (arc.network !== binding.network) {
      contradictions.push('NETWORK_MISMATCH');
      arcContradiction = true;
    }

    if (arc.transfer !== null) {
      if (arc.transfer.tokenContract.toLowerCase() !== binding.tokenContract.toLowerCase()) {
        contradictions.push('TOKEN_MISMATCH');
        arcContradiction = true;
      }
      if (arc.transfer.recipient.toLowerCase() !== binding.recipient.toLowerCase()) {
        contradictions.push('RECIPIENT_MISMATCH');
        arcContradiction = true;
      }
      if (arc.transfer.amountAtomic !== binding.amountAtomic) {
        contradictions.push('AMOUNT_MISMATCH');
        arcContradiction = true;
      }
    } else if (arc.receiptStatus === 'SUCCESS') {
      // SUCCESS without Transfer is contradictory to an expected token transfer
      arcContradiction = true;
    }

    if (arc.submissionReference !== evidence.local.submissionReference) {
      contradictions.push('UNBOUND_EVIDENCE');
      arcContradiction = true;
    }

    if (exactBinding && !arcContradiction) {
      if (isAuthoritativeArcProof(binding, arc)) {
        hasAuthoritativeSuccess = true;
      } else if (isAuthoritativeArcRevert(binding, arc)) {
        hasAuthoritativeRevert = true;
      }
    }

    records.push({
      id: `arc:${arc.transactionHash}`,
      source: 'ARC',
      authorityClass: 'AUTHORITATIVE_CHAIN_EVIDENCE',
      binding,
      retrievedAt: arc.retrievedAt,
      digest: arc.digest,
      finality: arc.finality,
      blockNumber: arc.blockNumber,
      blockHash: arc.blockHash,
      sanitizedReason: arcContradiction
        ? 'Arc transfer details contradict intent binding'
        : undefined,
      details: {
        receiptStatus: arc.receiptStatus,
        transactionHash: arc.transactionHash,
        logIndex: arc.transfer?.logIndex,
      },
    });
  }

  // 3. Privy provider observation
  if (evidence.privy !== null) {
    const privy = evidence.privy;
    const privyContradiction = privy.requestFingerprint !== binding.requestFingerprint;

    records.push({
      id: `privy:${privy.referenceId}`,
      source: 'PRIVY',
      authorityClass: 'PROVIDER_OBSERVATION',
      binding,
      retrievedAt: privy.retrievedAt,
      digest: privy.digest,
      sanitizedReason: privyContradiction ? 'Privy request fingerprint mismatch' : undefined,
      details: {
        referenceId: privy.referenceId,
        requestStatus: privy.requestStatus,
        transactionHash: privy.transactionHash,
      },
    });
  }

  // 4. Subgraph MCP index view candidates
  if (indexView !== null && indexView !== undefined) {
    if (indexView.contradiction) {
      for (const code of indexView.contradictionCodes) {
        if (!contradictions.includes(code)) {
          contradictions.push(code);
        }
      }
    }

    for (const candidate of indexView.candidates) {
      records.push({
        id: `thegraph:${candidate.id}`,
        source: 'THE_GRAPH',
        authorityClass: 'NON_AUTHORITATIVE_CANDIDATE_DISCOVERY',
        binding,
        retrievedAt: indexView.retrievedAt,
        digest: sha256(
          `${candidate.id}:${candidate.transactionHash}:${candidate.logIndex}:${candidate.blockNumber}`,
        ),
        freshness: indexView.health,
        blockNumber: candidate.blockNumber,
        blockHash: candidate.blockHash,
        sanitizedReason:
          candidate.bindingStatus === 'CONTRADICTORY'
            ? `Contradictory candidate: ${candidate.contradictionCodes.join(', ')}`
            : undefined,
        details: {
          transactionHash: candidate.transactionHash,
          logIndex: candidate.logIndex,
          bindingStatus: candidate.bindingStatus,
          memoId: candidate.memoId,
        },
      });
    }
  }

  return {
    records,
    hasAuthoritativeSuccess,
    hasAuthoritativeRevert,
    contradictions,
  };
}
