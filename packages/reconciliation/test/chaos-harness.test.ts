import { describe, expect, it } from 'vitest';
import {
  CHAOS_SCENARIO_CATALOG,
  evaluateUnknownAge,
  runChaosMatrix,
  runChaosScenario,
} from '../src/index.js';

describe('C03 — Cross-Source Failure Injection Matrix', () => {
  it('executes full chaos scenario catalog and confirms all invariants pass', () => {
    const reports = runChaosMatrix();

    expect(reports.length).toBe(CHAOS_SCENARIO_CATALOG.length);
    expect(reports.length).toBeGreaterThanOrEqual(16);

    for (const report of reports) {
      expect(report.passed).toBe(true);
      expect(report.externalSubmissionCount).toBe(0);
      expect(report.command.settlementPermission).toBe('NEVER');
      expect(report.view.settlementPermission).toBe('NEVER');
    }
  });

  describe('C03.1 — Failure timeline DSL', () => {
    it('holds in UNKNOWN when process killed before submission', () => {
      const scenario = CHAOS_SCENARIO_CATALOG.find((s) => s.id === 'crash-before-submission');
      if (!scenario) throw new Error('Scenario not found');

      const report = runChaosScenario(scenario);
      expect(report.command.commandType).toBe('HOLD_UNKNOWN');
      expect(report.command.targetState).toBe('UNKNOWN');
      expect(report.externalSubmissionCount).toBe(0);
    });

    it('holds in UNKNOWN when response is lost after possible submission', () => {
      const scenario = CHAOS_SCENARIO_CATALOG.find(
        (s) => s.id === 'lost-response-after-submission',
      );
      if (!scenario) throw new Error('Scenario not found');

      const report = runChaosScenario(scenario);
      expect(report.command.commandType).toBe('HOLD_UNKNOWN');
      expect(report.command.targetState).toBe('UNKNOWN');
      expect(report.externalSubmissionCount).toBe(0);
    });
  });

  describe('C03.2 — Graph and Subgraph MCP degradation suite', () => {
    it('handles empty results, lagging heads, and provider errors safely', () => {
      const degradedIds = [
        'mcp-empty-fresh',
        'mcp-lagging-head',
        'mcp-provider-health-error',
        'mcp-wrong-tool-deployment',
        'mcp-oversized-result',
        'mcp-hostile-injection',
        'mcp-delayed-result',
        'mcp-missing-freshness',
        'mcp-query-failure',
        'mcp-duplicate-events',
        'mcp-out-of-order-events',
        'mcp-malformed-result',
      ];

      for (const id of degradedIds) {
        const scenario = CHAOS_SCENARIO_CATALOG.find((s) => s.id === id);
        if (!scenario) throw new Error(`Scenario not found: ${id}`);

        const report = runChaosScenario(scenario);
        expect(report.passed).toBe(true);
        expect(report.command.targetState).toBe('UNKNOWN');
        expect(report.command.settlementPermission).toBe('NEVER');
      }
    });
  });

  describe('C03.3 — Provider/RPC contradiction suite', () => {
    it('resolves UNKNOWN -> FAILED_SAFE when Arc receipt shows definitive revert despite Privy success', () => {
      const scenario = CHAOS_SCENARIO_CATALOG.find(
        (s) => s.id === 'contradiction-privy-success-arc-revert',
      );
      if (!scenario) throw new Error('Scenario not found');

      const report = runChaosScenario(scenario);
      expect(report.command.commandType).toBe('MARK_FAILED_SAFE');
      expect(report.command.targetState).toBe('FAILED_SAFE');
      expect(report.externalSubmissionCount).toBe(0);
    });

    it('escalates and holds in UNKNOWN when transfer details mismatch intent binding', () => {
      const mismatchIds = ['contradiction-recipient-mismatch', 'contradiction-amount-mismatch'];

      for (const id of mismatchIds) {
        const scenario = CHAOS_SCENARIO_CATALOG.find((s) => s.id === id);
        if (!scenario) throw new Error(`Scenario not found: ${id}`);

        const report = runChaosScenario(scenario);
        expect(report.command.commandType).toBe('ESCALATE_UNKNOWN');
        expect(report.command.targetState).toBe('UNKNOWN');
        expect(report.view.contradiction).toBe(true);
        expect(report.externalSubmissionCount).toBe(0);
      }
    });
  });

  describe('C03.4 — Restart and evidence replay', () => {
    it('yields strictly identical command and view on replay with recorded seed', () => {
      const scenario = CHAOS_SCENARIO_CATALOG.find((s) => s.id === 'restart-between-transitions');
      if (!scenario) throw new Error('Scenario not found');

      const first = runChaosScenario(scenario);
      const second = runChaosScenario(scenario);

      expect(second.command).toEqual(first.command);
      expect(second.view.coreDisposition).toBe(first.view.coreDisposition);
      expect(second.passed).toBe(true);
    });
  });

  describe('C03.5 — Agent failure, UNKNOWN aging, and escalation', () => {
    it('fails closed to WAIT on unsupported actions or fabricated bindings', () => {
      const failureIds = [
        'agent-unsupported-action',
        'agent-fabricated-evidence-id',
        'agent-unverified-return-existing-result',
        'agent-malformed-output',
        'agent-timeout',
        'agent-nondeterministic-prose',
      ];

      for (const id of failureIds) {
        const scenario = CHAOS_SCENARIO_CATALOG.find((s) => s.id === id);
        if (!scenario) throw new Error(`Scenario not found: ${id}`);

        const report = runChaosScenario(scenario);
        expect(report.command.commandType).toBe('HOLD_UNKNOWN');
        expect(report.command.targetState).toBe('UNKNOWN');
        expect(report.externalSubmissionCount).toBe(0);
      }
    });

    it('evaluates UNKNOWN intent age buckets correctly', () => {
      const now = new Date('2026-09-07T12:00:00.000Z');

      // 2 minutes old -> FRESH
      const freshPersisted = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
      const freshEval = evaluateUnknownAge('intent-1', freshPersisted, now.toISOString());
      expect(freshEval.bucket).toBe('FRESH');
      expect(freshEval.alertRequired).toBe(false);

      // 15 minutes old -> STALE
      const stalePersisted = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
      const staleEval = evaluateUnknownAge('intent-2', stalePersisted, now.toISOString());
      expect(staleEval.bucket).toBe('STALE');
      expect(staleEval.alertRequired).toBe(true);

      // 90 minutes old -> CRITICAL
      const criticalPersisted = new Date(now.getTime() - 90 * 60 * 1000).toISOString();
      const criticalEval = evaluateUnknownAge('intent-3', criticalPersisted, now.toISOString());
      expect(criticalEval.bucket).toBe('CRITICAL');
      expect(criticalEval.alertRequired).toBe(true);
      expect(criticalEval.recommendation).toContain('CRITICAL');
    });
  });
});
