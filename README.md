# OneShot

**One job. Many retries. One settlement.**

OneShot executes an approved business obligation exactly once, and keeps that
guarantee through retries, crashes, lost responses, queue redelivery, parallel
workers, and multiple agent instances.

The cardinality it protects is:

```text
1 Business Intent  /  N Attempts  /  at most 1 committed Settlement
```

## The problem

An autonomous agent is told to buy a paid API result for 1.25 USDC. It submits
the payment. The connection drops before the response arrives.

The agent now cannot tell the difference between:

- the payment never left, and
- the payment succeeded and the receipt was lost.

Retrying might pay twice. Not retrying might never pay at all. Most systems
guess. Guessing with money is how you get duplicate settlements.

OneShot refuses to guess. An uncertain outcome becomes a durable `UNKNOWN`
state that must be reconciled from authoritative evidence before anything else
happens. **Absence of proof that a payment happened is never treated as proof
that it did not.**

## How it works

```mermaid
flowchart TB
    Clients[Agent API client and operator console] --> API[apps/api]
    API --> Domain[packages/domain]
    Domain --> Contracts[packages/contracts]
    Domain --> Storage[packages/storage-postgres]
    Storage --> DB[(PostgreSQL)]
    Storage --> Outbox[Transactional outbox]
    Outbox --> Worker[Settlement worker]
    Outbox --> RecoveryWorker[Reconciliation worker]
    Worker --> Domain
    RecoveryWorker --> Reconciliation[packages/reconciliation]
    Reconciliation --> SafetyCore[Deterministic recovery safety core]
    SafetyCore --> Command[Versioned reconciliation command]
    Command --> Domain

    Domain --> AuthPort[AuthorizationPort]
    Domain --> SettlementPort[SettlementPort]
    Reconciliation --> EvidencePort[EvidencePort]
    Reconciliation --> IndexPort[IndexViewPort]
    Reconciliation --> AdvisorPort[RecoveryAdvisorPort]

    AuthPort --> PrivyAdapter[packages/privy-adapter]
    SettlementPort --> PrivyAdapter
    EvidencePort --> ArcAdapter[packages/arc-adapter]
    IndexPort -.-> GraphAdapter[Graph recovery adapter]
    AdvisorPort -.-> RecoveryAgent[LLM recovery agent]

    PrivyAdapter --> Privy[Privy wallet and policy]
    ArcAdapter --> Arc[Arc USDC and RPC]
    GraphAdapter -.-> Studio[Subgraph Studio GraphQL]
    GraphAdapter -.-> MCP[Optional Subgraph MCP]
    Studio -.-> GraphIndex[OneShot Arc Subgraph]
    MCP -.-> GraphIndex
```

Solid edges are implemented. Dashed runtime edges are bounded production paths:
the active Arc Testnet profile uses authenticated, pinned Subgraph Studio
GraphQL; Subgraph MCP remains an optional fail-closed adapter for deployments
served by The Graph Network. The recovery agent remains advisory. Neither
external index evidence nor model advice can authorize settlement.

### The state machine

Every Business Intent moves through durable, compare-and-set transitions. Only
one of them grants the right to touch the outside world.

```mermaid
stateDiagram-v2
    [*] --> AUTHORIZING: intent accepted
    AUTHORIZING --> REJECTED: policy denies
    AUTHORIZING --> READY: policy authorizes
    READY --> SUBMITTING: atomic owner grant
    SUBMITTING --> COMMITTED: verified receipt and Transfer
    SUBMITTING --> FAILED_SAFE: proof of no submission
    SUBMITTING --> UNKNOWN: timeout, crash, or doubt
    UNKNOWN --> COMMITTED: verified success
    UNKNOWN --> FAILED_SAFE: proof of no effect
    UNKNOWN --> UNKNOWN: pending, not found, or unavailable
    COMMITTED --> [*]
    REJECTED --> [*]
```

`UNKNOWN` never grants permission to submit again. It is resolved by evidence
or escalated to a human.

