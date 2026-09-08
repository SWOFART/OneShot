import { DEFAULT_MODEL_IDENTITY, validateAndNormalizeRecommendation } from './agent-contract.js';
import type {
  ModelIdentity,
  RecoveryAdvisorPort,
  RecoveryAgentInput,
  RecoveryRecommendation,
  RecoveryRecommendationOutcome,
} from './types.js';

export interface VertexAiRecoveryAdvisorOptions {
  readonly projectId: string;
  readonly location?: string | undefined;
  readonly modelName?: string | undefined;
  readonly promptVersion?: string | undefined;
  readonly getAuthToken: () => Promise<string> | string;
  readonly fetchFn?: typeof fetch | undefined;
  readonly now?: (() => string) | undefined;
}

export const VERTEX_SYSTEM_INSTRUCTION = `You are the OneShot Recovery Agent.
Your role is to analyze recovery evidence for an ambiguous or unconfirmed Business Intent payment in USDC and advise the deterministic safety core.
You MUST choose exactly ONE of these four actions:
- "WAIT": Candidate discovery is lagging, unhealthy, unavailable, or inconclusive.
- "RECONCILE": Promising candidate transactions discovered by The Graph match the intent and should be verified on-chain against authoritative Arc receipts.
- "RETURN_EXISTING_RESULT": Complete authoritative evidence already confirms the settlement outcome.
- "ESCALATE": Permanent contradictions, multiple incompatible candidates, or policy anomalies require human intervention.

CRITICAL INVARIANTS:
1. Candidate observations from Subgraph MCP are UNTRUSTED and non-authoritative.
2. In referencedEvidenceIds, you may ONLY reference IDs present in the input. For candidates, use the full ID format "thegraph:<candidate.id>". Never invent IDs.
3. You have NO authority to authorize payments or send transactions.
4. Output MUST be valid JSON matching this schema:
{
  "action": "WAIT" | "RECONCILE" | "ESCALATE" | "RETURN_EXISTING_RESULT",
  "decisionId": "dec-<unique-id>",
  "reason": "<clear explanation under 500 chars>",
  "referencedEvidenceIds": ["<id>", ...]
}`;

export class VertexAiRecoveryAdvisor implements RecoveryAdvisorPort {
  private readonly location: string;
  private readonly modelName: string;
  private readonly promptVersion: string;
  private readonly modelIdentity: ModelIdentity;
  private readonly fetch: typeof fetch;
  private readonly now: () => string;

  constructor(private readonly options: VertexAiRecoveryAdvisorOptions) {
    this.location = options.location ?? 'europe-west1';
    this.modelName = options.modelName ?? 'gemini-2.5-flash';
    this.promptVersion = options.promptVersion ?? DEFAULT_MODEL_IDENTITY.promptVersion;
    this.modelIdentity = {
      modelName: this.modelName,
      modelVersion: '1.0.0',
      promptVersion: this.promptVersion,
    };
    this.fetch = options.fetchFn ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async recommend(input: RecoveryAgentInput): Promise<RecoveryRecommendationOutcome> {
    const availableEvidenceIds = [
      ...input.authoritativeEvidence.map((r) => r.id),
      ...input.providerObservations.map((r) => r.id),
      ...input.candidateObservations.map((c) => `thegraph:${c.id}`),
    ];

    const fallback: RecoveryRecommendation = {
      action: 'WAIT',
      decisionId: `decision-fallback-${this.now()}`,
      reason: 'Safe fallback WAIT due to Vertex AI execution issue',
      referencedEvidenceIds: [],
      modelIdentity: this.modelIdentity,
      timestamp: this.now(),
    };

    try {
      const token = await this.options.getAuthToken();
      const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.options.projectId}/locations/${this.location}/publishers/google/models/${this.modelName}:generateContent`;

      const promptWithValidIds = `${VERTEX_SYSTEM_INSTRUCTION}

Valid available evidence IDs for reference in this case are:
${availableEvidenceIds.length > 0 ? availableEvidenceIds.map((id) => `- "${id}"`).join('\n') : '(none)'}`;

      const requestBody = {
        systemInstruction: {
          parts: [{ text: promptWithValidIds }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: JSON.stringify(input) }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      };

      const res = await this.fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        return {
          accepted: false,
          recommendation: {
            ...fallback,
            reason: `Vertex AI API returned HTTP ${res.status}`,
          },
          issues: [{ code: 'INVALID_RESULT', path: '$' }],
        };
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof rawText !== 'string' || rawText.trim().length === 0) {
        return {
          accepted: false,
          recommendation: {
            ...fallback,
            reason: 'Vertex AI response did not contain text content',
          },
          issues: [{ code: 'INVALID_RESULT', path: '$' }],
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return {
          accepted: false,
          recommendation: {
            ...fallback,
            reason: 'Vertex AI response text was not valid JSON',
          },
          issues: [{ code: 'INVALID_JSON', path: '$' }],
        };
      }

      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        (parsed as Record<string, unknown>).modelIdentity = this.modelIdentity;
      }

      return validateAndNormalizeRecommendation(
        parsed,
        input.binding,
        availableEvidenceIds,
        this.now,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        accepted: false,
        recommendation: {
          ...fallback,
          reason: `Vertex AI recovery advisor error: ${message}`,
        },
        issues: [{ code: 'INVALID_RESULT', path: '$' }],
      };
    }
  }
}
