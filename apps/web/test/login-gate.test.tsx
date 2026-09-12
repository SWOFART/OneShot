import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoginGate } from '../src/components/LoginGate.js';
import { fakeSession, signedInSession } from './support/fake-session.js';

afterEach(cleanup);

const CONSOLE_TEXT = 'console contents';

describe('LoginGate', () => {
  it('hides the console and offers Privy sign-in when signed out', () => {
    render(
      <LoginGate session={fakeSession()} machineToken="" onMachineTokenChange={() => {}}>
        <p>{CONSOLE_TEXT}</p>
      </LoginGate>,
    );
    expect(screen.queryByText(CONSOLE_TEXT)).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in with Privy' })).toBeTruthy();
  });

  it('calls login when the sign-in button is pressed', async () => {
    const login = vi.fn();
    const user = userEvent.setup();
    render(
      <LoginGate session={fakeSession({ login })} machineToken="" onMachineTokenChange={() => {}}>
        <p>{CONSOLE_TEXT}</p>
      </LoginGate>,
    );
    await user.click(screen.getByRole('button', { name: 'Sign in with Privy' }));
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('shows the console and masks the session identifier when signed in', () => {
    render(
      <LoginGate
        session={signedInSession('did:privy:abc123')}
        machineToken=""
        onMachineTokenChange={() => {}}
      >
        <p>{CONSOLE_TEXT}</p>
      </LoginGate>,
    );
    expect(screen.getByText(CONSOLE_TEXT)).toBeTruthy();
    expect(screen.getByText('PRIVY CONNECTED')).toBeTruthy();
    expect(screen.getByText('Workspace session active')).toBeTruthy();
    expect(screen.queryByText('did:privy:abc123')).toBeNull();
  });

  it('never renders the access token', () => {
    const { container } = render(
      <LoginGate
        session={signedInSession('did:privy:abc123', 'secret.token.value')}
        machineToken=""
        onMachineTokenChange={() => {}}
      >
        <p>{CONSOLE_TEXT}</p>
      </LoginGate>,
    );
    expect(container.textContent).not.toContain('secret.token.value');
  });

  it('explains that Privy is not configured and still allows a machine token', async () => {
    const onMachineTokenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <LoginGate
        session={fakeSession({ status: 'UNCONFIGURED' })}
        machineToken=""
        onMachineTokenChange={onMachineTokenChange}
      >
        <p>{CONSOLE_TEXT}</p>
      </LoginGate>,
    );
    expect(screen.getByText(/Privy login is not configured/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in with Privy' })).toBeNull();
    await user.type(screen.getByLabelText('Machine token'), 'x');
    expect(onMachineTokenChange).toHaveBeenCalled();
  });

  it('unlocks the console when a machine token is present', () => {
    render(
      <LoginGate
        session={fakeSession({ status: 'UNCONFIGURED' })}
        machineToken="service-token"
        onMachineTokenChange={() => {}}
      >
        <p>{CONSOLE_TEXT}</p>
      </LoginGate>,
    );
    expect(screen.getByText(CONSOLE_TEXT)).toBeTruthy();
  });

  it('shows a loading state while the session resolves', () => {
    render(
      <LoginGate
        session={fakeSession({ status: 'LOADING' })}
        machineToken=""
        onMachineTokenChange={() => {}}
      >
        <p>{CONSOLE_TEXT}</p>
      </LoginGate>,
    );
    expect(screen.queryByText(CONSOLE_TEXT)).toBeNull();
    expect(screen.getByText(/Checking your session/i)).toBeTruthy();
  });

  it('always uses the native Privy login button when signed out', () => {
    const session = {
      status: 'SIGNED_OUT' as const,
      subject: null,
      accessToken: null,
      login: vi.fn(),
      logout: vi.fn(),
    };
    render(
      <LoginGate session={session} machineToken="" onMachineTokenChange={() => undefined}>
        <p>console</p>
      </LoginGate>,
    );
    expect(screen.getByRole('button', { name: 'Sign in with Privy' })).not.toBeNull();
    expect(screen.queryByRole('searchbox', { name: /search wallets/iu })).toBeNull();
  });
});
