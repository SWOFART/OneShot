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
} from './contract.js';
import { SettlementDetailsPanel } from './SettlementDetails.js';

export interface SettlementDetailsRouteProps {
  readonly businessIntentId: string;
  readonly client: SettlementClient;
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
export function SettlementDetailsRoute({ businessIntentId, client }: SettlementDetailsRouteProps) {
  const [state, setState] = useState<RouteState>({ kind: 'LOADING' });

  useEffect(() => {
    let active = true;
    setState({ kind: 'LOADING' });

    void client
      .readIntent(businessIntentId)
      .then((intent) => {
        if (!active) return;
        setState({ kind: 'LOADED', view: toSettlementDetailsView(intent) });
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
  }, [businessIntentId, client]);

  if (state.kind === 'LOADING') {
    return (
      <section className="route-state" aria-busy="true">
        <p className="eyebrow">ONESHOT / AUTHORIZATION AND SETTLEMENT</p>
        <h1>Loading settlement details…</h1>
      </section>
    );
  }

  if (state.kind === 'FAILED') {
    return (
      <section className="route-state" role="alert">
        <p className="eyebrow">ONESHOT / AUTHORIZATION AND SETTLEMENT</p>
        <h1>{state.heading}</h1>
        <p>{state.detail}</p>
      </section>
    );
  }

  return <SettlementDetailsPanel view={state.view} />;
}
