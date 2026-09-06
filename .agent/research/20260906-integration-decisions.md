# OneShot Integration Research

Date: 2026-09-06
Scope: primary-source facts needed to make the first product implementation plan decision-complete.
Target: Privy-authorized exactly-once settlement on Arc Testnet with The Graph
as the hashless recovery index.

## Decisions

### Privy: authorization must constrain the settlement path

- Use a Privy execution wallet owned by an application authorization key or key quorum. Attach one explicit, fail-closed wallet policy when the wallet is created. Privy owners authorize wallet actions, while wallet policies constrain the actions that an otherwise valid signer may take ([wallet policies and controls](https://docs.privy.io/security/wallet-infrastructure/policy-and-controls), [execution wallets](https://docs.privy.io/recipes/wallets/execution-wallets)).
- Permit only the Arc Testnet ERC-20 USDC `transfer(address,uint256)` path: chain `5042002`, contract `0x3600000000000000000000000000000000000000`, approved recipient, amount at or below the configured cap, and zero native transaction value. Keep key export and all unrelated methods denied. Privy documents default-deny policy behavior and Ethereum transaction conditions ([policy overview](https://docs.privy.io/controls/policies/overview), [Ethereum policy examples](https://docs.privy.io/controls/policies/example-policies/ethereum)).
- Persist the exact Privy request identity and body before submission. Reuse the same `privy-idempotency-key` for the same Business Intent. Privy deduplicates a matching request for only 24 hours, so this is a supplemental guard and never replaces OneShot's durable state and uniqueness constraints ([idempotency keys](https://docs.privy.io/api-reference/idempotency-keys)).
- Attach a stable Privy transaction `reference_id` derived from `business_intent_id` for lookup and reconciliation, not as the authoritative duplicate lock ([transaction reference IDs](https://docs.privy.io/transaction-management/transactions/reference-id)).
- Polling transaction status is the baseline. Webhooks are an optional optimization because availability may depend on the Privy plan; if enabled, verify signatures and process deliveries idempotently ([webhook overview](https://docs.privy.io/api-reference/webhooks/overview)).

### Arc: use the six-decimal ERC-20 interface for settlement

- Arc Testnet uses chain ID `5042002`, CAIP-2 `eip155:5042002`, RPC `https://rpc.testnet.arc.network`, WebSocket `wss://rpc.testnet.arc.network`, and explorer `https://testnet.arcscan.app` ([RPC endpoints](https://docs.arc.io/arc/references/rpc-endpoints)).
- Arc's USDC ERC-20 interface is `0x3600000000000000000000000000000000000000`. Application settlement amounts use its six-decimal precision. Arc also exposes the same underlying USDC as an 18-decimal native gas balance, so payment amounts and gas accounting must remain separate and the UI must not double-count the two views ([infrastructure integration](https://docs.arc.io/integrate/infrastructure), [stablecoin-native model](https://docs.arc.io/arc/concepts/stablecoin-native-model)).
- Arc transactions are pending until included, then immediately and deterministically final; there is no accumulating-confirmation state. A receipt with `status: 1` is final success only after validating the expected USDC `Transfer` log. A receipt with `status: 0` is final execution failure and zero settlement ([transaction lifecycle](https://docs.arc.io/integrate/wallets/transaction-lifecycle), [deterministic finality](https://docs.arc.io/arc/concepts/deterministic-finality)).
- Deterministic finality does not eliminate submission ambiguity. A lost Privy/RPC response or process crash after a possible broadcast still becomes `UNKNOWN`; a new-nonce payment is forbidden until reconciliation proves a safe terminal result.

### The Graph: selected for hashless discovery, never settlement authority

- Direct Privy lookup plus exact Arc receipt/log verification resolves known transaction identities. PostgreSQL remains authoritative for ownership, intent state, and the `UNKNOWN` hold.
- The Graph is the selected v1 path for discovering candidate transfers when a successful submission lost its hash. C01 must prove this live and show a capability that disappears when Graph is removed.
- Every query carries deployment and freshness/error evidence. Missing, empty, lagging, unhealthy, multiple, or contradictory candidates preserve `UNKNOWN`; Arc verifies every candidate before any commit.
- Arc RPC can scan logs without a hash, so The Graph is a product choice for structured automatic discovery rather than the only technically possible scanner ([Arc event indexing](https://docs.arc.io/integrate/infrastructure/indexing-events), [Graph querying](https://thegraph.com/docs/en/subgraphs/querying/introduction/)).
- Arc's Memo contract can attach a caller-supplied `memoId` and `callDataHash` to a forwarded USDC call specifically for correlation and reconciliation. C01/B01 must test `memoId = hash(business_intent_id)` as the preferred unique lookup key ([Arc Memo indexing](https://docs.arc.io/integrate/infrastructure/indexing-events)).
- Privy can enforce chain, destination contract, decoded function, and decoded top-level calldata parameters. Before choosing Memo for settlement, B01 must prove the policy can constrain the forwarded USDC target and required business fields; otherwise use the tuple-search fallback or a narrow typed settlement contract without weakening authorization ([Privy policy fields](https://docs.privy.io/controls/policies/overview)).
- Target the Graph AI Tooling or AI Use Case track: live Graph data must drive meaningful recovery-agent selection, explanation, or automation. The composable/standardized track requires two Graph products or meaningful use of a standardized schema; one custom Subgraph query is insufficient ([ETHOnline 2026 prize requirements](https://ethglobal.com/events/ethonline2026/prizes)).

### Durable state and work delivery

- PostgreSQL is the authoritative store. Use primary/unique constraints on `business_intent_id` and one settlement row per intent; use `INSERT ... ON CONFLICT` plus an immutable payload fingerprint to distinguish a replay from a same-ID conflict ([constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [`INSERT`](https://www.postgresql.org/docs/current/sql-insert.html)).
- Grant submission ownership with a row lock or conditional state transition. Do not keep a database transaction open during Privy or RPC calls. Persist `SUBMITTING`, the request fingerprint, and provider identifiers before crossing the external-effect boundary ([explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)).
- Use Graphile Worker over the same PostgreSQL database to avoid a second queue datastore. It supports transactional enqueueing and explicitly provides at-least-once delivery ([Graphile Worker](https://worker.graphile.org/docs), [transactional enqueueing](https://worker.graphile.org/docs/sql-add-job)).
- Configure the external-effect `submit_settlement` job for one queue attempt. The task itself classifies the outcome and returns after durably recording `COMMITTED`, `FAILED_SAFE`, or `UNKNOWN`; the queue must never blindly repeat a possibly submitted payment. Read-only reconciliation jobs may retry. `jobKey` is scheduling hygiene, not the settlement lock ([job options](https://worker.graphile.org/docs/library/add-job), [job-key caveats](https://worker.graphile.org/docs/job-key)).

## Verification gates left for implementation

1. Pin exact SDK and runtime versions only after a compatibility spike validates Privy request signing, Arc chain support, and policy condition syntax.
2. Assert `eth_chainId == 5042002` and bytecode exists at the configured USDC address during testnet startup checks.
3. Prove the chosen Privy policy denies wrong chain, wrong contract, wrong recipient, wrong method, non-zero native value, and above-cap amount with zero settlement.
4. Prove live The Graph hashless discovery, freshness, multiple-candidate handling, safe degradation, and AI-track value; otherwise remove the Graph claim and use direct recovery.
5. Keep Privy webhooks outside the critical path until plan availability and signature verification are demonstrated.

## Planning consequence

The work can be split into three independent backend tracks after one contract
freeze: (A) domain/storage/API, (B) the Privy/Arc adapter, and (C) The Graph
reconciliation/evidence. Each track must ship its own contract simulator and
tests so progress does not depend on another track's implementation. Frontend
begins only after the integrated backend contract and recovery semantics are
stable.
