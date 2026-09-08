import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { isRecoveryScenario } from './fixtures.js';
import { createRecoveryClient } from './mock-server.js';
import { RecoveryRoute } from './RecoveryRoute.js';
import './styles.css';

const params = new URLSearchParams(window.location.search);
const requestedScenario = params.get('scenario');
const scenario = isRecoveryScenario(requestedScenario) ? requestedScenario : 'aged-unknown';
const root = document.querySelector('#root');

if (!(root instanceof HTMLElement)) throw new Error('Missing recovery UI root');

createRoot(root).render(
  <StrictMode>
    <RecoveryRoute
      businessIntentId="intent_demo_018f"
      client={createRecoveryClient({ scenario })}
    />
  </StrictMode>,
);
