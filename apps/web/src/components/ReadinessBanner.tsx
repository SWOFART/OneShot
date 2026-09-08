import { useEffect, useState } from 'react';

import type { OneShotApiClient, ReadinessResult } from '../api/client.js';

export function ReadinessBanner({ client }: { readonly client: OneShotApiClient }) {
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);

  useEffect(() => {
    let active = true;
    void client.getReadiness().then((result) => {
      if (active) setReadiness(result);
    });
    return () => {
      active = false;
    };
  }, [client]);

  if (readiness === null) return <div className="readiness">Checking backend readiness…</div>;
  if (readiness.status !== 'ok') {
    return <div className="readiness warning">Backend unavailable: {readiness.message}</div>;
  }
  if (readiness.submissions_disabled) {
    return (
      <div className="readiness warning">
        Safe mode: submissions paused; reads and recovery remain available.
      </div>
    );
  }
  return <div className="readiness success">Backend ready · Arc Testnet · USDC</div>;
}