## Design rules

These are enforced in code and tests, not by convention:

- **A stable `business_intent_id` survives everything.** Retries, restarts,
  redelivery, and parallel workers all converge on the same intent.
- **One atomic transition grants submission ownership.** Exactly one worker
  crosses the external boundary.
- **Doubt fails closed.** A timeout, reset, truncated response, or any
  unrecognized error is treated as _possibly submitted_, never as a safe retry.
- **A successful receipt is not confirmation.** Settlement is committed only
  when the receipt carries exactly one matching ERC-20 Transfer, to the expected
  recipient, for the exact amount, from the configured token.
- **Money is integer atomic units and `bigint`.** No JavaScript floating point
  touches a monetary value anywhere.
- **External indexes are evidence, never authority.** An empty or delayed index
  result cannot authorize a payment.

## Integrations

| System        | Role                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------- |
| **Privy**     | Corporate wallet, scoped authorization, and spending policy                                 |
| **Arc**       | USDC settlement rail (Arc Testnet, chain `5042002`)                                         |
| **The Graph** | Arc USDC Subgraph discovery through the admitted Studio GraphQL path (optional MCP for Network-served deployments); evidence only, never settlement authority |

Privy authorizes and constrains the wallet action. It is not the duplicate
lock: OneShot's durable state is.

## Repository layout

```text
apps/api                      HTTP seam
apps/web                      composed operator UI (intent, settlement, recovery)
apps/worker                   settlement and reconciliation workers
packages/contracts            frozen v1 contract pack, OpenAPI, fixtures
packages/domain               intent, attempt, and settlement state
packages/storage-postgres     durable ledger and migrations
packages/arc-adapter          Arc profiles, money, receipts, readiness
packages/privy-adapter        authorization, requests, policy, adapters
packages/reconciliation       recovery evidence and safety core
packages/settlement-ui        policy, authorization, and settlement evidence UI
packages/recovery-ui          synthetic recovery evidence viewer
packages/testkit-*            simulators and sanitized fixtures
subgraph                      Arc Testnet USDC transfer indexer
```

## Quick start

Requires Node `24.19.0`, pnpm `11.19.0`, and PostgreSQL for integration tests.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm build
pnpm test
pnpm test:browser
pnpm build:frontend
pnpm --filter @oneshot/web dev
```

Open `http://localhost:3000/`. The app shell composes create/replay,
authoritative status, settlement evidence, and recovery evidence tabs. The
settlement tab reads the configured OneShot API; the recovery tab projects the
frozen `recovery-view` API into the C05 timeline model, with labelled
fail-closed fallbacks for legacy or unavailable evidence. The P5 browser
acceptance suite runs with Playwright/Chromium in CI.

Integration tests need a database:

```bash
pnpm test:integration
```

Copy `.env.example` to `.env` and fill in placeholders. Never commit a real
secret; see `docs/settlement/SETTLEMENT_CONFIG_V1.md` for how each variable is
classified.

### Operator sign-in

Privy operator login is optional and separate from the Privy wallet and
settlement-policy adapter in `packages/privy-adapter`. Set all three API
variables together: `PRIVY_AUTH_APP_ID`, `PRIVY_AUTH_VERIFICATION_KEY`, and
`PRIVY_AUTH_ALLOWED_SUBJECTS`. A partial configuration makes the API refuse to
start. With none set, the API accepts only `SERVICE_BEARER_TOKEN`; worker and
agent clients continue to use that service credential.

Bootstrap an operator by setting `VITE_PRIVY_APP_ID`, starting the web app,
signing in, copying the DID shown by the console, adding that DID to
`PRIVY_AUTH_ALLOWED_SUBJECTS`, and then starting the API. Copy the public ES256
verification key from Privy Dashboard → Configuration → App settings → Basics
→ Verify with key instead into runtime environment configuration. Never commit
the key. This boundary does not use the Privy app secret; never add that secret
to its configuration.

