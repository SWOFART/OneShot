import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DemoShell } from './DemoShell.js';
import { SETTLEMENT_SCENARIOS } from './fixtures.js';
import './styles.css';

const params = new URLSearchParams(window.location.search);
const requested = params.get('scenario');
const scenario =
  requested !== null && Object.hasOwn(SETTLEMENT_SCENARIOS, requested)
    ? requested
    : 'authorized-committed';
const root = document.querySelector('#root');

if (!(root instanceof HTMLElement)) throw new Error('Missing settlement UI root');

createRoot(root).render(
  <StrictMode>
    <DemoShell initialScenario={scenario} />
  </StrictMode>,
);
