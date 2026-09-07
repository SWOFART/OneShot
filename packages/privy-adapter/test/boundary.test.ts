import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPATIBILITY_MANIFEST } from '../src/ports.js';

// Anchored to this file, not the working directory: the suite runs both
// package-locally and from the workspace root, and a relative 'src' resolves
// differently in each.
const SRC_ROOT = resolve(import.meta.dirname, '..', 'src');

/** Every source file in this package. */
function sourceFiles(dir = SRC_ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

// B04.5 requires that no import reaches an A- or C-owned package. Asserted
// here rather than trusted to review, because the import that breaks lane
// independence is the easy one to add by accident.
describe('lane import boundary', () => {
  const FORBIDDEN = [
    '@oneshot/domain',
    '@oneshot/storage-postgres',
    '@oneshot/contracts',
    '@oneshot/testkit-domain',
    '@oneshot/reconciliation',
    '@oneshot/recovery-agent',
    '@oneshot/subgraph-mcp-adapter',
    '@oneshot/testkit-failures',
  ];

  it.each(FORBIDDEN)('does not import %s', (pkg) => {
    for (const file of sourceFiles()) {
      expect(readFileSync(file, 'utf8')).not.toContain(pkg);
    }
  });

  it('imports no other lane package at all', () => {
    // Catches a package name added after this test was written.
    const allowed = new Set(['@oneshot/arc-adapter']);
    for (const file of sourceFiles()) {
      const matches = readFileSync(file, 'utf8').matchAll(/@oneshot\/[a-z-]+/g);
      for (const [name] of matches) {
        expect(allowed).toContain(name);
      }
    }
  });
});

describe('compatibility manifest', () => {
  it('publishes exactly the three frozen ports', () => {
    expect(COMPATIBILITY_MANIFEST.providesPorts).toEqual([
      'AuthorizationPort',
      'SettlementPort',
      'EvidencePort',
    ]);
  });

  it('states what the host must supply', () => {
    expect(COMPATIBILITY_MANIFEST.requiresHostCapabilities.length).toBeGreaterThan(0);
  });

  it('excludes reconciliation and index authority', () => {
    expect(COMPATIBILITY_MANIFEST.doesNotProvide).toContain('reconciliation decisions');
    expect(COMPATIBILITY_MANIFEST.doesNotProvide).toContain('external-index authority');
  });

  it('lists live gaps so fixtures cannot pass as live evidence', () => {
    // Acceptance criterion: live-only gaps must not masquerade as completed
    // evidence.
    expect(COMPATIBILITY_MANIFEST.liveGapsForGateP4.length).toBeGreaterThan(0);
  });
});
