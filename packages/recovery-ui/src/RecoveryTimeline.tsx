import { useMemo, useState } from 'react';

import type {
  EvidenceSummary,
  GraphObservationSummary,
  RecoveryActionReceipt,
  RecoveryTimelinePage,
} from './contract.js';
import { authorityLabel, formatUtc, mergeTimelinePages } from './timeline.js';

export interface RecoveryTimelineProps {
  readonly pages: readonly RecoveryTimelinePage[];
  readonly onRefresh: () => Promise<RecoveryActionReceipt>;
  readonly onEscalate: () => Promise<RecoveryActionReceipt>;
  readonly onLoadMore: (() => Promise<void>) | null;
}

const SOURCE_LABELS: Readonly<Record<EvidenceSummary['source'], string>> = {
  ONESHOT: 'OneShot',
  PRIVY: 'Privy',
  ARC: 'Arc',
  THE_GRAPH: 'The Graph',
  LLM: 'Recovery agent',
};

function stateTone(state: RecoveryTimelinePage['authoritativeState']): string {
  if (state === 'COMMITTED') return 'success';
  if (state === 'FAILED_SAFE') return 'neutral';
  return 'warning';
}

function shortHash(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function EvidenceCard({ evidence }: { readonly evidence: EvidenceSummary }) {
  return (
    <article className={`evidence-card authority-${evidence.authorityClass.toLowerCase()}`}>
      <div className="card-heading">
        <span className="source-mark" aria-hidden="true">
          {SOURCE_LABELS[evidence.source].slice(0, 1)}
        </span>
        <div>
          <h3>{SOURCE_LABELS[evidence.source]}</h3>
          <p className="eyebrow">{authorityLabel(evidence.authorityClass)}</p>
        </div>
        <span className={evidence.verifiedBinding ? 'binding-ok' : 'binding-warning'}>
          {evidence.verifiedBinding ? 'Binding verified' : 'Binding unverified'}
        </span>
      </div>
      <p>{evidence.summary}</p>
      <dl className="compact-facts">
        <div>
          <dt>Retrieved</dt>
          <dd>{formatUtc(evidence.retrievedAt)}</dd>
        </div>
        {evidence.blockNumber !== null && (
          <div>
            <dt>Block</dt>
            <dd>{evidence.blockNumber}</dd>
          </div>
        )}
        {evidence.finality !== null && (
          <div>
            <dt>Finality</dt>
            <dd>{evidence.finality}</dd>
          </div>
        )}
        <div>
          <dt>Digest</dt>
          <dd>{shortHash(evidence.digest)}</dd>
        </div>
      </dl>
      {evidence.contradictionCodes.length > 0 && (
        <p className="contradiction" role="alert">
          Contradiction: {evidence.contradictionCodes.join(', ')}
        </p>
      )}
    </article>
  );
}

function observationCopy(graph: GraphObservationSummary): string {
  if (!graph.available || graph.health === 'UNAVAILABLE') return 'Subgraph MCP unavailable.';
  if (graph.observedThroughBlock === null) return 'Observation height unavailable.';
  if (graph.candidateCount === 0) {
    return `Not observed through block ${graph.observedThroughBlock}. This is not settlement evidence.`;
  }
  return `${graph.candidateCount} candidate${graph.candidateCount === 1 ? '' : 's'} observed through block ${graph.observedThroughBlock}. Arc verification is still required.`;
}

function GraphPanel({ graph }: { readonly graph: GraphObservationSummary }) {
  return (
    <section className="panel graph-panel" aria-labelledby="graph-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Non-authoritative candidate discovery</p>
          <h2 id="graph-heading">Subgraph MCP</h2>
        </div>
        <span className={`health health-${graph.health.toLowerCase()}`}>{graph.health}</span>
      </div>
      <p className="observation-copy">{observationCopy(graph)}</p>
      <dl className="identity-grid">
        <div>
          <dt>Retrieval path</dt>
          <dd>{graph.retrievalPath}</dd>
        </div>
        <div>
          <dt>Tool</dt>
          <dd>{graph.toolName}</dd>
        </div>
        <div>
          <dt>Server</dt>
          <dd>
            {graph.serverName} · {graph.serverVersion}
          </dd>
        </div>
        <div>
          <dt>Deployment</dt>
          <dd>{shortHash(graph.deploymentId)}</dd>
        </div>
        <div>
          <dt>Observed through</dt>
          <dd>{graph.observedThroughBlock ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Chain head / lag</dt>
          <dd>
            {graph.chainHeadBlock ?? 'Unknown'} / {graph.lagBlocks ?? 'Unknown'} blocks
          </dd>
        </div>
      </dl>
      {graph.diagnostics.length > 0 && (
        <ul className="diagnostic-list" aria-label="Subgraph MCP diagnostics">
          {graph.diagnostics.map((diagnostic) => (
            <li key={diagnostic}>{diagnostic}</li>
          ))}
        </ul>
      )}
      {graph.candidates.length > 0 && (
        <div className="candidate-list">
          {graph.candidates.map((candidate) => (
            <article className="candidate" key={candidate.candidateId}>
              <div>
                <p className="eyebrow">Candidate · Block {candidate.blockNumber}</p>
                <h3>{shortHash(candidate.transactionHash)}</h3>
              </div>
              <span
                className={candidate.bindingStatus === 'MATCH' ? 'binding-ok' : 'binding-warning'}
              >
                {candidate.bindingStatus}
              </span>
              {candidate.contradictionCodes.length > 0 && (
                <p className="contradiction" role="alert">
                  {candidate.contradictionCodes.join(', ')}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function RecoveryTimeline({
  pages,
  onRefresh,
  onEscalate,
  onLoadMore,
}: RecoveryTimelineProps) {
  const current = pages[0];
  const timeline = useMemo(() => mergeTimelinePages(pages), [pages]);
  const [pendingAction, setPendingAction] = useState<'refresh' | 'escalate' | 'more' | null>(null);
  const [actionMessage, setActionMessage] = useState('');

  if (!current) return null;

  async function runAction(
    action: 'refresh' | 'escalate',
    callback: () => Promise<RecoveryActionReceipt>,
  ): Promise<void> {
    setPendingAction(action);
    try {
      const receipt = await callback();
      setActionMessage(receipt.message);
    } catch {
      setActionMessage('Safe action failed. Authoritative state was not changed.');
    } finally {
      setPendingAction(null);
    }
  }

  async function loadMore(): Promise<void> {
    if (onLoadMore === null) return;
    setPendingAction('more');
    try {
      await onLoadMore();
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="recovery-shell" data-layout="responsive-grid">
      <header className="hero">
        <div>
          <p className="brand">ONESHOT / RECOVERY CONTROL</p>
          <h1>Evidence before action.</h1>
          <p className="lede">One job. Many retries. One settlement.</p>
        </div>
        <dl className="intent-identity" aria-label="Business intent identity">
          <div>
            <dt>Business intent</dt>
            <dd>{current.businessIntentId}</dd>
          </div>
          <div>
            <dt>State version</dt>
            <dd>{current.stateVersion}</dd>
          </div>
        </dl>
      </header>

      <section className={`state-banner tone-${stateTone(current.authoritativeState)}`}>
        <div>
          <p className="eyebrow">Authoritative OneShot state</p>
          <h2>{current.authoritativeState}</h2>
          <p>{current.summary}</p>
        </div>
        <div className="lock-status">
          <span aria-hidden="true">LOCKED</span>
          <strong>New settlement blocked</strong>
          <small>Settlement permission: {current.settlementPermission}</small>
        </div>
      </section>

      {current.contradiction && (
        <div className="warning-strip" role="alert">
          <strong>Contradictory evidence.</strong> {current.contradictionCodes.join(', ')}. Core
          remains authoritative and blocks a new settlement.
        </div>
      )}

      <div className="action-row" aria-label="Safe recovery actions">
        <button
          type="button"
          className="primary-action"
          disabled={pendingAction !== null}
          onClick={() => void runAction('refresh', onRefresh)}
        >
          {pendingAction === 'refresh' ? 'Refreshing…' : 'Refresh status'}
        </button>
        <button
          type="button"
          className="secondary-action"
          disabled={pendingAction !== null}
          onClick={() => void runAction('escalate', onEscalate)}
        >
          {pendingAction === 'escalate' ? 'Escalating…' : 'Escalate to operator'}
        </button>
        <p className="action-note">Read and escalation only. No payment action is available.</p>
        <p className="sr-live" role="status" aria-live="polite">
          {actionMessage}
        </p>
      </div>

      <div className="dashboard-grid">
        <section className="panel timeline-panel" aria-labelledby="timeline-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Durable history</p>
              <h2 id="timeline-heading">Recovery timeline</h2>
            </div>
            <span className="count">{current.page.totalEntries} events</span>
          </div>
          <ol className="timeline">
            {timeline.map((entry) => (
              <li key={entry.eventId}>
                <div className="timeline-rail" aria-hidden="true" />
                <article>
                  <div className="timeline-meta">
                    <span>{entry.kind}</span>
                    <time dateTime={entry.timestamp}>{formatUtc(entry.timestamp)}</time>
                  </div>
                  <h3>{entry.title}</h3>
                  <p>{entry.summary}</p>
                  <p className="authority-label">{authorityLabel(entry.authorityClass)}</p>
                  {entry.duplicateCount > 0 && (
                    <span className="duplicate-note">
                      Duplicate observation collapsed ×{entry.duplicateCount + 1}
                    </span>
                  )}
                  {entry.orderAmbiguous && (
                    <span className="order-note">Clock tie: relative order is uncertain</span>
                  )}
                </article>
              </li>
            ))}
          </ol>
          {onLoadMore !== null && (
            <button
              type="button"
              className="load-more"
              disabled={pendingAction !== null}
              onClick={() => void loadMore()}
            >
              {pendingAction === 'more' ? 'Loading…' : 'Load earlier evidence'}
            </button>
          )}
        </section>

        <div className="side-stack">
          <section className="panel" aria-labelledby="attempts-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Execution history</p>
                <h2 id="attempts-heading">Attempts</h2>
              </div>
              <span className="count">{current.attempts.length}</span>
            </div>
            <ul className="attempt-list">
              {current.attempts.map((attempt) => (
                <li key={attempt.attemptId}>
                  <div>
                    <strong>{attempt.attemptId}</strong>
                    <span>{formatUtc(attempt.createdAt)}</span>
                  </div>
                  <span className="stage">{attempt.stage}</span>
                  {attempt.sanitizedError !== null && <p>{attempt.sanitizedError}</p>}
                </li>
              ))}
            </ul>
          </section>

          <section className="panel decision-panel" aria-labelledby="decision-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Advice and authority stay separate</p>
                <h2 id="decision-heading">Decision split</h2>
              </div>
            </div>
            <div className="decision-grid">
              <article>
                <span>LLM recommendation</span>
                <strong>{current.recommendation.action}</strong>
                <p>{current.recommendation.reason}</p>
                <small>
                  {current.recommendation.accepted ? 'Boundary accepted' : 'Boundary rejected'} ·{' '}
                  {current.recommendation.modelName}
                </small>
              </article>
              <article className="core-decision">
                <span>Deterministic core</span>
                <strong>{current.coreDisposition.commandType}</strong>
                <p>{current.coreDisposition.reason}</p>
                <small>
                  Target: {current.coreDisposition.targetState} · Proof:{' '}
                  {current.coreDisposition.authoritativeProofPresent ? 'present' : 'absent'}
                </small>
              </article>
            </div>
          </section>
        </div>
      </div>

      {current.graph !== null && <GraphPanel graph={current.graph} />}

      <section className="panel" aria-labelledby="evidence-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sanitized provenance</p>
            <h2 id="evidence-heading">Evidence history</h2>
          </div>
          <span className="count">{current.evidence.length} records</span>
        </div>
        <div className="evidence-grid">
          {current.evidence.map((evidence) => (
            <EvidenceCard evidence={evidence} key={evidence.evidenceId} />
          ))}
        </div>
      </section>

      {current.diagnostics.length > 0 && (
        <section className="diagnostics" aria-labelledby="diagnostics-heading">
          <h2 id="diagnostics-heading">Safe diagnostics</h2>
          <ul>
            {current.diagnostics.map((diagnostic) => (
              <li key={diagnostic}>{diagnostic}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
