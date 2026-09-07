import { describe, expect, it } from 'vitest';
import {
  classifyHttpStatus,
  classifyTransportError,
  outcomeForTransportFailure,
  toProviderResponse,
  type PostSendAmbiguity,
  type PreBroadcastFailure,
} from '../src/failure-taxonomy.js';

function nodeError(code: string): Error {
  return Object.assign(new Error(`simulated ${code}`), { code });
}

describe('errors that prove nothing was broadcast', () => {
  it.each<[string, PreBroadcastFailure]>([
    ['ENOTFOUND', 'DNS_RESOLUTION_FAILED'],
    ['EAI_AGAIN', 'DNS_RESOLUTION_FAILED'],
    ['ECONNREFUSED', 'CONNECTION_REFUSED'],
    ['CERT_HAS_EXPIRED', 'TLS_HANDSHAKE_FAILED'],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'TLS_HANDSHAKE_FAILED'],
  ])('classifies %s as pre-broadcast', (code, kind) => {
    const failure = classifyTransportError(nodeError(code));
    expect(failure).toEqual({ phase: 'PRE_BROADCAST', kind });
    expect(outcomeForTransportFailure(failure)).toBe('DEFINITELY_NOT_SUBMITTED');
  });
});

describe('errors that may have followed a sent request', () => {
  it.each<[string, PostSendAmbiguity]>([
    ['ECONNRESET', 'CONNECTION_RESET'],
    ['ETIMEDOUT', 'REQUEST_TIMEOUT'],
    ['EPIPE', 'CONNECTION_RESET'],
    ['ERR_STREAM_PREMATURE_CLOSE', 'TRUNCATED_RESPONSE'],
  ])('classifies %s as post-send', (code, kind) => {
    const failure = classifyTransportError(nodeError(code));
    expect(failure).toEqual({ phase: 'POST_SEND', kind });
    expect(outcomeForTransportFailure(failure)).toBe('POSSIBLY_SUBMITTED');
  });

  it('separates a failed TLS handshake from an interrupted connection', () => {
    // The handshake failing means no application data was ever sent. A reset
    // mid-connection may have delivered the request first.
    expect(classifyTransportError(nodeError('CERT_HAS_EXPIRED')).phase).toBe('PRE_BROADCAST');
    expect(classifyTransportError(nodeError('ECONNRESET')).phase).toBe('POST_SEND');
  });

  it('treats an unrecognized error as post-send', () => {
    // An error this build has never seen cannot be proof that nothing
    // happened. Treating it as such is the failure that pays twice.
    const failure = classifyTransportError(nodeError('ESOMETHINGNEW'));
    expect(failure.phase).toBe('POST_SEND');
    expect(outcomeForTransportFailure(failure)).toBe('POSSIBLY_SUBMITTED');
  });

  it.each([null, undefined, 'a string', 42, {}])(
    'treats the non-error value %s as post-send',
    (value) => {
      expect(classifyTransportError(value).phase).toBe('POST_SEND');
    },
  );
});

describe('http status classification', () => {
  it('treats a 4xx other than 429 as a provider-side rejection', () => {
    expect(classifyHttpStatus(400).phase).toBe('PRE_BROADCAST');
    expect(classifyHttpStatus(422).phase).toBe('PRE_BROADCAST');
  });

  it('keeps 429 ambiguous', () => {
    // A rate limiter may reject before or after queuing the work, so it is
    // not proof of non-submission.
    const failure = classifyHttpStatus(429);
    expect(failure).toEqual({ phase: 'POST_SEND', kind: 'RATE_LIMITED_429' });
    expect(outcomeForTransportFailure(failure)).toBe('POSSIBLY_SUBMITTED');
  });

  it.each([500, 502, 503, 504])('keeps %s ambiguous', (status) => {
    expect(outcomeForTransportFailure(classifyHttpStatus(status))).toBe('POSSIBLY_SUBMITTED');
  });

  it('keeps an uninterpretable 2xx ambiguous', () => {
    expect(classifyHttpStatus(200).phase).toBe('POST_SEND');
  });
});

describe('no ambiguous case is ever a safe retry', () => {
  it.each<PostSendAmbiguity>([
    'REQUEST_TIMEOUT',
    'CONNECTION_RESET',
    'TLS_INTERRUPTED',
    'RATE_LIMITED_429',
    'SERVER_ERROR_5XX',
    'TRUNCATED_RESPONSE',
    'MALFORMED_RESPONSE',
    'LOST_SUCCESS_RESPONSE',
    'PROCESS_TERMINATED',
  ])('%s is possibly submitted', (kind) => {
    expect(outcomeForTransportFailure({ phase: 'POST_SEND', kind })).toBe('POSSIBLY_SUBMITTED');
  });

  it('maps every post-send kind to a recognized provider response', () => {
    const kinds: PostSendAmbiguity[] = [
      'REQUEST_TIMEOUT',
      'CONNECTION_RESET',
      'TLS_INTERRUPTED',
      'RATE_LIMITED_429',
      'SERVER_ERROR_5XX',
      'TRUNCATED_RESPONSE',
      'MALFORMED_RESPONSE',
      'LOST_SUCCESS_RESPONSE',
      'PROCESS_TERMINATED',
    ];
    for (const kind of kinds) {
      expect(toProviderResponse({ phase: 'POST_SEND', kind }).kind).not.toBe('UNRECOGNIZED');
    }
  });
});
