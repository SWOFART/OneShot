#!/usr/bin/env node
/** R4 resumable paid-job drill: offline by default, live only by explicit opt-in. */
import { runAllInvariantScenarios } from '../apps/worker/dist/index.js';
import { CHAOS_SCENARIO_CATALOG, runChaosScenario } from '../packages/reconciliation/dist/index.js';

const TESTNET = 'eip155:5042002';
const RESPONSE_LOSS_FAULT = 'DEMO_RESPONSE_LOSS_AFTER_BROADCAST';
const TRACE_VERSION = 'r4-demo-trace-v1';

function fail(message) {
  throw new Error(message);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing required environment variable: ${name}`);
  return value;
}

function atomic(name, fallback) {
  const value = (process.env[name]?.trim() || fallback).trim();
  if (!/^(0|[1-9][0-9]*)$/.test(value)) fail(`${name} must be a canonical atomic amount`);
  return BigInt(value);
}

function boundedInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function safeApiUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('ONESHOT_R4_API_URL must be a valid URL');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    fail('ONESHOT_R4_API_URL must use HTTPS (HTTP is allowed only for loopback)');
  }
  if (url.username || url.password || url.search || url.hash) {
    fail('ONESHOT_R4_API_URL must not contain credentials, query parameters, or fragments');
  }
  return url;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function offlineTrace() {
  const invariantResults = await runAllInvariantScenarios();
  const lostResponse = invariantResults.find((entry) => entry.scenario === 'lost-response');
  const chaosScenario = CHAOS_SCENARIO_CATALOG.find(
    (entry) => entry.id === 'lost-response-after-submission',
  );
  const chaos = chaosScenario ? runChaosScenario(chaosScenario) : undefined;
  if (
    !lostResponse ||
    lostResponse.status !== 'PASS' ||
    !lostResponse.atMostOneSettlementSatisfied ||
    (chaos && (!chaos.passed || chaos.externalSubmissionCount !== 0))
  ) {
    fail('offline response-loss invariants did not pass');
  }
  return {
    schema_version: TRACE_VERSION,
    mode: 'OFFLINE_REHEARSAL',
    status: 'NOT_LIVE',
    fault: RESPONSE_LOSS_FAULT,
    lost_response: {
      initial_state:
        lostResponse.durableFinalState === 'COMMITTED' ? 'UNKNOWN' : lostResponse.durableFinalState,
      final_state: lostResponse.durableFinalState,
      external_settlement_count: lostResponse.externalSettlementCount,
      at_most_one_settlement: lostResponse.atMostOneSettlementSatisfied,
    },
    graph: {
      source: 'SIMULATED_CHAOS_MATRIX',
      live_capture: false,
      external_recovery_submissions: chaos?.externalSubmissionCount ?? 0,
    },
    note: 'Offline rehearsal only; it does not send a transaction or query Studio.',
  };
}

function sanitizeJob(job) {
  if (!job || typeof job !== 'object') return null;
  return {
    job_id: typeof job.job_id === 'string' ? job.job_id : null,
    task_key: typeof job.task_key === 'string' ? job.task_key : null,
    business_intent_id: typeof job.business_intent_id === 'string' ? job.business_intent_id : null,
    payment_state: typeof job.payment_state === 'string' ? job.payment_state : null,
    delivery_state: typeof job.delivery_state === 'string' ? job.delivery_state : null,
    settlement: job.settlement
      ? {
          transaction_hash: job.settlement.transaction_hash,
          block_number: job.settlement.block_number,
          transfer_log_index: job.settlement.transfer_log_index,
        }
      : null,
    result_available: Boolean(job.result),
    result_reference_present: typeof job.result?.result_reference === 'string',
  };
}

function sanitizeIntent(intent) {
  if (!intent || typeof intent !== 'object') return null;
  return {
    business_intent_id:
      typeof intent.business_intent_id === 'string' ? intent.business_intent_id : null,
    state: typeof intent.state === 'string' ? intent.state : null,
    attempt_stages: Array.isArray(intent.attempts)
      ? intent.attempts
          .map((attempt) => attempt?.stage)
          .filter((stage) => typeof stage === 'string')
      : [],
    settlement: intent.settlement
      ? {
          transaction_hash: intent.settlement.transaction_hash,
          block_number: intent.settlement.block_number,
          transfer_log_index: intent.settlement.transfer_log_index,
        }
      : null,
  };
}

function sanitizeActivity(activity) {
  const observation = activity?.observation;
  const payload = observation?.payload;
  return {
    freshness: observation?.freshness ?? null,
    coverage_note: observation?.coverage_note ?? null,
    observed_at: observation?.observed_at ?? null,
    deployment: typeof payload?.deployment === 'string' ? payload.deployment : null,
    recorded_settlement_count: activity?.recorded_settlement_count ?? 0,
    uncertain_job_count: activity?.uncertain_job_count ?? 0,
    unmatched_transfer_count: activity?.unmatched_transfer_count ?? 0,
    transfer_count: Array.isArray(activity?.transfers) ? activity.transfers.length : 0,
  };
}

async function liveRun() {
  if (process.env.ONESHOT_R4_CONFIRM_TESTNET?.trim() !== 'true') {
    fail('ONESHOT_R4_CONFIRM_TESTNET=true is required for live R4');
  }
  if (process.env.ONESHOT_DEMO_RESPONSE_LOSS_AFTER_BROADCAST?.trim() !== 'true') {
    fail('The worker must run with ONESHOT_DEMO_RESPONSE_LOSS_AFTER_BROADCAST=true');
  }

  const baseUrl = safeApiUrl(required('ONESHOT_R4_API_URL'));
  const bearer = required('ONESHOT_R4_API_BEARER_TOKEN');
  const taskKey = required('ONESHOT_R4_TASK_KEY');
  const reportSubject = process.env.ONESHOT_R4_REPORT_SUBJECT?.trim() || 'R4 resumable report';
  const recipient = required('ONESHOT_R4_RECIPIENT');
  const amountAtomic = required('ONESHOT_R4_AMOUNT_ATOMIC');
  if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) fail('ONESHOT_R4_RECIPIENT must be an EVM address');
  if (!/^(0|[1-9][0-9]*)$/.test(amountAtomic) || BigInt(amountAtomic) === 0n) {
    fail('ONESHOT_R4_AMOUNT_ATOMIC must be a positive canonical atomic amount');
  }
  const pollMs = boundedInteger('ONESHOT_R4_POLL_MS', 500, 100, 10_000);
  const timeoutMs = boundedInteger('ONESHOT_R4_TIMEOUT_MS', 120_000, 10_000, 600_000);
  const maxAmount = atomic('ONESHOT_R4_MAX_AMOUNT_ATOMIC', '10000');
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${bearer}`,
  };

  async function request(path, init = {}) {
    const response = await fetch(new URL(path, baseUrl), {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      // The status is enough for a sanitized trace; never print an error body.
    }
    if (!response.ok) fail(`${init.method ?? 'GET'} ${path} failed with HTTP ${response.status}`);
    return body;
  }

  const quote = await request('/v1/jobs/quote', {
    method: 'POST',
    body: JSON.stringify({
      task_key: taskKey,
      tool_id: 'team-report-v1',
      report_subject: reportSubject,
      recipient,
      amount_atomic: amountAtomic,
    }),
  });
  if (
    quote?.network !== TESTNET ||
    quote?.asset !== 'USDC' ||
    typeof quote?.recipient !== 'string' ||
    !/^0x[0-9a-fA-F]{40}$/.test(quote.recipient) ||
    typeof quote?.amount_atomic !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(quote.amount_atomic) ||
    BigInt(quote.amount_atomic) === 0n ||
    BigInt(quote.amount_atomic) > maxAmount
  ) {
    fail('Supplier quote is not a bounded Arc Testnet USDC quote');
  }
  if (
    quote.recipient.toLowerCase() !== recipient.toLowerCase() ||
    quote.amount_atomic !== amountAtomic
  ) {
    fail('Supplier quote does not match the requested recipient and amount');
  }

  let job;
  try {
    job = await request('/v1/jobs', {
      method: 'POST',
      body: JSON.stringify({
        task_key: taskKey,
        tool_id: 'team-report-v1',
        report_subject: reportSubject,
        recipient,
        amount_atomic: amountAtomic,
      }),
    });
  } catch (error) {
    // A lost create response is read-only recovered by task identity; never POST again.
    const listed = await request('/v1/jobs');
    job = Array.isArray(listed?.jobs)
      ? listed.jobs.find((entry) => entry?.task_key === taskKey)
      : null;
    if (!job) fail(`Job creation outcome is unknown; stopped without replay (${error.message})`);
  }
  if (!job?.job_id || !job?.business_intent_id) fail('Job response omitted durable identifiers');

  const snapshots = [];
  let initialUnknown = false;
  let reconcileRequested = false;
  let resumeRequested = false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    job = await request(`/v1/jobs/${encodeURIComponent(job.job_id)}`);
    const intent = await request(`/v1/intents/${encodeURIComponent(job.business_intent_id)}`);
    const snapshot = sanitizeJob(job);
    snapshots.push(snapshot);
    if (
      snapshot.payment_state === 'UNKNOWN' ||
      sanitizeIntent(intent)?.attempt_stages.includes('UNKNOWN')
    ) {
      initialUnknown = true;
    }
    if (snapshot.payment_state === 'UNKNOWN' && !reconcileRequested) {
      reconcileRequested = true;
      try {
        await request(`/v1/intents/${encodeURIComponent(job.business_intent_id)}/reconcile`, {
          method: 'POST',
        });
      } catch {
        // The worker may already have reconciled this idempotent event; keep polling.
      }
    }
    if (snapshot.payment_state === 'COMMITTED') {
      if (
        !resumeRequested &&
        (snapshot.delivery_state === 'NOT_REQUESTED' ||
          snapshot.delivery_state === 'RETRIEVAL_FAILED')
      ) {
        resumeRequested = true;
        try {
          await request(`/v1/jobs/${encodeURIComponent(job.job_id)}/resume`, { method: 'POST' });
        } catch {
          // A lost delivery response is safe to observe by GET; do not repeat the POST.
        }
      }
      if (snapshot.delivery_state === 'AVAILABLE' && snapshot.result_available) break;
    }
    if (snapshot.payment_state === 'FAILED_SAFE') break;
    await delay(pollMs);
  }

  const intent = await request(`/v1/intents/${encodeURIComponent(job.business_intent_id)}`);
  let recovery = null;
  try {
    recovery = await request(
      `/v1/intents/${encodeURIComponent(job.business_intent_id)}/recovery-view`,
    );
  } catch {
    // A missing recovery view is recorded as absent, never treated as proof.
  }
  let activity = null;
  try {
    await request('/v1/activity/refresh', { method: 'POST' });
    activity = await request('/v1/activity');
  } catch {
    try {
      activity = await request('/v1/activity');
    } catch {
      // Studio evidence remains unavailable and the run cannot claim qualification.
    }
  }

  const finalJob = sanitizeJob(job);
  const finalIntent = sanitizeIntent(intent);
  const graph = recovery?.graph_observation
    ? {
        retrieval_path: recovery.graph_observation.retrieval_path,
        deployment_id: recovery.graph_observation.deployment_id,
        health: recovery.graph_observation.health,
        available: recovery.graph_observation.available,
        candidate_count: recovery.graph_observation.candidate_count,
      }
    : sanitizeActivity(activity);
  const graphCaptured = Boolean(
    graph &&
    (graph.retrieval_path === 'STUDIO_GRAPHQL' || graph.deployment) &&
    (graph.deployment_id || graph.deployment) &&
    graph.freshness !== 'UNAVAILABLE' &&
    graph.health !== 'UNAVAILABLE',
  );
  const committedWithResult =
    finalJob?.payment_state === 'COMMITTED' &&
    finalJob.delivery_state === 'AVAILABLE' &&
    finalJob.result_available &&
    finalIntent?.settlement !== null;
  const explicitHold = finalJob?.payment_state === 'UNKNOWN' && !finalIntent?.settlement;
  const status =
    committedWithResult && initialUnknown && graphCaptured
      ? 'PASS'
      : explicitHold
        ? 'HOLD'
        : 'INCOMPLETE';
  return {
    schema_version: TRACE_VERSION,
    mode: 'LIVE_TESTNET',
    status,
    fault: RESPONSE_LOSS_FAULT,
    quote: {
      supplier_id: quote.supplier_id,
      amount_atomic: quote.amount_atomic,
      recipient: quote.recipient,
      network: quote.network,
      asset: quote.asset,
    },
    job: finalJob,
    intent: finalIntent,
    initial_unknown_observed: initialUnknown,
    snapshots,
    graph,
    recovery: recovery
      ? {
          recommended_action: recovery.recommended_action,
          core_disposition: recovery.core_disposition ?? null,
          settlement_permission: recovery.settlement_permission ?? 'NEVER',
        }
      : null,
    runner_payment_requests_after_create: 0,
    graph_capture_required: true,
    note:
      status === 'PASS'
        ? 'Original settlement and supplier result recovered after one labelled response loss.'
        : status === 'HOLD'
          ? 'Held safely: payment remains UNKNOWN and no replacement payment was requested.'
          : 'R4 evidence incomplete; no automatic payment retry was attempted.',
  };
}

try {
  const mode = process.env.ONESHOT_R4_LIVE?.trim() || 'false';
  if (mode !== 'true' && mode !== 'false') fail('ONESHOT_R4_LIVE must be true or false');
  const trace = mode === 'true' ? await liveRun() : await offlineTrace();
  process.stdout.write(`${JSON.stringify(trace, null, 2)}\n`);
  if (trace.status === 'INCOMPLETE') process.exitCode = 2;
} catch (error) {
  process.stderr.write(`R4 DEMO FAIL: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
