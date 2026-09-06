# OneShot Domain Architecture

This document explains how each domain part contributes to the product promise:

`1 Business Intent / N Attempts / <= 1 committed Settlement`

## System context

```mermaid
flowchart LR
    Operator[Company operator] -->|configures policy| Privy[Privy]
    Agent[Autonomous agent] -->|creates or reuses intent| API[OneShot API]
    Agent -.->|requests business job| Supplier[Paid API or supplier]
    API --> Domain[OneShot domain]
    Domain --> Ledger[(Authoritative ledger)]
    Ledger --> Worker[Execution worker]
    Worker --> Privy
    Privy --> Arc[Arc USDC settlement]
    Arc --> SupplierWallet[Supplier wallet]
    Arc --> Index[The Graph index]
    Ledger --> Recovery[Recovery and audit view]
    Index --> Recovery
    Recovery --> Agent
    Recovery --> Operator
```

The paid service and its result remain outside OneShot's trust boundary.
OneShot guarantees payment cardinality and evidence for an approved obligation;
it does not certify supplier quality or delivery.

## Domain records and relationships

```mermaid
classDiagram
    class BusinessIntent {
      +business_intent_id
      +payload_fingerprint
      +recipient
      +amount_atomic
      +asset
      +network
      +purpose
      +state
      +version
    }
    class Attempt {
      +attempt_id
      +stage
      +sanitized_result
      +created_at
    }
    class Settlement {
      +settlement_id
      +provider_reference
      +transaction_hash
      +receipt_status
      +transfer_log_index
    }
    class OutboxJob {
      +job_id
      +job_type
      +delivery_state
    }
    class EvidenceObservation {
      +source
      +authority_class
      +retrieved_at
      +block_number
      +freshness
      +digest
    }
    class ReconciliationDecision {
      +command
      +expected_version
      +reason
    }

    BusinessIntent "1" --> "0..*" Attempt : records execution tries
    BusinessIntent "1" --> "0..1" Settlement : owns financial result
    BusinessIntent "1" --> "0..*" OutboxJob : schedules work
    BusinessIntent "1" --> "0..*" EvidenceObservation : collects evidence
    BusinessIntent "1" --> "0..*" ReconciliationDecision : resolves uncertainty
    Attempt "0..*" --> "0..1" Settlement : may produce
```

The Business Intent is the durable business identity. Attempts may repeat.
Settlement cardinality is enforced against the Business Intent, never against
an HTTP request, worker process, queue delivery, or agent session.

## State ownership

```mermaid
stateDiagram-v2
    [*] --> AUTHORIZING: valid new intent
    AUTHORIZING --> REJECTED: Privy policy denies
    AUTHORIZING --> READY: exact action authorized
    READY --> SUBMITTING: atomic ownership acquired
    SUBMITTING --> COMMITTED: final receipt and Transfer verified
    SUBMITTING --> FAILED_SAFE: authoritative no-effect proof
    SUBMITTING --> UNKNOWN: timeout, crash, or possible submission
    UNKNOWN --> COMMITTED: original payment verified
    UNKNOWN --> FAILED_SAFE: authoritative final no-effect proof
    UNKNOWN --> UNKNOWN: pending, absent, stale, unhealthy, or contradictory evidence
    REJECTED --> [*]
    COMMITTED --> [*]
```

Only the domain and PostgreSQL transition rules own these states. Privy, Arc,
The Graph, queues, and UI components report facts or perform bounded actions;
none may reinterpret the state machine.

## Component responsibilities

| Part | Owns | Must never own |
| --- | --- | --- |
| Agent API | Validation, create/replay/conflict response, status reads | Direct settlement or retry permission |
| Contracts package | Shared schemas, ports, enums, money and identity rules | Provider implementation |
| Domain package | State transitions, submission ownership, result classification | Network calls or UI |
| PostgreSQL storage | Durable uniqueness, versions, attempts, settlement and evidence records | Business decisions outside domain commands |
| Transactional outbox | Atomic creation of work with domain state | Duplicate-payment prevention by itself |
| Graphile Worker | Deliver execution and reconciliation jobs | Authority to pay because a job was redelivered |
| Privy adapter | Wallet authorization, policy checks, provider request identity | Durable Business Intent authority |
| Arc adapter | Transaction construction, submission, receipt and Transfer verification | Deciding whether another attempt is allowed |
| The Graph Subgraph/client | Indexed transfer history, deployment identity, freshness and health | Proof that an absent payment never happened |
| Reconciliation engine | Combine bound evidence and emit versioned safe commands | Settlement submission |
| Operator console | Explain state, evidence, policy and safe recovery actions | Force-pay or bypass controls |
| Telemetry/runbooks | Reveal failures, lag, `UNKNOWN` age and safe-disable state | Secrets or mutation of financial truth |