To verify a configured Arc endpoint really is the chain and token you think it
is:

```bash
pnpm --filter @oneshot/arc-adapter probe
```

That command is read-only. It cannot sign, send, or mutate anything.

To view the standalone recovery fixture UI locally:

```bash
pnpm --filter @oneshot/recovery-ui dev
```

Open `http://localhost:5173/?scenario=aged-unknown`. The public Wrangler target
uses the same clearly labelled synthetic viewer. Wrangler's build hook creates
the static bundle before local preview or `pnpm deploy`, including on a fresh
Cloudflare Workers Build checkout.

## API

| Method | Path                             | Purpose                                                       |
| ------ | -------------------------------- | ------------------------------------------------------------- |
| `POST` | `/v1/intents`                    | Create an intent; an identical replay returns the same result |
| `GET`  | `/v1/intents/{id}`               | Authoritative intent, attempts, settlement, evidence          |
| `POST` | `/v1/intents/{id}/reconcile`     | Trigger read-only reconciliation; never submits               |
| `GET`  | `/v1/intents/{id}/recovery-view` | Local authority plus labelled provider observations           |
| `GET`  | `/v1/metrics`                    | Operational metrics                                           |
| `GET`  | `/health/live`                   | Process liveness                                              |
| `GET`  | `/health/ready`                  | Configuration and Arc identity readiness                      |

The contract is defined in `packages/contracts/openapi/openapi.v1.json`.

## Project status

Under active development. **Testnet only.**

| Area                                   | Status                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Durable intent ledger, API, worker     | Implemented                                                                                    |
| Settlement adapters and error taxonomy | Implemented; simulator-tested and live-verified on Arc Testnet through Privy                   |
| Recovery evidence and safety core      | Live Graph/Vertex path implemented; deterministic core remains authoritative                   |
| Graph discovery and LLM recovery agent | Studio GraphQL path implemented; fresh sponsor trace pending; deterministic core remains final |
| Operator frontend                      | Gate P5 candidate composes A05/B05/C05 against the frozen API with APG and browser coverage    |

**One live testnet settlement has been executed.** A Privy-controlled execution
wallet and scoped policy authorized one 1.00 USDC Arc Testnet transfer; live
wrong-recipient and above-cap denials produced zero broadcasts. A lost-response
drill entered `UNKNOWN` and reconciled to that original settlement without a
replacement payment. Privy and Arc are `QUALIFIED` for the documented testnet
claim; see `docs/settlement/LIVE_EVIDENCE.md` and
`packages/reconciliation/docs/c06/QUALIFICATION_REPORT.md`. The Graph live
The Graph recovery path is currently `NOT VERIFIED` for sponsor qualification:
Studio GraphQL is implemented, but a fresh live trace showing its material
effect on the model and deterministic core is still required.

Arc Mainnet is not configured. Its profile carries no chain ID, RPC, explorer,
or token value by design, and enabling it requires published official values
plus explicit human authorization.

## Documentation

| Document                                                                 | Contents                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| [`plan.md`](plan.md)                                                     | Product plan, scope, and delivery gates                  |
| [`docs/DOMAIN_ARCHITECTURE.md`](docs/DOMAIN_ARCHITECTURE.md)             | Domain model and boundaries                              |
| [`docs/RECOVERY_HARDENING.md`](docs/RECOVERY_HARDENING.md)               | Recovery, runtime, authentication, and metrics contracts |
| [`milestones/CONTRACTS.md`](milestones/CONTRACTS.md)                     | Frozen v1 contract pack                                  |
| [`docs/settlement/`](docs/settlement/)                                   | Settlement config, provider setup, live evidence         |
| [`packages/reconciliation/docs/c06/`](packages/reconciliation/docs/c06/) | C06 demo and qualification evidence index                |
| [`AGENTS.md`](AGENTS.md)                                                 | Contribution policy and review gates                     |

## License

MIT. See [`LICENSE`](LICENSE).
