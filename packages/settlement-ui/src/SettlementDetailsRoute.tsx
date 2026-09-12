import { useEffect, useState } from 'react';

import {
  SettlementClientError,
  type SettlementClient,
  type SettlementClientFailure,
} from './client.js';
import {
  SanitizationError,
  toSettlementDetailsView,
  type SettlementDetailsView,
  type SettlementViewOptions,
} from './contract.js';
import { SettlementDetailsPanel } from './SettlementDetails.js';

export interface SettlementDetailsRouteProps {
  readonly businessIntentId: string;
  readonly client: SettlementClient;
  /** Explorer hosts this deployment publishes links for. */
  readonly allowedExplorerHosts?: readonly string[];
}

type RouteState =
  | { readonly kind: 'LOADING' }
  | { readonly kind: 'LOADED'; readonly view: SettlementDetailsView }
  | { readonly kind: 'FAILED'; readonly heading: string; readonly detail: string };

const FAILURE_COPY: Readonly<Record<SettlementClientFailure, { heading: string; detail: string }>> =
  {
    INTENT_NOT_FOUND: {
      heading: 'Business Intent not found',
      detail: 'No intent with this identifier exists in OneShot durable state.',
    },
    EVIDENCE_UNAVAILABLE: {
      heading: 'Evidence unavailable',
      detail:
        'Provider and index evidence could not be read. The authoritative OneShot state is unchanged, and unavailable evidence is not proof that no payment happened.',
    },
    UNAUTHORIZED: {
      heading: 'Not authorized',
      detail: 'This session is not permitted to read the intent.',
    },
    TRANSPORT_UNAVAILABLE: {
      heading: 'Service unavailable',
      detail:
        'The OneShot API could not be reached. Nothing about the settlement state can be concluded from this.',
    },
  };

/**
 * Route slot for the B05 slice.
 *
 * Read-only: it fetches one intent and renders it. Failure states describe what
 * is unknown rather than offering a retry that could imply a new settlement.
 */
export function SettlementDetailsRoute({
  businessIntentId,
  client,
  allowedExplorerHosts,
}: SettlementDetailsRouteProps) {
  const [state, setState] = useState<RouteState>({ kind: 'LOADING' });

  useEffect(() => {
    let active = true;
    setState({ kind: 'LOADING' });

    const options: SettlementViewOptions =
      allowedExplorerHosts === undefined ? {} : { allowedExplorerHosts };

    void client
      .readIntent(businessIntentId)
      .then((intent) => {
        if (!active) return;
        setState({ kind: 'LOADED', view: toSettlementDetailsView(intent, options) });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof SettlementClientError) {
          const copy = FAILURE_COPY[error.failure];
          setState({ kind: 'FAILED', heading: copy.heading, detail: copy.detail });
          return;
        }
        if (error instanceof SanitizationError) {
          setState({
            kind: 'FAILED',
            heading: 'Response withheld',
            detail:
              'The API response carried a field this interface refuses to render. Nothing was displayed.',
          });
          return;
        }
        setState({
          kind: 'FAILED',
          heading: 'Settlement details unavailable',
          detail: 'The response could not be read. Authoritative state is unchanged.',
        });
      });

    return () => {
      active = false;
    };
  }, [businessIntentId, client, allowedExplorerHosts]);

  let content;
  if (state.kind === 'LOADING') {
    content = (
      <section className="route-state" aria-busy="true">
        <p className="eyebrow">PAYMENT PROOF · ARC TESTNET</p>
        <h1>Loading settlement details…</h1>
      </section>
    );
  } else if (state.kind === 'FAILED') {
    content = (
      <section className="route-state" role="alert">
        <p className="eyebrow">PAYMENT PROOF · ARC TESTNET</p>
        <h1>{state.heading}</h1>
        <p>{state.detail}</p>
      </section>
    );
  } else {
    content = <SettlementDetailsPanel view={state.view} />;
  }

  return <div className="settlement-slice">{content}</div>;
}
