import { useEffect, useState } from 'react';

import type { RecoveryActionReceipt, RecoveryTimelinePage } from './contract.js';
import type { RecoveryClient } from './mock-server.js';
import { RecoveryTimeline } from './RecoveryTimeline.js';

export interface RecoveryRouteProps {
  readonly businessIntentId: string;
  readonly client: RecoveryClient;
}

export function RecoveryRoute({ businessIntentId, client }: RecoveryRouteProps) {
  const [pages, setPages] = useState<readonly RecoveryTimelinePage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void client
      .readPage(businessIntentId, null)
      .then((page) => {
        if (active) setPages([page]);
      })
      .catch(() => {
        if (active) setError('Recovery evidence is unavailable. Authoritative state is unchanged.');
      });
    return () => {
      active = false;
    };
  }, [businessIntentId, client]);

  if (error !== null) {
    return (
      <main className="route-state" role="alert">
        <p className="brand">ONESHOT / RECOVERY CONTROL</p>
        <h1>Evidence unavailable</h1>
        <p>{error}</p>
      </main>
    );
  }
  if (pages.length === 0) {
    return (
      <main className="route-state" aria-busy="true">
        <p className="brand">ONESHOT / RECOVERY CONTROL</p>
        <h1>Loading recovery evidence…</h1>
      </main>
    );
  }

  const nextCursor = pages.at(-1)?.page.nextCursor ?? null;

  async function refresh(): Promise<RecoveryActionReceipt> {
    const receipt = await client.refresh(businessIntentId);
    const page = await client.readPage(businessIntentId, null);
    setPages([page]);
    return receipt;
  }

  async function loadMore(): Promise<void> {
    if (nextCursor === null) return;
    const page = await client.readPage(businessIntentId, nextCursor);
    setPages((current) => [...current, page]);
  }

  return (
    <RecoveryTimeline
      pages={pages}
      onRefresh={refresh}
      onEscalate={() => client.escalate(businessIntentId)}
      onLoadMore={nextCursor === null ? null : loadMore}
    />
  );
}
