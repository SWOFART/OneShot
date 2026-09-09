import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const appId = import.meta.env.VITE_PRIVY_APP_ID ?? '';

const PrivyConsole = lazy(async () => {
  const module = await import('./auth/privy-session.js');
  return {
    default: () => (
      <module.PrivyOperatorProvider appId={appId}>
        <App useOperatorSession={module.usePrivyOperatorSession} />
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
      <App />
    )}
  </StrictMode>,
);
