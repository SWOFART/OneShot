import type {
  DetailedRecoveryView,
  ReconciliationCommand,
  ReconciliationCommandType,
} from '../types.js';

export const CHAOS_TIMELINE_VERSION = 'chaos-timeline-v1' as const;

export type InjectionPoint = 'BEFORE_SUBMISSION' | 'POSSIBLY_SUBMITTED' | 'CONFIRMED';

export type FailureEventType =
  'PROCESS_KILL' | 'TIMEOUT' | 'DISCONNECT' | 'RESPONSE_LOSS' | 'DELAYED_EVIDENCE' | 'RESTART';

export type McpDegradationType =
  | 'DELAYED_RESULT'
  | 'EMPTY_RESULT'
  | 'LAGGING_HEAD'
  | 'PROVIDER_HEALTH_ERROR'
  | 'OMIT_FRESHNESS_METADATA'
  | 'QUERY_FAILURE'
  | 'DUPLICATE_EVENTS'
  | 'OUT_OF_ORDER_EVENTS'
  | 'WRONG_DEPLOYMENT'
  | 'WRONG_TOOL'
  | 'OVERSIZED_RESULT'
  | 'MALFORMED_RESULT'
  | 'PROMPT_INJECTION_TEXT';

export interface FailureEvent {
  readonly type: FailureEventType;
  readonly atStep: number;
  readonly description: string;
}

export interface McpDegradation {
  readonly type: McpDegradationType;
  readonly description: string;
}

export interface ContradictionSetup {
  readonly privyStatus?:
    'PENDING' | 'SUCCEEDED' | 'FAILED' | 'NOT_FOUND' | 'UNAVAILABLE' | undefined;
  readonly arcStatus?: 'PENDING' | 'SUCCESS' | 'REVERT' | 'NOT_FOUND' | 'UNAVAILABLE' | undefined;
  readonly recipientMismatch?: boolean | undefined;
  readonly tokenMismatch?: boolean | undefined;
  readonly amountMismatch?: boolean | undefined;
  readonly networkMismatch?: boolean | undefined;
}

export interface ChaosScenario {
  readonly id: string;
  readonly name: string;
  readonly seed: number;
  readonly injectionPoint: InjectionPoint;
  readonly failureEvents: readonly FailureEvent[];
  readonly mcpDegradations: readonly McpDegradation[];
  readonly contradictionSetup?: ContradictionSetup | undefined;
  readonly agentScenario?:
    | 'wait'
    | 'reconcile'
    | 'escalate'
    | 'return-existing-result'
    | 'unsupported-action'
    | 'malformed-output'
    | 'prompt-injection'
    | 'fabricated-binding'
    | 'auto'
    | undefined;
  readonly expectedTargetState: 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
  readonly expectedCommandType: ReconciliationCommandType;
  readonly expectedSettlementPermission: 'NEVER';
  readonly expectedExternalSubmissions: 0;
}

export interface ChaosExecutionReport {
  readonly scenarioId: string;
  readonly name: string;
  readonly seed: number;
  readonly passed: boolean;
  readonly command: ReconciliationCommand;
  readonly view: DetailedRecoveryView;
  readonly externalSubmissionCount: number;
  readonly diagnostics: readonly string[];
}

export type AgeBucket = 'FRESH' | 'STALE' | 'CRITICAL';

export interface UnknownAgeEvaluation {
  readonly intentId: string;
  readonly ageMs: number;
  readonly bucket: AgeBucket;
  readonly alertRequired: boolean;
  readonly recommendation: string;
}
