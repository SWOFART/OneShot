import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DemoShell } from './DemoShell.js';
import { isRecoveryScenario } from './fixtures.js';
import './styles.css';

const params = new URLSearchParams(window.location.search);
const requestedScenario = params.get('scenario');
const scenario = isRecoveryScenario(requestedScenario) ? requestedScenario : 'aged-unknown';
const root = document.querySelector('#root');

if (!(root instanceof HTMLElement)) throw new Error('Missing recovery UI root');

createRoot(root).render(
  <StrictMode>
    <DemoShell initialScenario={scenario} />
  </StrictMode>,
);
