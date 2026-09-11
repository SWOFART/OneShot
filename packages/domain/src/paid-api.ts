import { createHash } from 'node:crypto';
import { parseCreatePaidApiRequest, type CreatePaidApiRequest } from '@oneshot/contracts';

function workspaceId(value: string): string {
  if (
    value.length === 0 ||
    value.length > 128 ||
    value.trim() !== value ||
    // eslint-disable-next-line no-control-regex -- Workspace identifiers reject ASCII controls.
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error('workspace_id is invalid');
  }
  return value;
}

export function canonicalPaidApiPayload(
  request: CreatePaidApiRequest,
  resourceUrl: string,
): string {
  const parsed = parseCreatePaidApiRequest(request);
  return JSON.stringify({
    task_key: parsed.task_key,
    tool_id: parsed.tool_id,
    resource_url: resourceUrl,
    method: 'GET',
  });
}

export function paidApiFingerprint(request: CreatePaidApiRequest, resourceUrl: string): string {
  return createHash('sha256')
    .update(canonicalPaidApiPayload(request, resourceUrl), 'utf8')
    .digest('hex');
}

export function derivedPaidApiBusinessIntentId(
  value: string,
  request: CreatePaidApiRequest,
): string {
  const scope = workspaceId(value);
  const parsed = parseCreatePaidApiRequest(request);
  return `intent_${createHash('sha256')
    .update(`${scope}\u0000${parsed.tool_id}\u0000${parsed.task_key}`, 'utf8')
    .digest('hex')}`;
}
