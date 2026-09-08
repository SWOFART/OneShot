import { Component, type ReactNode } from 'react';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: error.message || 'Unexpected application error.' };
  }

  override componentDidCatch(error: Error): void {
    console.error('UI boundary caught error:', error.name);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <main className="app-shell">
        <section className="panel notice error" role="alert">
          <h1>Something went wrong</h1>
          <p>{this.state.error}</p>
          <button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </section>
      </main>
    );
  }
}
