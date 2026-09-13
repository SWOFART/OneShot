# C06 live capture checklist

All checked artifacts must be sanitized, mutually bound to one Business Intent,
and stored only after redaction review. Secrets, headers, raw provider bodies,
signatures, credentials, model chain of thought, and private wallet data are forbidden.

## Privy and lost response

- [ ] Public/sanitized corporate wallet reference and reviewed policy digest.
- [ ] Proof the normal settlement path used that policy; no bypass path.
- [ ] Wrong-scope and above-cap live denials with zero settlement.
- [ ] Fault point after real broadcast and before adapter return.
- [ ] Durable `UNKNOWN`, one Attempt, and no transaction hash persisted.
- [ ] Original Privy request lookup exercised and returned no recoverable hash.

## Arc Testnet

- [ ] Network identity is Arc Testnet `eip155:5042002`.
- [ ] Public transaction hash, block number/hash, finality, and explorer URL.
- [ ] Exact configured USDC token address and one matching ERC-20 Transfer log.
- [ ] Sender, recipient, and integer amount match the Business Intent.
- [ ] Settlement identity survives restart and downstream failure.

## The Graph through Studio GraphQL

- [ ] Reviewed immutable deployment ID and manifest CID.
- [ ] Pinned Studio endpoint and API-key authentication are configured outside
      the evidence bundle; MCP server/version/tool fields are recorded only when
      the optional MCP transport is actually used.
- [ ] Frozen query digest and sanitized variables binding sender, token,
      recipient, amount, and bounded block window.
- [ ] Call ID/retrieval time plus `_meta.deployment`, indexed block/hash/time,
      indexing-error state, independent Arc head, lag, health, and candidate count.
- [ ] Hashless candidate discovery materially depends on this live Studio GraphQL result.

## Model, core, and degradation

- [ ] Model identity and one allowed recommendation with real evidence references.
- [ ] Exact selected candidate independently verified through Arc.
- [ ] Deterministic core command and durable transition captured separately.
- [ ] Recovery external submission count is zero.
- [ ] Disabled, delayed, empty, unhealthy, unavailable, unknown-freshness,
      malformed, injected, multiple, contradictory, and invalid-model cases hold safely.
- [ ] Restart/replay produces the same disposition without chain/database rewriting.

After capture, run the sponsor-qualification skill. Until every applicable live
item is evidenced, keep the corresponding verdict `NOT VERIFIED`.
