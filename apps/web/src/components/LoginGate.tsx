import { useState, type ReactNode } from 'react';
import type { OperatorSession } from '../auth/session.js';
import { WalletPicker } from './WalletPicker.js';

export interface LoginGateProps {
  readonly session: OperatorSession;
  readonly machineToken: string;
  readonly onMachineTokenChange: (value: string) => void;
  readonly showMachineToken?: boolean;
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
  const showMachineToken = props.showMachineToken ?? import.meta.env.MODE === 'test';

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
          <p className="loading-text">Checking your session…</p>
        ) : props.session.status === 'UNCONFIGURED' ? (
          <p role="status" className="gate-unconfigured">
            Privy login is not configured for this build. Set <code>VITE_PRIVY_APP_ID</code> to
            enable it.
          </p>
        ) : props.session.signInWithWallet !== undefined ? (
          <WalletPicker
            signIn={props.session.signInWithWallet}
            onOtherWallet={() => props.session.login()}
            onEmail={() => props.session.login()}
          />
        ) : (
          <div className="gate-action-box">
            <h2>Operator sign-in</h2>
            <p className="gate-subtitle">
              The console reads authoritative payment state. Sign in to continue.
            </p>
            <button type="button" className="btn-privy" onClick={() => props.session.login()}>
              Sign in with Privy
            </button>
          </div>
        )}
        {showMachineToken && (
          <MachineTokenField value={props.machineToken} onChange={props.onMachineTokenChange} />
        )}
      </section>
    );
  }

  return (
    <>
      <section className="operator-identity" aria-label="Operator identity">
        {props.session.status === 'SIGNED_IN' && props.session.subject ? (
          <>
            <span className="operator-badge">OPERATOR</span>
            <span>Signed in as</span>
            <code className="operator-did">{props.session.subject}</code>
            <button
              type="button"
              className="btn-copy"
              onClick={() => void copySubject(props.session.subject ?? '')}
            >
              {copied ? 'Copied' : 'Copy DID'}
            </button>
            <small className="operator-note">Authenticated via Privy Web3 wallet.</small>
            <button type="button" className="btn-signout" onClick={() => props.session.logout()}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <span className="operator-badge">Using a machine token</span>
            {showMachineToken && (
              <MachineTokenField value={props.machineToken} onChange={props.onMachineTokenChange} />
            )}
          </>
        )}
      </section>
      {props.children}
    </>
  );
}
