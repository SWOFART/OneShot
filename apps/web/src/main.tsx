import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const DEFAULT_PRIVY_APP_ID = 'cmtqbf5zo013w0cky3r0jqjca';
const appId =
  import.meta.env.MODE === 'test'
    ? (import.meta.env.VITE_PRIVY_APP_ID ?? '')
    : import.meta.env.VITE_PRIVY_APP_ID || DEFAULT_PRIVY_APP_ID;

const PrivyConsole = lazy(async () => {
  const module = await import('./auth/privy-session.js');
  return {
    default: () => (
      <module.PrivyOperatorProvider appId={appId}>
        <App route={window.location.pathname} useOperatorSession={module.usePrivyOperatorSession} />
      </module.PrivyOperatorProvider>
    ),
  };
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found in document');
}

createRoot(container).render(
  <StrictMode>
    {appId ? (
      <Suspense fallback={<p>Loading the console…</p>}>
        <PrivyConsole />
      </Suspense>
    ) : (
      <App route={window.location.pathname} />
    )}
  </StrictMode>,
);
