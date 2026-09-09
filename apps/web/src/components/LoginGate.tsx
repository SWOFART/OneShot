import { useState, type ReactNode } from 'react';
import type { OperatorSession } from '../auth/session.js';

export interface LoginGateProps {
  readonly session: OperatorSession;
  readonly machineToken: string;
  readonly onMachineTokenChange: (value: string) => void;
  readonly children: ReactNode;
}

function MachineTokenField(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <details className="machine-token">
      <summary>Machine token (advanced)</summary>
      <label htmlFor="machine-token-input">Machine token</label>
      <input
        id="machine-token-input"
        type="password"
        autoComplete="off"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <small>
        Memory only, never stored. Use the service token issued to the worker and agent clients.
      </small>
    </details>
  );
}

export function LoginGate(props: LoginGateProps) {
  const [copied, setCopied] = useState(false);
  const machineTokenPresent = props.machineToken.trim().length > 0;
  const unlocked = props.session.status === 'SIGNED_IN' || machineTokenPresent;

  async function copySubject(subject: string): Promise<void> {
    try {
      await navigator.clipboard?.writeText(subject);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (!unlocked) {
    return (
      <section className="login-gate" aria-label="Operator sign-in">
        {props.session.status === 'LOADING' ? (
          <p>Checking your session…</p>
        ) : props.session.status === 'UNCONFIGURED' ? (
          <p role="status">
            Privy login is not configured for this build. Set <code>VITE_PRIVY_APP_ID</code> to
            enable it.
          </p>
        ) : (
          <>
            <h2>Operator sign-in</h2>
            <p>The console reads authoritative payment state. Sign in to continue.</p>
            <button type="button" onClick={() => props.session.login()}>
              Sign in with Privy
            </button>
          </>
        )}
        <MachineTokenField value={props.machineToken} onChange={props.onMachineTokenChange} />
      </section>
    );
  }

  return (
    <>
      <section className="operator-identity" aria-label="Operator identity">
        {props.session.status === 'SIGNED_IN' && props.session.subject ? (
          <>
            <span>Signed in as</span>
            <code>{props.session.subject}</code>
            <button type="button" onClick={() => void copySubject(props.session.subject ?? '')}>
              {copied ? 'Copied' : 'Copy DID'}
            </button>
            <small>Add this DID to PRIVY_AUTH_ALLOWED_SUBJECTS to grant console access.</small>
            <button type="button" onClick={() => props.session.logout()}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <span>Using a machine token</span>
            <MachineTokenField value={props.machineToken} onChange={props.onMachineTokenChange} />
          </>
        )}
      </section>
      {props.children}
    </>
  );
}