## Successful settlement sequence

```mermaid
sequenceDiagram
    participant Agent
    participant API as OneShot API
    participant DB as PostgreSQL
    participant Worker
    participant Privy
    participant Arc
    participant Graph as The Graph

    Agent->>API: POST Business Intent with stable ID
    API->>DB: Insert intent and outbox job atomically
    DB-->>API: New intent or identical replay
    API-->>Agent: Authoritative intent state
    Worker->>DB: Acquire AUTHORIZING/READY/SUBMITTING ownership
    Worker->>Privy: Authorize exact wallet action
    Privy->>Arc: Submit ERC-20 USDC transfer
    Arc-->>Worker: Final receipt and logs
    Worker->>Worker: Verify chain, token, recipient, amount, Transfer
    Worker->>DB: Persist COMMITTED and settlement identity
    Arc-->>Graph: Transfer event indexed independently
    Agent->>API: GET intent status
    API-->>Agent: One committed settlement with evidence
```

## Ambiguous submission and recovery

```mermaid
sequenceDiagram
    participant Worker
    participant DB as PostgreSQL
    participant Privy
    participant Arc
    participant Reconciler
    participant Graph as The Graph

    Worker->>DB: Persist SUBMITTING and request identity
    Worker->>Privy: Submit authorized transfer
    Privy->>Arc: Broadcast transaction
    Arc--xWorker: Success response is lost
    Worker->>DB: Persist UNKNOWN
    Reconciler->>DB: Load intent, request identity, and observations
    Reconciler->>Privy: Lookup original provider request
    Reconciler->>Arc: Lookup exact transaction receipt and Transfer
    Reconciler->>Graph: Query indexed observation plus freshness
    Note over Reconciler,Graph: Graph may locate or corroborate activity but cannot authorize a retry
    Reconciler->>DB: MARK_COMMITTED when exact Arc success is verified
    DB-->>Worker: Redelivery observes terminal state; no second submission
```

## Port and adapter boundary

```mermaid
flowchart LR
    Domain[Domain state machine]
    Domain --> Auth[AuthorizationPort]
    Domain --> Settle[SettlementPort]
    Domain --> Evidence[EvidencePort]
    Domain --> Index[IndexViewPort]

    Auth --> Privy[Privy adapter]
    Settle --> ArcWrite[Arc write adapter]
    Evidence --> PrivyRead[Privy lookup]
    Evidence --> ArcRead[Arc receipt/log lookup]
    Index --> GraphClient[Graph client]

    Privy --> External1[Privy service]
    ArcWrite --> External2[Arc RPC]
    PrivyRead --> External1
    ArcRead --> External2
    GraphClient --> External3[The Graph]
```

The domain consumes stable result families. Adapters translate external SDK,
RPC, and GraphQL behavior into those results. External response shapes never
leak into the state machine.

## A/B/C ownership and convergence

```mermaid
flowchart TB
    Contracts[Frozen contracts, fixtures, and simulators]

    subgraph A[Coder A - authority and orchestration]
      A1[Contracts and OpenAPI]
      A2[PostgreSQL intent ledger]
      A3[Atomic worker]
      A4[Composition and operations]
      A1 --> A2 --> A3 --> A4
    end

    subgraph B[Coder B - authorization and settlement]
      B1[Privy/Arc compatibility]
      B2[Request, policy, receipt]
      B3[Live settlement harness]
      B4[Ambiguity-safe adapters]
      B1 --> B2 --> B3 --> B4
    end

    subgraph C[Coder C - evidence and recovery]
      C1[Subgraph and health]
      C2[Reconciliation engine]
      C3[Failure injection]
      C4[Recovery service]
      C1 --> C2 --> C3 --> C4
    end

    Contracts --> A1
    Contracts --> B1
    Contracts --> C1
    A4 --> P4[P4 composition]
    B4 --> P4
    C4 --> P4
    P4 --> UI[Composed product interface]
    UI --> Release[Release evidence]
```

Each coder closes backend packets against frozen simulators. P4 is where exact
reviewed packages replace simulators. Integration failures return to the owning
lane instead of producing shared ad hoc edits.
