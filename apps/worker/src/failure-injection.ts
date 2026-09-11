import type { SettlementPort, SettlementContext } from './types.js';
import type { CreateIntentRequest, SettlementResult } from '@oneshot/contracts';

/** Public label used in traces and demo evidence for the controlled fault. */
export const RESPONSE_LOSS_AFTER_BROADCAST = 'DEMO_RESPONSE_LOSS_AFTER_BROADCAST';

/**
 * Drop one confirmed provider response after the provider has crossed its
 * external boundary. The worker catches the thrown error and durably records
 * POSSIBLY_SUBMITTED/UNKNOWN, while the provider request identity remains the
 * recovery key. This hook is inert unless explicitly enabled by the runtime.
 */
export function withResponseLossAfterBroadcast(
  port: SettlementPort,
  enabled: boolean,
): SettlementPort {
  if (!enabled) return port;

  let injected = false;
  const wrapped = Object.create(port) as SettlementPort;
  if (port.getSubmissionIdentity) {
    wrapped.getSubmissionIdentity = port.getSubmissionIdentity.bind(port);
  }
  wrapped.submit = async (
    request: CreateIntentRequest,
    context: SettlementContext,
  ): Promise<SettlementResult> => {
    const result = await port.submit(request, context);
    if (!injected && result.kind === 'CONFIRMED') {
      injected = true;
      throw new Error(RESPONSE_LOSS_AFTER_BROADCAST);
    }
    return result;
  };
  return wrapped;
}
