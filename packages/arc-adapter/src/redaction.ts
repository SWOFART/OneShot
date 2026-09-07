/**
 * Sanitized fixture and log boundary (B01.6).
 *
 * `.agent/SECURITY_INVARIANTS.md` forbids logging, persisting, committing, or
 * transmitting credentials or signing material. Fixtures are committed to a
 * public repository and are shown to external reviewers, so the redaction rule
 * is enforced in code and tested, not left to reviewer discipline.
 *
 * The design is deny-by-default: a key is emitted only when its name is known
 * to be safe. A new provider field that nobody has classified yet is redacted
 * rather than leaked, which is the safe direction to be wrong in.
 */

/** Replacement written in place of any redacted value. */
export const REDACTED = '[REDACTED]';

/**
 * Key names that must never appear in a fixture, log, or evidence record.
 *
 * Matched case-insensitively as a substring after separators are stripped, so
 * `privyAppSecret`, `PRIVY_APP_SECRET`, `x-api-key`, and
 * `authorization_signature` are all caught by the same entry.
 */
export const FORBIDDEN_KEY_PATTERNS: readonly string[] = [
  'secret',
  'password',
  'passphrase',
  'token',
  'apikey',
  'authorization',
  'auth',
  'cookie',
  'session',
  'credential',
  'privatekey',
  'signingkey',
  'seed',
  'mnemonic',
  'signature',
  'sig',
  'jwt',
  'bearer',
  'keystore',
];

/**
 * Value shapes that look like credential material regardless of their key.
 *
 * Catches a secret that arrives under an innocent-looking name.
 */
const FORBIDDEN_VALUE_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, // JWT
  /\bBearer\s+[A-Za-z0-9._-]{10,}/i,
  /\b0x[a-fA-F0-9]{64}\b/, // 32-byte hex: private key or signing material
];

/**
 * Strip case and separators so one pattern covers every spelling a provider
 * might use. Without this, `x-api-key` slips past an `apikey` pattern.
 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function keyIsForbidden(key: string): boolean {
  const normalized = normalizeKey(key);
  return FORBIDDEN_KEY_PATTERNS.some((pattern) => normalized.includes(normalizeKey(pattern)));
}

function valueLooksLikeSecret(value: string): boolean {
  return FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Recursively redact a value for fixture capture or logging.
 *
 * Redacts on a forbidden key name, on secret-shaped content, and on excessive
 * depth. Depth is bounded because a hostile or malformed provider response must
 * not be able to exhaust the stack inside the logging path.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) return REDACTED;

  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return valueLooksLikeSecret(value) ? REDACTED : value;
  }

  if (typeof value === 'bigint') return value.toString(10);

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = keyIsForbidden(key) ? REDACTED : redact(entry, depth + 1);
    }
    return out;
  }

  // Functions, symbols, and anything else unrecognized are never emitted.
  return REDACTED;
}

/**
 * Assert that a candidate fixture carries no credential material.
 *
 * Used as a test guard on every committed fixture so a leak fails the suite
 * instead of reaching the repository.
 */
export function assertNoSecrets(value: unknown, path = '$'): void {
  if (value === null || value === undefined) return;

  if (typeof value === 'string') {
    if (valueLooksLikeSecret(value)) {
      throw new Error(`Secret-shaped value found at ${path}.`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertNoSecrets(entry, `${path}[${index}]`);
    });
    return;
  }

  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (keyIsForbidden(key)) {
        if (entry !== REDACTED) {
          throw new Error(`Forbidden key "${key}" at ${path} is not redacted.`);
        }
        continue;
      }
      assertNoSecrets(entry, `${path}.${key}`);
    }
  }
}
