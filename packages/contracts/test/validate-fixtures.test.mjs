import { describe, expect, it } from 'vitest';
import { validateFixtureDirectory, validateFixtureObject } from '../scripts/validate-fixtures.mjs';

const validFixture = {
  version: 'v1',
  kind: 'intent.accepted',
  intent: {
    business_intent_id: 'fixture-intent',
    recipient: '0x1111111111111111111111111111111111111111',
    amount_atomic: '1250000',
    asset: 'USDC',
    network: 'eip155:5042002',
    purpose: 'Synthetic fixture',
  },
  result_kind: 'ACCEPTED',
  expected: { intent_state: 'AUTHORIZING', external_submission_count: 0 },
};

describe('fixture validation', () => {
  it('validates every committed fixture', async () => {
    await expect(validateFixtureDirectory()).resolves.toHaveLength(9);
  });

  it.each([
    ['unversioned', { ...validFixture, version: undefined }],
    ['float money', { ...validFixture, intent: { ...validFixture.intent, amount_atomic: '1.25' } }],
    ['unknown result', { ...validFixture, result_kind: 'MAGIC_SUCCESS' }],
    ['unexpected field', { ...validFixture, surprise: true }],
    ['sensitive field', { ...validFixture, api_key: 'not-a-real-key' }],
  ])('rejects %s fixtures', (_name, fixture) => {
    expect(() => validateFixtureObject(fixture)).toThrow();
  });
});
