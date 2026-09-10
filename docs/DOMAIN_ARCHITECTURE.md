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
    Arc --> Graph[Live OneShot Arc Subgraph]
    Ledger --> Recovery[Recovery service and audit view]
    Recovery -->|provider lookup| Privy
    Recovery -->|receipt and log lookup| Arc
    Graph --> Studio[Subgraph Studio GraphQL]
    Graph --> MCP[Optional Subgraph MCP]
    Studio -->|validated candidates and freshness| RecoveryAgent[LLM Recovery Agent]
    MCP -->|validated candidates and freshness| RecoveryAgent
    RecoveryAgent -->|four-action recommendation| Recovery
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
    FAILED_SAFE --> AUTHORIZING: policy opens a new attempt
    REJECTED --> [*]
    COMMITTED --> [*]
```

Only the domain and PostgreSQL transition rules own these states. Privy, Arc,
optional indexers, queues, and UI components report facts or perform bounded actions;
none may reinterpret the state machine.

## Component responsibilities

| Part                               | Owns                                                                                         | Must never own                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Agent API                          | Validation, create/replay/conflict response, status reads                                    | Direct settlement or retry permission                    |
| Contracts package                  | Shared schemas, ports, enums, money and identity rules                                       | Provider implementation                                  |
| Domain package                     | State transitions, submission ownership, result classification                               | Network calls or UI                                      |
| PostgreSQL storage                 | Durable uniqueness, versions, attempts, settlement and evidence records                      | Business decisions outside domain commands               |
| Transactional outbox               | Atomic creation of work with domain state                                                    | Duplicate-payment prevention by itself                   |
| Graphile Worker                    | Deliver execution and reconciliation jobs                                                    | Authority to pay because a job was redelivered           |
| Privy adapter                      | Wallet authorization, policy checks, provider request identity                               | Durable Business Intent authority                        |
| Arc adapter                        | Transaction construction, submission, receipt and Transfer verification                      | Deciding whether another attempt is allowed              |
| The Graph Subgraph                 | Indexed transfer discovery, deployment identity, freshness, and health after passing C01     | Proof that an absent payment never happened              |
| Graph provider adapter             | Pin deployment and validate Studio GraphQL or optional MCP results before model use         | Model behavior, settlement authority, or secret exposure |
| LLM Recovery Agent                 | Recommend `WAIT`, `RECONCILE`, `ESCALATE`, or `RETURN_EXISTING_RESULT` from labeled evidence | Settlement submission or authoritative transition        |
| Deterministic recovery safety core | Recheck Arc/durable proof and map allowed recommendations to safe commands                   | Trusting Graph/MCP/model as financial authority          |
| Operator console                   | Explain state, evidence, policy and safe recovery actions                                    | Force-pay or bypass controls                             |
| Telemetry/runbooks                 | Reveal failures, lag, `UNKNOWN` age and safe-disable state                                   | Secrets or mutation of financial truth                   |

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
    Worker->>DB: Claim AUTHORIZING attempt
    Worker->>Privy: Evaluate exact wallet policy
    Privy-->>Worker: AUTHORIZED
    Worker->>DB: Persist AUTHORIZING to READY
    Worker->>DB: Atomically persist SUBMITTING and request identity
    Worker->>Privy: Submit the authorized transfer
    Privy->>Arc: Broadcast ERC-20 USDC transaction
    Arc-->>Worker: Final receipt and logs
    Worker->>Worker: Verify chain, token, recipient, amount, and Transfer
    Worker->>DB: Persist COMMITTED and settlement identity
    Arc-->>Graph: Transfer and correlation event are indexed independently
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
    participant Graph as OneShot Arc Subgraph
    participant Studio as Subgraph Studio GraphQL
    participant MCP as Optional Subgraph MCP
    participant Agent as LLM Recovery Agent
    participant Reconciler as Deterministic safety core
    participant Domain

    Worker->>DB: Persist SUBMITTING and request identity
    Worker->>Privy: Submit authorized transfer
    Privy->>Arc: Broadcast transaction
    Arc--xWorker: Success response and hash are lost
    Worker->>DB: Persist UNKNOWN
    Reconciler->>DB: Load intent and request identity
    Reconciler->>Privy: Lookup original provider request
    Privy-->>Reconciler: Transaction hash or no usable identity
    alt transaction hash recovered
        Reconciler->>Arc: Verify recovered receipt and Transfer
    else transaction hash missing
        Agent->>Studio: Query pinned deployment plus _meta
        Studio->>Graph: Query memo ID or transfer tuple
        Graph-->>Studio: Zero, one, or multiple live candidates
        Studio-->>Agent: Validated structured Graph result
        Agent-->>Reconciler: Four-action recommendation and evidence references
        loop each candidate
            Reconciler->>Arc: Verify receipt, Memo when used, and Transfer
        end
    end
    Note over Agent,Reconciler: Graph transport/LLM discover candidates, Arc proves, deterministic core decides
    alt exactly one bindable final match
        Reconciler->>Domain: Emit MARK_COMMITTED with expected version
        Domain->>DB: Compare and set UNKNOWN to COMMITTED
    else no safe resolution
        Reconciler->>DB: Keep UNKNOWN and record escalation evidence
    end
    Worker->>DB: Check the same intent after redelivery
    DB-->>Worker: COMMITTED or UNKNOWN means no second submission
```

## Port and adapter boundary

```mermaid
flowchart LR
    Domain[Domain state machine]
    Reconciliation[Reconciliation engine]
    Command[Versioned reconciliation command]

    Domain --> Auth[AuthorizationPort]
    Domain --> Settle[SettlementPort]
    Reconciliation --> Evidence[EvidencePort]
    Reconciliation --> Index[IndexViewPort]
    Reconciliation --> Advisor[RecoveryAdvisorPort]
    Reconciliation --> SafetyCore[Deterministic safety core]
    SafetyCore --> Command
    Command --> Domain

    Auth --> Privy[Privy adapter]
    Settle --> ArcWrite[Arc write adapter]
    Evidence --> PrivyRead[Privy lookup]
    Evidence --> ArcRead[Arc receipt and log lookup]
    Index --> GraphAdapter[Graph recovery adapter]
    Advisor --> RecoveryAgent[LLM Recovery Agent]

    Privy --> External1[Privy service]
    ArcWrite --> External2[Arc RPC]
    PrivyRead --> External1
    ArcRead --> External2
    RecoveryAgent --> GraphAdapter
    GraphAdapter --> Studio[Subgraph Studio GraphQL]
    GraphAdapter --> MCP[Optional Subgraph MCP]
    Studio --> External3[Live OneShot Arc Subgraph]
    MCP --> External3
```

The domain consumes stable result families. Adapters translate external SDK,
RPC, MCP, Graph-query, and model behavior into those results. The safety core
accepts only the frozen four-action recommendation contract and independently
validates any result-returning command. External response shapes never leak
into the state machine.

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
      C1[Graph-provider discovery strategy]
      C2[LLM agent and safety core]
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
