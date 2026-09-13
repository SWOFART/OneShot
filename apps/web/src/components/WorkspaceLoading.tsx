import { CommitRing } from '@oneshot/brand';

export function WorkspaceLoading() {
  return (
    <main className="workspace-loading" aria-label="OneShot workspace" aria-busy="true">
      <div className="workspace-loading-card">
        <CommitRing size={48} title="OneShot" />
        <p className="workspace-loading-eyebrow">SECURE WORKSPACE</p>
        <p className="workspace-loading-message" role="status" aria-live="polite">
          Opening workspace…
        </p>
      </div>
    </main>
  );
}
