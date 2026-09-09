# OneShot Product Delivery Plan

Status: local MVP with recorded Arc/Privy testnet evidence; concrete Privy provider and production runtime bootstrap are not yet checked in; Graph Studio deployment synchronized and queried with live AI recovery evidence; decentralized Graph Network publication remains unallocated; P5 frontend composition and Playwright browser acceptance suite implemented with CI execution configured; sponsor videos, final submission fields, and P6 release proof remain pending
Team: exactly three coders
Implementation base: the human-approved commit containing this plan
Research basis: `.agent/research/20260906-integration-decisions.md`, `.agent/research/20260907-subgraph-mcp-clarification.md`, and the [official ETHOnline 2026 prize requirements](https://ethglobal.com/events/ethonline2026/prizes) reviewed 2026-09-09
Detailed work packets: [`milestones/README.md`](milestones/README.md)
Domain architecture: [`docs/DOMAIN_ARCHITECTURE.md`](docs/DOMAIN_ARCHITECTURE.md)

## Current delivery status (2026-09-09)

The following pull requests have merged into `develop` and are part of the
current implementation base.

| PR                                                                                                                                          | Progress                                                                                                                                                                                             | Impact on this plan                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#42](https://github.com/SWOFART/OneShot/pull/42) `docs: correct Gate P4 verification status`                                               | Separates complete backend composition and Privy/Arc `LIVE_VERIFIED` evidence from the missing Graph MCP/model proof; overall P4 is `INCOMPLETE`.                                                    | Makes the P4/P6 status fail-closed and confirms that no Graph qualification claim is supported yet.                                                                                          |
| [#43](https://github.com/SWOFART/OneShot/pull/43) `fix(settlement): close lane B review follow-ups`                                         | Aligns live-evidence wording with the disabled/unpublished Mainnet profile and adds settlement-UI credential, control-character, and contrast regression coverage.                                   | Strengthens B05/B06 and mainnet-readiness evidence; it does not change the Graph recovery gate.                                                                                              |
| [#44](https://github.com/SWOFART/OneShot/pull/44) `fix: require recovery lookup config`                                                     | Removes placeholder Graph identities and requires explicit token, sender, block window, and MCP policy configuration; unavailable MCP/advisor ports remain the default.                              | Makes production recovery fail closed and ready for real configuration, but does not prove live MCP/model behavior or authorize hashless recovery.                                           |
| [#45](https://github.com/SWOFART/OneShot/pull/45) `docs: update plan with Graph deployment status`                                          | Records the published deployment, duplicate registration, immutable CID, and the Explorer `NOT INDEXED` / no-allocation result, reconciling it with successful Studio queries.                       | Identifies the deployment while keeping decentralized indexing, live recovery, The Graph qualification, and P4 incomplete.                                                                   |
| [#46](https://github.com/SWOFART/OneShot/pull/46) `feat(reconciliation): implement live Vertex AI recovery advisor and Subgraph MCP client` | Adds tested `VertexAiRecoveryAdvisor` and `LiveSubgraphMcpRecoveryPort` implementations, exports them from reconciliation, and proves explicit worker injection with settlement permission disabled. | Delivers the C02/C06 adapter implementation, but worker defaults remain unavailable ports; runtime admission, live Graph allocation/query evidence, and model-to-core proof remain required. |
| [#48](https://github.com/SWOFART/OneShot/pull/48) `feat(graph): complete live Subgraph MCP recovery proof and qualify The Graph`            | Captures a synchronized Studio query through Subgraph MCP, one matching Arc transfer candidate, Gemini recovery advice, deterministic zero-submit disposition, and Arc verification.                 | Completes the technical Graph/AI integration evidence and Gate P4; the public two-to-four-minute submission video and final pool selection remain P6 gates.                                  |

### The Graph deployment status

The checked-in [`subgraph/`](subgraph/) source builds for Arc Testnet USDC and
was deployed to Studio as `oneshot-arc-testnet` version `0.2.1`. The published
Explorer metadata identifies the following public deployment:

- Public Explorer target: `69FEby7GetXpJVWJShPL6XjMsWWDowLuqf6cE5MvTHdy`.
- Duplicate published registration observed: `FnXJmkEuxCDeqr4tTejszcLgpodazPoy2ifeNrA5VnBw`; both registrations point to the same deployment.
- Immutable deployment/manifest CID: `QmPEUSL6aXY7RVjGFFMbs5L4Q4pxG4TB73cHQ7nechGQY7`.
- Publication network: Arbitrum One; indexed data source: Arc Testnet (`eip155:5042002`).
- Explorer status: `NOT INDEXED` / `SUBGRAPH NOT INDEXED`, with no indexers or
  allocations. The Explorer query pane currently reports `subgraph not found:
no allocations`.

The decentralized Gateway deployment is not serving queries without an
allocation. That does not invalidate the selected AI track: its official text
explicitly accepts live Subgraph Studio data. The Studio deployment
(`1758917/oneshot-arc-testnet/version/latest`) is active and synchronized and
serves Arc Testnet USDC candidate transfers through the Subgraph MCP recovery
port (`execute_query_by_deployment_id`). Vertex AI Gemini 2.5 Flash consumes
this live trace to advise `RECONCILE`, confirmed on Arc RPC with zero duplicate
payments (`settlementPermission: NEVER`). The technical Graph/AI integration
checks pass, sanitized evidence is recorded in `evidence/c06/graph-proof.json`
and `evidence/c06/sanitized-proof.json`, and Gate P4 is `PASS`. Final sponsor
submission status remains `NOT VERIFIED` until the public two-to-four-minute
demo video and Start Fresh pool selection are recorded.

Open work after the current base is the Arc/Circle qualification slice described in
section 5b. It is not implemented or sponsor-qualified merely because the plan names
it, and it must not change the OneShot settlement authority or the fail-closed
recovery defaults.

## Global product vision

OneShot is a payment control plane for autonomous business agents. It lets a
company approve one business obligation, allow an agent to execute it, and
retain one durable financial outcome even when requests, processes, workers,
or agent instances repeat.

The primary product promise is:

`One job. Many retries. One settlement.`

The first production vertical is a B2B agent purchasing a paid API operation
or digital result in USDC. Invoice payment, procurement, subscriptions, and
other agent-commerce obligations are later verticals built on the same
Business Intent contract.

## Primary product flow

1. A company configures a Privy-controlled wallet, recipient policy, and
   spending limit.
2. An agent creates one Business Intent for a paid API job with a stable
   identity, recipient, amount, asset, network, and purpose.
3. OneShot validates and durably records the obligation before any external
   effect.
4. A worker obtains atomic submission ownership and asks Privy to authorize the
   exact Arc USDC transfer.
5. Arc settles the payment. OneShot verifies the receipt and expected ERC-20
   Transfer before recording `COMMITTED`.
6. A timeout, crash, or lost response becomes durable `UNKNOWN`. Reconciliation
   first asks Privy for the original transaction identity. When the hash is
   missing, an LLM Recovery Agent queries the live OneShot/Arc Subgraph through
   Subgraph MCP and uses the indexed data to select/explain candidates. It emits
   only `WAIT`, `RECONCILE`, `ESCALATE`, or `RETURN_EXISTING_RESULT`.
7. The deterministic OneShot safety core validates the recommendation, and Arc
   verifies each candidate receipt and exact Transfer. No candidate, multiple
   candidates, stale/malformed data, invalid model output, or contradiction
   leaves the intent `UNKNOWN`; the LLM never receives settlement permission.
8. Repeated HTTP requests, queue deliveries, processes, or agents return the
   same Business Intent and cannot create a second committed settlement.

## Sponsor and product configuration

The primary product configuration is **Privy + Arc + The Graph**:

- Privy authorizes and constrains the corporate wallet action.
- Circle-issued USDC is the settlement asset on Arc. Circle Agent Stack and
  Circle Wallets are optional, separate integrations and are not part of the
  current prize claim or canonical Privy-controlled settlement rail.
- The Graph discovers candidate transfers when a successful submission lost its
  transaction hash or provider response. The production path reaches the live
  OneShot/Arc Subgraph through Subgraph MCP, not a direct application GraphQL client.
- The LLM Recovery Agent uses MCP results for meaningful candidate selection and
  explanation, then emits one of four advisory recovery actions.
- Arc verifies the candidate receipt and exact USDC `Transfer`.
- OneShot and PostgreSQL alone decide the durable state transition.

This is the final implementation direction. The Graph is load-bearing for
automatic hashless discovery, but never becomes settlement authority. The live
C06 evidence proves the data, freshness, and candidate-selection behavior; the
remaining Graph gates are the checked-in live runtime bootstrap and submission
packaging, not the captured indexing/query/AI behavior.

The Graph submission targets the AI Tooling or AI Use Case track. One custom
Subgraph does not satisfy the Composable/Standardized track. One live Subgraph
is sufficient for the selected AI track. The recovery agent uses live Graph data
obtained through Subgraph MCP to choose and explain candidates; deterministic
Arc checks and the OneShot state machine retain all financial authority.

### Official 2026 sponsor claim mapping

Three partner slots. A partner with several tracks counts as one slot and the
project is eligible for all of that partner's tracks. The submission text must
name each claimed track explicitly.

`QUALIFIED` means the repository contains the required working integration and
demo evidence. `NOT VERIFIED` means the architecture is eligible but a required
proof or submission artifact is still missing. `NOT QUALIFIED` means the current
architecture does not implement a mandatory requirement.

| Slot      | Intended track                                               | Current verdict | Basis and remaining gate                                                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The Graph | Best AI Tooling or AI Use Case with The Graph (From Scratch) | `NOT VERIFIED`  | Live OneShot/Arc Subgraph data is queried through Subgraph MCP and materially used by the recovery agent, then verified on Arc. The public two-to-four-minute video and confirmed Start Fresh registration are still missing.                                                                          |
| Privy     | Best B2B financial product                                   | `NOT VERIFIED`  | A Privy execution wallet, scoped policy, business payment workflow, denial drills, and live Arc transfer are recorded. The checked-in runtime still needs a concrete Privy provider and must make authorization mandatory in production before the source implements the demonstrated flow end to end. |
| Privy     | Best financial flow                                          | `NOT VERIFIED`  | The recorded Privy wallet action completes a real USDC transfer, but the provider client/runtime wiring used for that action is not in the public source.                                                                                                                                              |
| Arc       | Best DeFi/Onchain Finance Application                        | `NOT VERIFIED`  | Arc Testnet USDC and conditional multi-step settlement are live; backend, diagram, docs, public repo, and composed frontend exist. The concrete Privy provider/live runtime and required video/presentation are missing.                                                                               |
| Arc       | Launch on Arc Testnet & Push to Mainnet                      | `NOT VERIFIED`  | The Arc Testnet integration and fail-closed deployment package exist, but the official requirement must be re-verified against the final Arc mainnet parameters and deployment-ready/deployed state by 2026-09-30; video/presentation is also missing.                                                 |

Not claimed, and the reason:

- **Composable or Standardized Graph Products.** One custom Subgraph does not
  compose two Graph products and does not build on a standardized schema. The
  track text states this does not qualify. Current verdict: `NOT QUALIFIED`.
- **Best Agentic Economy Application with Circle Agent Stack.** Wallet
  authorization and payment execution run through Privy, not the Circle Agent
  Stack, and the calling agent executes an approved obligation rather than
  making autonomous spending decisions. Claiming this track would misrepresent
  the build. Current verdict: `NOT QUALIFIED`.

### Circle stack, Arc, and wallet-provider relationship

**Decision: yes.** Circle/Arc features can be integrated while Privy remains
the primary embedded-wallet and authorization provider. The integration must
preserve a real, load-bearing Privy wallet action; merely keeping Privy login
while moving the judged financial flow to Circle Wallets is not sufficient.

The names describe different layers and must not be used interchangeably:

- **Circle's stack** is the umbrella portfolio: issued assets such as USDC and
  EURC, Arc, Circle Wallets, App Kit, Agent Stack, CCTP, Gateway, StableFX, and
  related contracts/services. It is not one SDK or one custody model.
- **Arc** is Circle's EVM-compatible L1. It is the network on which OneShot
  submits and verifies transactions; it does not dictate which wallet provider
  owns or signs for an account.
- **Circle Wallets** is Circle's separate wallet-as-a-service product with
  developer-controlled, user-controlled, and modular wallet variants.
- **"Arc Wallet"** is not a distinct required product in the prize text. Use it
  only as a generic description of an EVM wallet configured for Arc, and name
  the actual provider—Privy, Circle Wallets, or another provider—in technical
  and submission documentation.

Arc's [official account-abstraction documentation](https://docs.arc.io/arc/tools/account-abstraction)
lists both Privy and Circle Wallets and explicitly says providers, paymasters,
bundlers, and SDKs may be mixed. Arc [App Kit](https://docs.arc.io/app-kit) works
with Viem, Ethers, Circle Wallets, and extensible adapters. Circle Wallets is
therefore an option, not a prerequisite for an Arc prize.

| Integration option                                                     | Compatible with Privy-first design?                  | Eligibility and implementation rule                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct Arc EVM calls and USDC transfers signed by Privy                | Yes; recorded live, runtime incomplete               | Recommended core path. Privy remains source wallet, signer, policy/control, and request identity; Arc remains the settlement and verification rail. Live evidence exists, but the concrete Privy provider/runtime must be checked in before this is implementation-complete.                                                       |
| Arc-native contracts or a OneShot settlement contract, signed by Privy | Yes                                                  | Preserve Privy policy restrictions over chain, contract, method, recipient, and amount. Prove a live Arc interaction and exact receipt/log binding before claiming it.                                                                                                                                                             |
| Arc App Kit with a Privy-backed Viem/Ethers/EIP-1193 adapter           | Yes in principle; not implemented                    | App Kit supports custom wallet clients/adapters, but OneShot must spike the exact Privy-to-adapter signing path without exporting a private key. The Privy policy must still authorize every write and the live evidence must identify Privy as signer.                                                                            |
| USDC/EURC swap, bridge, or Unified Balance flow through App Kit        | Yes in principle; not implemented                    | A strong optional Arc enhancement. Keep the Privy wallet as the initiating signer, preserve integer amounts/idempotency/`UNKNOWN` handling, and add live evidence. Do not claim it from dependencies or mocks.                                                                                                                     |
| Circle Wallets alongside Privy                                         | Yes, only as a separate wallet/role                  | A Circle wallet can fund, receive, or perform a distinct secondary flow. It cannot be described as the same source wallet or the same signing boundary unless an explicitly reviewed delegation/account-abstraction design proves that relationship. The required OneShot settlement must remain a functional Privy wallet action. |
| Replace the OneShot source wallet with Circle Wallets                  | No for the present Privy claims                      | This would remove Privy from the load-bearing financial flow and reduce it to login/branding. It would require a separate qualifying Privy workflow before either Privy track could still be claimed.                                                                                                                              |
| Circle Agent Stack                                                     | Technically coexistence is possible; not implemented | Agent Stack's current first-party path uses Circle CLI and Circle Agent Wallets. A distinct Agent Stack demo could coexist with Privy, but it would add a second wallet/control plane. Do not claim the Agent Stack bounty until an end-to-end Agent Stack wallet/payment/onchain action is live.                                  |

The official Privy prize text does not prohibit a second provider and does not
require Privy to be the exclusive login service. The disqualifying architecture
risk is functional, not contractual: if the judged payment uses Circle Wallets
and Privy is only a login logo, Privy is no longer a core part of that flow.

### Privy authentication and embedded-wallet position

The live evidence uses a Privy embedded **execution wallet** plus a remote
policy; the operator console itself uses OneShot bearer-token service
authentication. The intended baseline names the Privy Node SDK, but
`packages/privy-adapter` currently has no Privy SDK dependency or concrete
Privy API client. `ArcSettlementAdapter` receives an abstract `WalletProvider`,
and production `composeWorker` accepts an optional authorization port; when it
is absent, `executeAuthorizeIntent` currently defaults to `AUTHORIZED`. That
must be removed before the public source can prove the same fail-closed Privy
flow shown in the recorded evidence.

The build also does not currently implement `PrivyProvider`, login-created user
wallets, social/email onboarding, or Privy custom auth.

The missing user-auth features are not a 2026 bounty failure. Both official
Privy tracks require Privy to be core, at least one Privy wallet, a functional
business/financial flow, a working demo, source access, and—for B2B—one Privy
control. They do **not** list custom auth or interactive user onboarding as
mandatory. The live execution wallet and policy-constrained payment meet the
wallet/control requirement, but the public-source and no-bypass requirements
remain `NOT VERIFIED` until the concrete provider path is checked in.

If user-facing onboarding is added, Privy must remain the primary identity and
embedded-wallet layer for that surface: authenticate through Privy (built-in or
custom JWT), create/pregenerate the user's Privy wallet, and delegate only a
policy-scoped signer or quorum to the backend. Treat this as a product UX
enhancement with its own live login/wallet proof, not as a prerequisite and not
as evidence already delivered.

### Bounty compliance checklist — The Graph

Selected track: **Best AI Tooling or AI Use Case with The Graph (From Scratch)**.
The repository's first commit is dated 2026-09-05, after the 2026-09-04 kickoff;
the final ETHGlobal registration must also select Start Fresh and document any
starter material.

| Official requirement                                                            | Status           | OneShot evidence or action                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Graph is load-bearing for the app/agent                                     | `PARTIAL`        | The live proof obtains candidate transfers before the agent recommends read-only reconciliation. The concrete client and service exist, but the production worker defaults to unavailable MCP/model ports and no checked-in runtime bootstrap enables the live pair. Add and demonstrate the fail-closed live configuration. |
| Consume live Graph-provider data; no mock/local/static substitute               | `PASS`           | Synchronized Subgraph Studio `v0.2.1` query and `_meta.hasIndexingErrors: false` are captured in `evidence/c06/graph-proof.json`. Studio is explicitly accepted by the prize text; decentralized allocation is not a stated requirement for this track.                                                                      |
| Index and query relevant blockchain data                                        | `PASS`           | `subgraph/subgraph.yaml`, `schema.graphql`, and `src/mapping.ts` index Arc Testnet USDC `Transfer` events into `UsdcTransfer` and `SettlementCandidate`; the live MCP query filters token, sender, recipient, amount, and block window.                                                                                      |
| Do meaningful AI work with the data                                             | `PASS`           | The live candidate and health metadata are consumed by Gemini 2.5 Flash, which selects `RECONCILE` and explains the need for Arc verification; the deterministic core grants `settlementPermission: NEVER`.                                                                                                                  |
| Open-source code with clear README/SKILL, public repo, two-to-four-minute video | `PARTIAL`        | Public repository and README exist. Record and link a two-to-four-minute public demo showing the MCP call, `_meta`, candidate, model decision, Arc proof, and zero duplicate submission.                                                                                                                                     |
| Select the correct eligibility pool and document prior work                     | `PARTIAL`        | Git history supports Start Fresh. Confirm the ETHGlobal registration and explicitly state that project-specific work began after kickoff.                                                                                                                                                                                    |
| Substreams single-prompt challenge                                              | `NOT APPLICABLE` | Not claimed; OneShot uses a Subgraph and Subgraph MCP.                                                                                                                                                                                                                                                                       |

Overall submission verdict: `NOT VERIFIED` until all `PARTIAL` rows pass.

### Bounty compliance checklist — Arc

Primary selected track: **Best DeFi/Onchain Finance Application**. Secondary
selected track: **Launch on Arc Testnet & Push to Mainnet**. App Kit and Circle
Wallets appear in the product suggestions but are not universal qualification
requirements; the plan must demonstrate effective Arc/USDC use rather than add
unused Circle dependencies.

| Official requirement or judging signal                                                              | Status               | OneShot evidence or action                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meaningful use of Arc and USDC                                                                      | `PASS`               | A real 1.000000 USDC transfer on Arc Testnet (`eip155:5042002`) is bound to the Privy request and recorded in `evidence/c06/sanitized-proof.json`.                                                                                                                                     |
| Advanced programmable money flow                                                                    | `PASS`               | Durable intent, atomic submission ownership, Privy policy authorization, Arc receipt/log verification, and read-only recovery form a conditional multi-step settlement workflow.                                                                                                       |
| Functional backend                                                                                  | `PARTIAL`            | API, worker, PostgreSQL authority, adapters, and reconciliation service are present, but the public source has no concrete Privy `WalletProvider` or production executable that wires it into `composeWorker`; production authorization is also optional. Check in and demo that path. |
| Functional frontend                                                                                 | `PASS ON BRANCH`     | The composed React/Vite operator surfaces and Playwright suite are committed on this branch. They must still be included in the final reviewed source tree and demo.                                                                                                                   |
| Architecture diagram                                                                                | `PASS`               | Public README and this plan contain end-to-end diagrams with Privy, Arc, The Graph, and OneShot authority boundaries.                                                                                                                                                                  |
| Video demonstration and presentation showing effective Circle technology use                        | `MISSING`            | Record and link a concise demo that names the exact Arc track, shows the frontend and backend, executes/replays the Arc flow, and explains Arc/USDC plus Privy's signing role.                                                                                                         |
| Detailed documentation and GitHub/Replit link                                                       | `PASS`               | Public repository, README, provider setup, live evidence, operations, safe-disable, and recovery documentation exist.                                                                                                                                                                  |
| Clearly name the bounty in the submission                                                           | `MISSING`            | Submission must explicitly name each Arc track; repository intent alone is not proof.                                                                                                                                                                                                  |
| Launch track: USDC/EURC or agentic payment added with Arc as core settlement                        | `PASS`               | OneShot is an agent/API payment control plane and Arc is the sole live settlement layer.                                                                                                                                                                                               |
| Launch track: deployed or deployment-ready on Arc mainnet by 2026-09-30                             | `PARTIAL`            | `docs/MAINNET_READINESS.md`, disabled profile, probe, deployment manifest, safe-disable, and rollback exist. Re-check official mainnet parameters after launch, update the artifact, and record `DEPLOYMENT-READY` or `DEPLOYED` evidence by the deadline.                             |
| Agent Stack track: use Agent Stack to connect agents to wallets, USDC payments, and onchain actions | `FAIL / NOT CLAIMED` | No Circle CLI, Circle Agent Wallet, Nanopayments, or other Agent Stack path exists. Privy's wallet path does not satisfy this separate requirement.                                                                                                                                    |

Overall verdict: both selected Arc tracks are `NOT VERIFIED` until the missing
submission artifacts are delivered; the Agent Stack track is `NOT QUALIFIED`.

### Bounty compliance checklist — Privy

Selected tracks: **Best B2B financial product** and **Best financial flow**.

| Official requirement                                                           | Status                           | OneShot evidence or action                                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Privy is a core part of the product                                            | `PARTIAL`                        | The architecture and recorded live evidence make Privy the intended wallet/policy boundary. In source, `ArcSettlementAdapter` accepts a generic injected `WalletProvider`, and no concrete Privy provider is checked in. |
| Create or use at least one Privy wallet                                        | `PASS`                           | Live execution wallet identity and transaction are captured in `evidence/c06/sanitized-proof.json`.                                                                                                                      |
| Business or organization use case                                              | `PASS`                           | OneShot controls a corporate agent's approved B2B API/job payment and exposes operator policy/recovery views.                                                                                                            |
| Functional B2B payment/approval/treasury/wallet workflow                       | `PARTIAL`                        | The allowlisted 1 USDC payment and two zero-broadcast denials are recorded, but the demonstrated provider path is not runnable from the checked-in source.                                                               |
| Use a Privy control: policy, signer, key quorum, or intent                     | `PASS`                           | A scoped Privy policy constrains wallet, Arc network, USDC contract/method, recipient, and cap; live denial drills prove enforcement.                                                                                    |
| Complete a functional financial flow using a generally available Privy feature | `PARTIAL`                        | The recorded Privy wallet action signs/broadcasts the Arc Testnet USDC transfer. Check in the concrete provider implementation and a repeatable testnet demo path; no guided/commercial-only feature is counted.         |
| Working demo and source access                                                 | `PARTIAL`                        | Public source, a B06 record verifier, and sanitized live evidence exist, but the verifier validates a static capture rather than executing the Privy flow. Add the missing provider/runtime code and demonstrate it.     |
| Explain how Privy enables the product and improves UX                          | `PASS`                           | README, architecture, provider setup, and sponsor evidence explain embedded key management, programmatic signing, policy denial, and hidden onchain complexity.                                                          |
| Embedded wallet                                                                | `PASS`                           | The server execution wallet is a Privy embedded wallet. A login-created user wallet is not required by the selected tracks.                                                                                              |
| User onboarding / Privy authentication                                         | `NOT REQUIRED / NOT IMPLEMENTED` | Current operator auth is an application bearer token. Add Privy login only if it improves the product; do not claim it from the wallet integration.                                                                      |
| Custom auth                                                                    | `NOT REQUIRED / NOT IMPLEMENTED` | No official 2026 qualification row requires custom auth. If added, demonstrate verified-token login plus creation/use of the associated Privy wallet.                                                                    |

Overall verdict for both selected Privy tracks: `NOT VERIFIED`. The live record
strongly supports eligibility, but qualification remains blocked on a concrete
Privy provider, mandatory production authorization, and a runnable public demo.
After those pass, preserve the verdict by keeping the required settlement a
Privy wallet action if any Circle wallet feature is added.

```mermaid
flowchart LR
    Unknown[UNKNOWN after lost response] --> Provider{Privy returns original hash}
    Provider -->|yes| Verify[Verify on Arc]
    Provider -->|no| Subgraph[Live OneShot Arc Subgraph]
    Subgraph --> MCP[Subgraph MCP]
    MCP --> RecoveryAgent[LLM Recovery Agent]
    RecoveryAgent -->|RETURN_EXISTING_RESULT with candidate refs| Verify
    RecoveryAgent -->|WAIT / RECONCILE / ESCALATE| Hold[Remain UNKNOWN or run read-only recovery]
    Verify -->|exact final Transfer| Commit[COMMITTED]
    Verify -->|not safely resolved| Hold
```

The Graph and the LLM discover candidates, not truth. Arc RPC can also scan logs without a
hash, so Graph is not mathematically indispensable; it is the selected product
dependency for fast, structured, automatic recovery. Empty, lagging, unhealthy,
or multiple candidate results keep the intent `UNKNOWN`.

The preferred correlation spike uses Arc's official Memo contract:
`memoId = hash(business_intent_id)`. The Graph indexes the Memo event and linked
USDC Transfer, then Arc verifies their shared transaction and exact calldata.
B01 must prove Privy policy can restrict the Memo destination, forwarded USDC
target, and required business parameters. If it cannot, preserve the stricter
policy and use tuple/window candidate search for the demo or a narrow typed
settlement contract; never weaken authorization to obtain a cleaner lookup.

## Product surfaces

| Surface                        | User                        | Purpose                                                                         |
| ------------------------------ | --------------------------- | ------------------------------------------------------------------------------- |
| Agent API and generated client | Autonomous agent or backend | Create/reuse a Business Intent and read its authoritative state                 |
| Operator console               | Company operator            | Inspect attempts, policy decisions, settlement evidence, and recovery state     |
| Execution worker               | OneShot service             | Acquire submission ownership and execute the approved settlement                |
| Reconciliation service         | Agent and operator          | Resolve ambiguous outcomes without blindly paying again                         |
| Audit and recovery timeline    | Company and supplier        | Explain what happened, which evidence is authoritative, and what action is safe |

```mermaid
flowchart LR
    Company[Company operator] -->|wallet policy and limits| Privy[Privy]
    Agent[Autonomous agent] -->|stable business intent| API[OneShot API]
    Agent -.->|requests paid work| SupplierAPI[Paid API or digital supplier]
    API --> Core[OneShot domain]
    Core --> DB[(PostgreSQL authority)]
    DB --> Worker[Execution worker]
    Worker -->|authorized transfer request| Privy
    Privy -->|canonical ERC-20 USDC transaction| Arc[Arc]
    Arc -->|one settlement| SupplierWallet[Supplier wallet]
    Arc --> History[Live OneShot Arc Subgraph]
    DB --> Recovery[Recovery service and view]
    Recovery -->|provider lookup| Privy
    Recovery -->|receipt and log lookup| Arc
    History --> MCP[Subgraph MCP]
    MCP -->|validated live candidates and freshness| RecoveryAgent[LLM Recovery Agent]
    RecoveryAgent -->|four-action recommendation| Recovery
    Recovery --> Agent
    Recovery --> Company
```

OneShot controls payment cardinality. It does not guarantee the quality or
delivery of the supplier's API result; that remains a separate commercial
contract. This diagram shows the current qualifying path. A future Circle Agent
Wallet would be a separate payment rail and must not be shown as implemented or
claimed until the reconsideration checklist in section 5b passes.

## Production roadmap model

- The roadmap targets a working Arc Testnet product plus a mainnet-ready deployment path.
- Work is ordered by domain dependencies and evidence gates.
- A, B, and C progress independently inside frozen contracts and converge only
  through reviewed package entry points, fixtures, and simulators.
- A phase advances when its exit evidence passes; a packet advances when its
  local acceptance contract passes.
- Frontend production work begins after backend convergence freezes the public
  API and recovery semantics.

## 1. Mission and v1 release

Deliver a working application that accepts one approved Business Intent, survives retries, crashes, duplicate delivery, parallel workers, and ambiguous provider responses, and produces at most one committed USDC settlement on Arc Testnet through a Privy-controlled corporate wallet. The same build must include a fail-closed Arc Mainnet profile, deployment and rollback procedure, and readiness evidence so official mainnet values can be enabled without redesigning the domain. Known-identity recovery uses OneShot, Privy, and direct Arc evidence; hashless automatic recovery uses The Graph for candidate discovery.

The release claim is:

`1 Business Intent / N Attempts / <= 1 committed Settlement`

The delivery plan is backend-first. Frontend implementation is deliberately placed in Phase R5 and may start only after the backend contract-freeze gate has passed.

## 2. Planning objectives

This plan optimizes for five properties:

1. Safety: uncertainty never becomes permission to pay again.
2. Independent progress: no coder waits for another coder’s implementation to close a work packet.
3. Low merge contention: each coder owns disjoint directories and shared files have a single editor.
4. Verifiable handoffs: ports, OpenAPI, schemas, fixtures, and simulators are versioned artifacts.
5. Late frontend: UI work consumes a stable backend contract instead of driving it.
6. Network promotion: Arc Testnet proves behavior; Mainnet remains disabled until official network parameters are published, pinned, verified, and human-approved.

## 3. Product success criteria

- Identical requests reuse the same durable Business Intent; conflicting payloads under the same ID fail explicitly.
- Privy authorization constrains every normal settlement path. Wrong network, token, method, recipient, value, or above-cap amount produces zero settlement.
- A valid intent can produce one real ERC-20 USDC transfer on Arc Testnet and persist a verified receipt and Transfer identity.
- A timeout, disconnect, lost response, or crash after possible submission produces durable `UNKNOWN`; a new payment is forbidden until authoritative reconciliation resolves it.
- Ten sequential retries, ten parallel workers, restart recovery, queue redelivery, and two agent instances never produce more than one committed settlement.
- Privy/direct Arc lookup resolves known transaction identities. The LLM Recovery Agent queries The Graph through Subgraph MCP for automatic hashless candidate discovery; absence, delay, malformed/injected output, multiple matches, contradiction, or invalid model output never authorizes payment.
- Money remains a canonical integer string at JSON boundaries and `bigint` internally, using six-decimal ERC-20 USDC atomic units.
- The public repository contains the architecture diagram, setup and operator documentation, and no secrets in history.
- The submission text names each claimed partner track explicitly and states the Arc mainnet-readiness position.
- The demo proves working Privy and Arc integrations with sanitized testnet evidence and no exposed secrets.
- A mainnet-readiness check proves network, token, explorer, policy, deployment, rollback, and safe-disable configuration fail closed while Arc Mainnet is unavailable or its official parameters have not been pinned and explicitly human-approved.
- The Graph sponsor claim is retained only when a sanitized live Subgraph MCP trace proves hashless discovery and meaningful recovery-agent automation beyond direct known-hash lookup, followed by deterministic OneShot/Arc validation.

## 4. Scope

### Included

- Strict TypeScript monorepo, shared contracts, API, worker, PostgreSQL state, migrations, and transactional jobs.
- Privy execution-wallet authorization and fail-closed wallet policy.
- Arc Testnet ERC-20 USDC request construction, submission, receipt verification, and explorer evidence.
- Durable reconciliation using OneShot state, Privy identifiers/status, and direct Arc RPC receipts/logs.
- Provider-neutral candidate-index port, deployment-pinned Subgraph MCP adapter, The Graph deployment/health contract, and freshness/multiple-candidate classification.
- LLM Recovery Agent with structured four-action output and a deterministic, fail-closed OneShot safety core.
- Contract simulators, failure injection, concurrency and restart testing, structured logs, metrics, and operator runbooks.
- Minimal operator/user frontend after backend acceptance.
- Arc Mainnet configuration seam, deployment manifest, readiness probe, safe-disable and rollback runbooks, and the reviewer-facing `MAINNET_READINESS.md`, with real-value execution disabled until values are pinned, verified, and explicitly human-authorized.

### Excluded

- Actual mainnet value transfer before Arc publishes official production access/addresses and a human authorizes the operation; additional chains/assets, swaps, bridges, fiat rails, automatic transaction replacement, and unrestricted payment overrides.
- Any external indexer, Subgraph MCP, or LLM as duplicate lock, durable intent store, settlement authority, or proof that another settlement is safe.
- General workflow automation, arbitrary supplier/ERP integrations, native mobile clients, production compliance certification, or multi-region HA.
- UI polish that is not necessary to demonstrate the invariant and sponsor requirements.

### Post-MVP production path

The implementation commitment includes a working testnet MVP and mainnet-ready
deployment artifacts. Real-value activation remains a separate human-controlled gate:

1. **Mainnet activation:** pin official Arc Mainnet chain, RPC, explorer, USDC and contract identities; rerun compatibility, security, rollback, and safe-disable checks; require explicit human authorization.
2. **Limited production pilot:** add tenant authorization, retention/deletion policy, backup/restore proof, allowlisted organizations, conservative spending caps, incident response, monitoring, and staged rollout with no automatic migration of testnet state.
3. **Product expansion:** invoice and procurement connectors, subscriptions,
   supplier APIs, additional settlement networks/assets, and higher-availability
   deployment only after the core invariant remains proven in the pilot.

P0-P6 delivers testnet functionality and mainnet readiness. Actual production activation and real-value pilot execution remain outside automatic agent authority.

### Deployment path

```mermaid
flowchart LR
    Local[Local and simulator proof] --> Testnet[Working Arc Testnet product]
    Testnet --> Ready[Disabled Arc Mainnet profile and deployment evidence]
    Ready --> Values{Arc public mainnet live, values pinned and verified}
    Values -->|no| Hold[Remain testnet-only]
    Values -->|yes| Human{Human security and launch approval}
    Human -->|no| Hold
    Human -->|yes| Pilot[Allowlisted real-value pilot]
```

Testnet proves product behavior. Mainnet readiness proves configurability,
deployment, safe disable, and rollback. It never grants an agent permission to
activate real-value execution.

## 5. Fixed technical baseline

| Area                               | Technology and decision                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                            | Current active Node.js LTS, pinned by A01, with strict TypeScript                                                                                                                                                                                                                                                                                                                                 |
| Workspace                          | `pnpm` monorepo with package-local lint, type, test, and build commands                                                                                                                                                                                                                                                                                                                           |
| API and contracts                  | Fastify HTTP JSON API, JSON Schema, OpenAPI source of truth, and generated-client/schema drift checks                                                                                                                                                                                                                                                                                             |
| Authoritative state                | PostgreSQL, explicit SQL migrations, `pg`, uniqueness constraints, compare-and-set transitions, and transactional outbox records                                                                                                                                                                                                                                                                  |
| Work delivery                      | Graphile Worker over the same PostgreSQL database; at-least-once delivery is assumed                                                                                                                                                                                                                                                                                                              |
| EVM encoding and RPC               | `viem` for typed addresses, calldata, chain access, receipt reads, and log verification                                                                                                                                                                                                                                                                                                           |
| Authorization                      | Concrete Privy server-wallet client using the official Node SDK/API, execution wallet, scoped wallet policy, persisted idempotency key, and reference identity. The concrete client and production bootstrap remain to be checked in.                                                                                                                                                             |
| Settlement profiles                | Arc Testnet `eip155:5042002` and its official USDC interface are the only enabled live profile; the Arc Mainnet profile contains no guessed network values and remains disabled until official parameters are published, pinned, verified, and human-approved                                                                                                                                     |
| Hashless discovery and AI recovery | `IndexViewPort` is provider-neutral; the immutable Studio deployment above is the selected v1 target. Live C06 evidence proves the lost-hash flow, freshness, degradation behavior, and AI-track fit. Production still defaults to unavailable MCP/model ports until an explicit, fail-closed live bootstrap is checked in; Graph Network allocation is optional for the selected official track. |
| Money                              | Canonical integer strings at JSON boundaries and `bigint` internally; no JavaScript monetary floats                                                                                                                                                                                                                                                                                               |
| Frontend                           | React and Vite, generated OpenAPI client, exact integer amount formatting, and no direct settlement capability                                                                                                                                                                                                                                                                                    |
| Testing                            | Vitest for unit/contract tests, Testcontainers for PostgreSQL integration, Playwright for browser flows, deterministic failure simulators, and Graph adapter/degradation tests                                                                                                                                                                                                                    |
| Local and CI                       | Docker Compose for reproducible local services and GitHub Actions for install, lint, type, test, build, migration, contract, and policy checks                                                                                                                                                                                                                                                    |
| Submission jobs                    | One queue attempt; the task persists `COMMITTED`, `FAILED_SAFE`, or `UNKNOWN` before returning                                                                                                                                                                                                                                                                                                    |
| Recovery authority                 | PostgreSQL state and verified Arc evidence are authoritative; Privy may locate the original request; Subgraph MCP supplies freshness-labeled Graph candidates to the LLM; the deterministic core constrains every recommendation and neither MCP nor the model grants settlement permission                                                                                                       |

Exact dependency versions are pinned only after A01/B01 compatibility spikes.
The exact v1 contracts, state table, fixture catalog, redaction rules, and change
protocol are frozen in [`milestones/CONTRACTS.md`](milestones/CONTRACTS.md).

## 5b. Arc qualification and evidence

Arc has distinct prize mechanics. The submission can select up to three partner
prize slots, while multiple tracks from one partner count as one slot. The plan
therefore treats Arc as one partner slot with two intended claims. The Agent
Stack track is recorded separately as unclaimed because its mandatory Circle
Agent Stack integration is not implemented.

| Arc track                                                | What the judges must see                                                                                                                                         | Current position                                                                                                                 | Required proof before claiming                                                                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Launch on Arc Testnet & Push to Mainnet                  | Working Arc integration, real USDC/EURC settlement or escrow flow, public repo/docs/video, and a mainnet-ready path by 30 September                              | `NOT VERIFIED`; Arc/Privy Testnet flow and a fail-closed Mainnet profile exist                                                   | Repeatable Arc Testnet transaction, readiness/rollback artifact, 2-4 minute demo, explicit mainnet-disable evidence, and final official mainnet-parameter verification                   |
| Best DeFi / Onchain Finance Application                  | Meaningful Arc/USDC programmable money flow such as conditional, automated, or multi-step settlement                                                             | `NOT VERIFIED`; the conditional OneShot settlement is implemented                                                                | Concrete Privy provider/runtime wiring, Arc receipt, policy outcome, one-intent/one-settlement trace, architecture/docs, and the required video/presentation                             |
| Best Agentic Economy Application with Circle Agent Stack | An autonomous agent holds/uses a wallet, makes an agent payment or pays a service, manages risk, and uses Agent Stack to connect to wallets/USDC/onchain actions | `NOT QUALIFIED`; no Circle package, Agent Wallet, or live Agent Stack trace is in the current base, so this track is not claimed | Only reconsider after Circle Agent Stack + Agent Wallet/Skills, spend-cap enforcement, a real Arc testnet paid request or onchain action, and sanitized intent-to-receipt evidence exist |

The shared submission artifacts remain:

| Arc requirement                              | Satisfied by                                                                                                                              | Owner | Artifact                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------- |
| Working backend                              | API, worker, PostgreSQL authority, Privy and Arc adapters, concrete Privy provider, and production bootstrap with mandatory authorization | A/B   | Gate P4 package composition plus P6 runnable live composition |
| Working frontend                             | A05, B05, C05 slices on React and Vite against the frozen OpenAPI                                                                         | A/B/C | Gate P5                                                       |
| Architecture diagram                         | Diagrams exported from this plan into the public repository README                                                                        | A     | `README.md`                                                   |
| Video demonstration and presentation         | Scripted demo covering the invariant, Privy authorization, and Arc USDC flow                                                              | B     | Submission video, 2-4 minutes                                 |
| Detailed documentation                       | README, setup guide, operator and recovery runbooks                                                                                       | A/B   | Public repository                                             |
| Public repository link                       | Public GitHub repository, secret-scanned history                                                                                          | A     | Repository URL                                                |
| Explicit bounty naming                       | Submission text names both claimed Arc tracks                                                                                             | B     | Submission form                                               |
| Mainnet deployment-readiness by 30 September | Disabled Mainnet profile, deployment manifest, readiness probe, rollback runbook                                                          | A/B   | `MAINNET_READINESS.md` in the public repository               |

ETHOnline's current submission mechanics add a hard packaging constraint:
submit by 13 September 2026 at 12:00 PM EDT, select no more than three partner
prize slots, and keep the demo/presentation within 2-4 minutes. Arc is one
partner slot even when multiple Arc tracks are claimed. Do not spend submission
time on Circle Agent Stack unless that separate integration becomes real and the
claim mapping is re-audited.

### Minimum Arc-qualifying frontend

Arc requires a working frontend on every track, so the interface is a
qualification requirement and not optional polish. The minimum qualifying set
is:

1. Create or reuse a Business Intent.
2. Read authoritative intent status.
3. View a committed settlement with its Arc explorer link.
4. View an `UNKNOWN` intent with its recovery timeline and evidence provenance.

Anything beyond these four is cuttable. These four are not.

### Early contract freeze for frontend start

A05, B05, and C05 build against the frozen mock server and need no live
services. The real frontend blocker is therefore the OpenAPI freeze inside Gate
P4, not the live settlement proof. Freeze and publish the OpenAPI and
recovery-view semantics as soon as A04 stabilises them, ahead of live testnet
evidence, so frontend work can start while B is still obtaining live proof.

Gate P4 remains the composition and live-proof gate. This rule changes only when
the contract is published, never what P4 must prove.

### Optional future Circle Agent Stack surface

This is a contingency plan, not part of the current sponsor claim. A future
Circle Agent Stack integration would use the Circle CLI and Skills to
provision/use an Agent Wallet with explicit spending controls. It would need a
live Arc Testnet-compatible Circle path for one of these
meaningful actions:

1. discover and pay a paid API/service request (x402 or another documented
   Circle-supported agent-payment flow); or
2. execute a bounded USDC action on Arc that is visible in the agent trace and
   verifiable on-chain.

The first option would make the agentic-economy value obvious:
the agent chooses a service, presents the payment/approval decision, pays within
its cap, receives the result, and OneShot records the obligation and outcome.
Circle Agent Stack must be visible in code/configuration, the architecture
diagram, and the 2-4 minute video before that track is claimed; a README-only
reference or logo does not count.

The authorization boundary is explicit. Privy remains the corporate wallet and
the canonical OneShot settlement rail. The Circle Agent Wallet may execute only
the bounded agent-service demo lane, behind a new provider-neutral port and the
same durable Business Intent/idempotency policy. Circle or the agent cannot
authorize a hashless recovery settlement, mutate sponsor policy, or bypass
OneShot's one-intent/one-settlement core. If the Circle flow cannot preserve this
boundary, it is removed from the claimed track rather than weakening the design.

App Kit may be added only if it supplies a visible wallet/USDC UI used in the
demo. Circle Contracts, CCTP, Gateway, StableFX, Paymaster, and Nanopayments are
not default scope: each requires a concrete user-facing Arc use case, a tested
adapter, and live evidence. No Circle product is added solely to widen the logo
surface.

### Circle Agent Stack reconsideration checklist

The Agent Stack track remains `NOT QUALIFIED` and unclaimed until all of the
following are recorded and the Privy prize impact is re-audited:

- Circle Agent Stack setup is reproducible from the public repository without
  committing credentials; secrets remain in approved ignored/CI stores.
- A Circle Agent Wallet is configured for the supported Arc Testnet path with a
  per-transaction cap and daily cap; the actual values are external secret/config
  state, not hard-coded plan claims.
- The agent performs one real testnet service payment or USDC action, and the
  evidence binds the Business Intent ID, Circle operation/reference, Arc
  transaction hash or paid response, recipient, amount, network, and timestamp.
- An over-cap or denied action produces zero settlement, and a lost/ambiguous
  response remains `UNKNOWN` until deterministic reconciliation; no blind retry
  or second broadcast is allowed.
- The demo shows the agent decision, Circle approval/control, OneShot durable
  state, and Arc verification in under four minutes, with sanitized logs and
  public links.
- A sponsor-qualification review upgrades the claim only after the exact tree,
  live evidence, and required CI pass.

### Network constants

Arc Testnet chain and token identities are pinned only after B01 verifies them
against official Arc documentation. Chain `eip155:5042002` and the USDC
interface address recorded in section 5 are treated as unverified inputs until
that check passes and is recorded in the B01 handoff.

### Mainnet-readiness statement

Arc public mainnet is not available at planning time. Only Arc Testnet has
published network parameters and can be deployed and exercised by the team.
OneShot therefore claims a working Testnet integration and Mainnet readiness,
not a Mainnet deployment.

The Mainnet profile contains no guessed chain ID, RPC, explorer, token, or
contract values. It remains disabled until Arc publishes official parameters,
B01 pins and verifies them, and a human explicitly authorizes activation.

Because verification happens after the event, readiness evidence must live in
the public repository rather than only in the submission form.
`MAINNET_READINESS.md` is the single reviewer-facing artifact and contains:

- the pinned Arc mainnet chain, RPC, explorer, and USDC identities, or an
  explicit note that a value awaits publication at launch;
- the deployment manifest and the exact commands that perform deployment;
- readiness-probe output showing every check passing against the disabled
  profile;
- the rollback and safe-disable procedure;
- the current status line: `DEPLOYMENT-READY` or `DEPLOYED` with its evidence.

Real-value execution stays disabled until a human authorizes activation. If the
team deploys after 16 September, only the status line and its evidence change;
no domain or contract work is required.

The submission text states the readiness position plainly and points to this
file.

## 6. Architecture

```mermaid
flowchart TB
    Clients[Agent API client and operator console] --> API[apps/api - Fastify]
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
    SettlementPort --> ArcAdapter[packages/arc-adapter]
    EvidencePort --> PrivyAdapter
    EvidencePort --> ArcAdapter
    IndexPort -.-> MCPAdapter[packages/subgraph-mcp-adapter]
    AdvisorPort --> RecoveryAgent[packages/recovery-agent]

    PrivyAdapter --> Privy[Privy wallet and policy]
    ArcAdapter --> Arc[Arc USDC and RPC]
    RecoveryAgent --> MCPAdapter
    MCPAdapter --> MCP[Subgraph MCP]
    MCP --> GraphIndex[Live OneShot Arc Subgraph]
    GraphIndex -.-> Arc
```

The selected recovery path is explicit:

```text
The Graph Subgraph
        ↓
Subgraph MCP
        ↓
LLM Recovery Agent
        ↓
WAIT / RECONCILE / ESCALATE / RETURN_EXISTING_RESULT
        ↓
deterministic OneShot safety core
```

`WAIT` preserves uncertainty. `RECONCILE` requests another read-only evidence
cycle. `ESCALATE` requests operator attention. `RETURN_EXISTING_RESULT` supplies
candidate references that the core must independently verify using current
OneShot/Arc evidence. None is a submit or retry command. Detailed entity, state,
sequence, and ownership diagrams live in [`docs/DOMAIN_ARCHITECTURE.md`](docs/DOMAIN_ARCHITECTURE.md).

## 7. Team topology and exclusive ownership

### Coder A — domain and orchestration

Owns:

- `packages/contracts`
- `packages/domain`
- `packages/storage-postgres`
- `packages/testkit-domain`
- `apps/api`
- `apps/worker`
- root workspace/build configuration after the initial scaffold
- migrations and OpenAPI

Coder A never implements provider-specific Privy, Arc, or external-index behavior.

### Coder B — authorization, Circle, and settlement adapters

Owns:

- `packages/privy-adapter`
- `packages/arc-adapter`
- `packages/testkit-settlement`
- Privy policy and official-response fixtures
- Arc network, transaction, and receipt validation
- optional Circle Agent Stack/Agent Wallet compatibility spike only after the
  current Privy + Arc + The Graph submission path is complete
- human-run provider setup documentation

Coder B never changes domain tables or state meanings directly.

### Coder C — reconciliation and recovery evidence

Owns:

- `packages/reconciliation`
- `packages/recovery-agent`
- `packages/subgraph-mcp-adapter` and the completed C01 live-value evidence
- `packages/testkit-failures`
- `subgraph/` source and deployment metadata; runtime Graph admission remains gated on explicit configuration and human-reviewed evidence even though the Studio/MCP qualification proof is complete
- recovery-view schemas and queries
- failure matrix orchestration and recovery runbooks

Coder C issues state commands only through the frozen reconciliation command contract.

### Shared-file rule

- Coder A is the sole editor of root workspace files, root scripts, OpenAPI, and migrations after scaffold freeze.
- B and C provide package-local manifests, fixtures, and integration notes; A composes them through additive root changes.
- A shared contract change is additive first. Removal occurs only after all consumers have migrated.
- No package imports another owner’s implementation package. Cross-track use occurs through contracts, fixtures, simulators, or published package entry points.

## 8. Independence model

### 8.1 Work-packet closure

Each file under `milestones/coder-a`, `milestones/coder-b`, or `milestones/coder-c` is an independently closable milestone. A coder closes it when its local acceptance criteria, package checks, handoff artifact, and review requirements pass. Closure never requires another coder’s branch, approval, credentials, service, or unfinished implementation.

### 8.2 Allowed prerequisites

A work packet may depend only on:

- the frozen v1 contract pack in `milestones/CONTRACTS.md`;
- committed fixtures or simulators included in that contract pack;
- the same coder’s immediately preceding packet;
- human-provided credentials only for explicitly marked live-evidence checks, with an offline fixture path that still allows packet closure.

Cross-coder artifacts are integration inputs, never closure prerequisites. If a real artifact is unavailable, the consumer uses the versioned simulator and records final live verification under a project gate.

### 8.3 No-wait continuation rule

When a coder closes a packet, they immediately begin their next packet. They do not wait for a global milestone meeting. A broken cross-track contract opens a small additive compatibility ticket; it does not freeze unrelated work.

### 8.4 Contract packs

Every producer publishes a package-local contract pack containing:

- version and compatibility range;
- TypeScript types or JSON Schema;
- one happy-path fixture and every relevant terminal/error fixture;
- deterministic simulator;
- package-local verification command;
- redaction statement;
- short migration note for additive changes.

Consumers validate against the pack, not against a producer’s active branch.

### 8.5 Async communication

- Each PR description is the handoff record: outcome, immutable contract version, commands, evidence, risks, and safe-disable behavior.
- Questions default to a written assumption plus a fail-closed implementation. Only decisions that could weaken settlement cardinality, money representation, authorization, or `UNKNOWN` handling require synchronous escalation.
- Daily status is informational and never an approval gate.

## 9. Delivery phases and dependency gates

The three lanes run in parallel. Phase order expresses dependency and product
readiness only. A lane may begin its next packet as soon as its own acceptance
contract passes.

| Phase                            | Entry condition                 | Coder A                                 | Coder B                                     | Coder C                               | Exit evidence                                                      |
| -------------------------------- | ------------------------------- | --------------------------------------- | ------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| R0 — product and contract freeze | Product vertical selected       | Confirm domain/API contract             | Confirm provider/chain contract             | Confirm recovery/evidence contract    | P0 approved scope and immutable v1 pack                            |
| R1 — independent foundations     | P0                              | A01                                     | B01                                         | C01                                   | P1 runnable toolchains and recorded compatibility findings         |
| R2 — durable core and adapters   | Own R1 packet                   | A02                                     | B02                                         | C02                                   | P2 compatible contract packs and simulators                        |
| R3 — safety under failure        | Own R2 packet                   | A03                                     | B03                                         | C03                                   | P3 concurrency, ambiguity, and failure proofs                      |
| R4 — backend convergence         | A03/B03/C03 artifacts available | A04 and composition owner               | B04 and live settlement evidence            | C04 and live recovery evidence        | P4 integrated backend, one real settlement, lost-response recovery |
| R5 — product interface           | P4                              | A05 application shell                   | B05 policy/settlement slice                 | C05 recovery/history slice            | P5 composed operator experience                                    |
| R6 — hardening and release       | P5                              | A06 operations/mainnet-readiness bundle | B06 Privy/Arc evidence and network profiles | C06 Graph discovery/recovery evidence | P6 repeatable testnet release plus mainnet-readiness candidate     |

Provider access, SDK incompatibility, or failed integration evidence opens an
owner-specific compatibility task. It never weakens the safety invariant or
silently changes a contract.

## 10. Work-packet inventory

| ID                                                              | Owner | Own-track prerequisite | Independently verifiable output                                 |
| --------------------------------------------------------------- | ----- | ---------------------- | --------------------------------------------------------------- |
| [A01](milestones/coder-a/A01-foundation-contracts.md)           | A     | Frozen contract pack   | Workspace, contracts package, OpenAPI, domain simulator         |
| [A02](milestones/coder-a/A02-durable-intents.md)                | A     | A01                    | PostgreSQL intent/replay/conflict API                           |
| [A03](milestones/coder-a/A03-atomic-worker.md)                  | A     | A02                    | Atomic worker and at-most-once fake-port proof                  |
| [A04](milestones/coder-a/A04-restart-operations-composition.md) | A     | A03                    | Restart-safe orchestration and simulator composition            |
| [A05](milestones/coder-a/A05-frontend-intent-status.md)         | A     | A04 + project Gate P4  | Intent/status frontend slice against mock server                |
| [A06](milestones/coder-a/A06-release-operations.md)             | A     | A05                    | Operational demo and release bundle                             |
| [B01](milestones/coder-b/B01-sdk-network-compatibility.md)      | B     | Frozen contract pack   | SDK/network compatibility and readiness package                 |
| [B02](milestones/coder-b/B02-request-policy-receipt.md)         | B     | B01                    | Canonical request, policy, and receipt verifier                 |
| [B03](milestones/coder-b/B03-live-settlement-harness.md)        | B     | B02                    | Offline-complete plus live-ready settlement harness             |
| [B04](milestones/coder-b/B04-ambiguity-integration.md)          | B     | B03                    | Conservative outcomes and production adapter pack               |
| [B05](milestones/coder-b/B05-frontend-settlement-details.md)    | B     | B04 + project Gate P4  | Authorization/settlement UI slice against fixtures              |
| [B06](milestones/coder-b/B06-sponsor-evidence.md)               | B     | B05                    | Privy/Arc sanitized evidence bundle                             |
| [C01](milestones/coder-c/C01-recovery-evidence-strategy.md)     | C     | Frozen contract pack   | Recovery evidence contract and live Subgraph MCP value decision |
| [C02](milestones/coder-c/C02-reconciliation-engine.md)          | C     | C01                    | LLM recommendations plus deterministic reconciliation contract  |
| [C03](milestones/coder-c/C03-failure-injection.md)              | C     | C02                    | Cross-source chaos and restart harness                          |
| [C04](milestones/coder-c/C04-recovery-matrix-integration.md)    | C     | C03                    | Recovery matrix and simulator integration pack                  |
| [C05](milestones/coder-c/C05-frontend-recovery.md)              | C     | C04 + project Gate P4  | Recovery timeline UI slice against fixtures                     |
| [C06](milestones/coder-c/C06-qualification-demo.md)             | C     | C05                    | Recovery and conditional-index qualification bundle             |

Each packet contains smaller, one-commit-sized tasks, exact acceptance criteria, tests, output artifacts, and a no-wait continuation instruction.

## 11. Dependency graph

```mermaid
flowchart LR
    Contract[Frozen v1 contract pack]

    Contract --> A01 --> A02 --> A03 --> A04
    Contract --> B01 --> B02 --> B03 --> B04
    Contract --> C01 --> C02 --> C03 --> C04

    A04 --> P4{P4 backend convergence}
    B04 --> P4
    C04 --> P4

    P4 --> A05 --> A06
    P4 --> B05 --> B06
    P4 --> C05 --> C06

    A06 --> P6{P6 release candidate}
    B06 --> P6
    C06 --> P6
```

The lane arrows are same-owner dependencies. Gate P4 is the intentional
backend convergence point. A04/B04/C04 close against contract simulators; P4
replaces them with exact reviewed package entry points and live testnet
evidence before frontend work begins.

## 12. Project gates

Project gates coordinate the product but are not coder work-packet closure conditions.

### P0 — plan and contract approval

- Human accepts the product scope, v1 state machine, port semantics, ownership, fixture catalog, and test seams.
- The plan commit is present on the chosen implementation base.
- Each coder creates a worktree/branch from the same base SHA.

### P1 — independent toolchains

- A01, B01, and C01 each pass package-local checks without third-party credentials.
- Every lane can continue using only committed fixtures and simulators.
- SDK/tooling compatibility findings are recorded before contract-pack convergence.

### P2 — contract-pack compatibility

- A02, B02, and C02 contract packs validate against the frozen schemas.
- Drift checks show no breaking change.
- Any additive extension has a compatibility note and old fixture support.

### P3 — independent safety proofs

- A03 proves atomic submission ownership with a fake counter.
- B03 proves conservative provider outcomes offline and is ready for human-enabled testnet evidence.
- C03 proves missing, lagging, contradictory, and unavailable evidence cannot unlock payment.

### P4 — backend convergence and live proof

This is the frontend unlock gate.

- A composition branch replaces simulators with reviewed B and C package entry points.
- Root lint, type, unit, integration, contract, build, migration, concurrency, restart, and failure checks pass.
- The complete `.agent/TEST_MATRIX.md` records durable final state and external settlement count.
- One real allowed Arc Testnet payment commits exactly once through Privy.
- Wrong-scope and above-cap cases produce zero settlement.
- A lost-response scenario reaches `UNKNOWN` and reconciles to the original transaction without a duplicate.
- The lost-hash scenario queries live The Graph data through Subgraph MCP, shows the LLM selecting/explaining candidates, uses direct Arc evidence to verify the bound transaction, and makes no second submission; stale, empty, malformed, injected, multiple, contradictory, or invalid-model results remain `UNKNOWN`.
- OpenAPI and recovery-view semantics are frozen for frontend.

### P5 — frontend acceptance

- A05, B05, and C05 compose against the frozen API.
- Browser tests cover create, replay, conflict, denial, committed, `UNKNOWN`, Graph discovery, Graph lag/error/multiple-candidate, and service-unavailable states.
- No force-pay or unguarded settlement action exists.
- Accessibility smoke, responsive layout, lint, type, build, and no-secret checks pass.

### P6 — release candidate

- A06, B06, and C06 evidence bundles compose into one repeatable testnet demo.
- The disabled Arc Mainnet profile passes configuration, deployment-manifest, readiness, safe-disable, and rollback checks without sending a mainnet transaction.
- Sponsor qualification cites working code, tests, live evidence, network, and limitations.
- Safe-disable and recovery runbooks work without manual database surgery.
- Exact candidate tree passes repository checks and mandatory independent review gates before human merge.

## 13. Test ownership

| Required case                                                                        | Producer | Independent local proof              | Project-gate proof                       |
| ------------------------------------------------------------------------------------ | -------- | ------------------------------------ | ---------------------------------------- |
| Normal job                                                                           | A        | Domain fake settlement counter       | P4 real adapter                          |
| Same request twice                                                                   | A        | HTTP + PostgreSQL                    | P4 composed worker                       |
| Conflicting payload, same ID                                                         | A        | HTTP + PostgreSQL                    | P4 recovery view                         |
| 10 sequential retries                                                                | A        | Worker + fake port                   | P4 adapter call count                    |
| 10 parallel workers                                                                  | A        | Real PostgreSQL concurrency          | P4 composed worker                       |
| Crash before submission                                                              | A        | Worker kill point                    | P4 zero external settlement              |
| Crash after possible submission                                                      | B        | Adapter fault fixture                | P4 durable `UNKNOWN`                     |
| Lost payment response                                                                | B        | Proxy/fixture                        | P4 original transaction reconciled       |
| Graph/MCP delay, absence, malformed data, multiple candidates, or invalid LLM output | C        | Provider-neutral MCP/agent simulator | P4 remain `UNKNOWN`; no submission grant |
| Privy denial/above cap                                                               | B        | Policy fixture/live-ready harness    | P4 zero settlement                       |
| Service restart                                                                      | A        | Process orchestration                | P4 evidence durability                   |
| Downstream failure after payment                                                     | A        | Supplier fake                        | P4 original receipt retained             |
| Two agent instances                                                                  | A        | Two processes + fake counter         | P4 single settlement history             |

## 14. Frontend-last rule

No production frontend implementation begins before Gate P4. Prior to P4, coders may only define JSON fixtures, OpenAPI examples, and non-production mock-server behavior needed to test backend contracts. They may not build screens, components, styling, or browser flows.

After P4, the three frontend packets remain independent:

- A05 owns application shell, create/replay/conflict, and authoritative status.
- B05 owns policy, authorization, transaction, and explorer details.
- C05 owns recovery timeline, evidence provenance, Subgraph MCP/agent trace, Graph freshness/candidate state, and escalation.

Each slice is built against the frozen mock server. Final composition is a project gate, not a packet closure requirement.

## 15. Branch and merge strategy

- One packet equals one short-lived branch and focused PR, for example `milestone/a01-foundation-contracts`.
- Branch from the recorded implementation-base SHA. A coder’s next branch may start from their own previous approved packet without waiting for unrelated lanes.
- Never mix two owners’ directories in one packet PR.
- Contract changes use expand-migrate-contract: add new form, retain old form, migrate consumers independently, then remove old form in a separate task.
- Coder A owns root composition and resolves shared/root conflicts. B and C never edit root files simply to make local tooling work; they use package-local commands.
- Each implementation change follows `.agent/IMPLEMENTATION_LOOP.md`. Agents do not merge PRs.

## 16. Human-only external configuration

Coder B produces a repeatable setup guide or wizard, while Coder C documents Graph deployment and Subgraph MCP/model configuration. A human performs Privy application/wallet/key-quorum/policy creation, Arc Testnet funding, every gateway/model credential entry, Mainnet profile activation, and CI-secret configuration.

- Secret input is hidden and written only to ignored runtime files or approved secret stores.
- Public network, contract, deployment, and policy identifiers are separated from secrets.
- Policy replacement, ownership change, funding, deployment, or other external mutation requires explicit confirmation.
- Offline fixtures keep all coder packets closable when credentials or services are unavailable.
- Agents never paste secrets into context records, reviews, logs, fixtures, or PRs.

## 17. Observability and operations

- Correlation fields: Business Intent ID, Attempt ID, settlement version, Privy reference/transaction ID, Arc transaction hash, active network profile, Graph deployment/observed block, MCP request/tool identity, and recovery-agent decision identity.
- Never log signatures, credentials, private keys, raw authorization bodies, or private wallet material.
- Metrics: intent states, oldest/count `UNKNOWN`, transition conflicts, queue lag, reconciliation outcomes, policy denials, provider/RPC errors, Graph lag/health/candidate count, duplicate and conflict counts.
- Safe disable stops new submission ownership while preserving status, evidence ingestion, and reconciliation reads.
- Operators inspect durable identity and evidence. There is no generic retry or force-pay button.

## 18. Risk controls

| Risk                                                  | Fail-closed mitigation                                                                                                                         | Owner |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Privy idempotency expires                             | PostgreSQL uniqueness remains authoritative; reuse stored key/body only as supplemental guard                                                  | A/B   |
| SDK or policy syntax changes                          | B01 pins after compatibility proof; readiness validates policy identity and network                                                            | B     |
| ERC-20/native precision confusion                     | Six-decimal ERC-20 is the only settlement amount; native balance is gas only                                                                   | B/C   |
| Lost response after broadcast                         | Persist identity first, enter `UNKNOWN`, reconcile, forbid another payment                                                                     | All   |
| Pending/evicted Arc transaction                       | Hold `UNKNOWN`; no automatic replacement in v1                                                                                                 | B/C   |
| Graph/MCP lag, error, empty/malformed/multiple result | Surface provenance, freshness, and candidate ambiguity; never infer non-payment                                                                | C     |
| Prompt injection or unsupported LLM action            | Treat tool content as untrusted data; validate the four-action structured output and fail closed                                               | C     |
| Queue redelivery                                      | Domain CAS/constraints plus single-attempt submission task                                                                                     | A     |
| Shared-file conflicts                                 | Exclusive path ownership and A-only root composition                                                                                           | A     |
| Credentials unavailable                               | Offline contract packs and simulators remain sufficient for packet closure                                                                     | B     |
| Scope pressure                                        | Cut webhooks, rolling policy support, visual polish, and optional telemetry before safety                                                      | All   |
| P4 slips and the frontend never ships                 | Publish the OpenAPI freeze early so frontend slices start against the mock; cut to the four minimum screens rather than dropping the interface | A     |
| Arc network constants wrong or changed                | B01 verifies chain, RPC, explorer, and USDC identities against official Arc docs before pinning; readiness probe re-checks them                | B     |
| Arc mainnet launches 16 September, after submission   | Ship deployment-readiness evidence in `MAINNET_READINESS.md`; optional post-launch deployment changes only the status line                     | A/B   |
| Readiness evidence not reachable after the event      | Keep the reviewer-facing artifact in the public repository, not only in the submission form                                                    | A     |
| Thin Circle tool surface questioned                   | Record the deliberate decision in section 5b and defend it in the submission rather than adding unused Circle products                         | B     |

## 19. Definition of done for every packet

- Scope, non-goals, consumed contract version, and acceptance criteria are explicit.
- The smallest public-seam test is written first and passes with the implementation.
- Package-local format, lint, type, test, and build commands pass where present.
- Payment/retry work asserts durable state and external settlement count.
- Boundary validation, integer money, redaction, testnet restriction, and safe-disable impact are covered.
- Contract pack, fixtures, simulator, docs, and `.env.example` are updated when applicable, without secrets.
- No unrelated owner path or shared root file is changed.
- The packet handoff lists exact artifact/version, commands, evidence, residual risks, and next same-owner packet.
- Repository FreePi/CI/human-review policy is satisfied. Agents never merge.

## 20. Packet-to-outcome traceability

| Packet | Primary product outcome                                                   | Principal proof                                                                |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A01    | Stable public seams and deterministic local development                   | Contract/schema drift and simulator tests                                      |
| A02    | Durable create, replay, conflict, and status behavior                     | Real PostgreSQL API tests                                                      |
| A03    | One submission owner under redelivery/concurrency                         | Ten-worker/two-process counter proof                                           |
| A04    | Restart-safe, operable backend composition                                | Restart matrix, safe disable, simulator root suite                             |
| A05    | Safe intent creation and authoritative status UI                          | Frozen-mock browser/accessibility tests                                        |
| A06    | Repeatable invariant, operations, and mainnet-readiness bundle            | Clean bootstrap, scenario table, disabled-profile readiness and rollback proof |
| B01    | Known-compatible provider/network boundary                                | SDK spike and fail-closed readiness tests                                      |
| B02    | Exact request/policy/receipt semantics                                    | Golden calldata, deny matrix, receipt corpus                                   |
| B03    | Testnet-capable policy-constrained settlement                             | Offline harness plus optional sanitized live proof                             |
| B04    | Conservative handling of provider ambiguity                               | Fault taxonomy and lookup contract suite                                       |
| B05    | Safe authorization/transaction UI                                         | Fixture-driven component and redaction tests                                   |
| B06    | Verifiable Privy/Arc sponsor evidence                                     | Policy denial and real transfer evidence bundle                                |
| C01    | Minimal recovery evidence strategy with an explicit Subgraph MCP decision | Removal/value matrix, live MCP spike, and provider-neutral contract tests      |
| C02    | Meaningful AI recovery within deterministic zero-submit reconciliation    | Four-action recommendation matrix and safety-core tests                        |
| C03    | Safety under loss, lag, contradiction, and restart                        | Seeded failure-injection suite                                                 |
| C04    | Recovery service ready for real adapter replacement                       | Simulator composition and matrix report                                        |
| C05    | Accurate recovery/evidence UI                                             | Degraded-evidence component tests                                              |
| C06    | Verifiable Subgraph MCP/AI recovery evidence                              | Live MCP/agent/core trace, degraded demo, qualification report                 |

Every success criterion in Section 3 has at least two independent proof surfaces: a producer packet and a later project-gate verification. Packet closure establishes the producer proof; it never claims final integrated behavior by itself.

## 21. Execution environments

### Offline contract mode

Purpose: default mode for every coder packet.

- Uses synthetic, versioned, schema-checked fixtures only.
- Requires no Privy, Arc, The Graph, or secret configuration.
- Runs package-local checks and deterministic simulators.
- Is sufficient to close A01–A04, B01–B04, and C01–C04.
- Cannot support sponsor qualification or real-settlement claims.

### Local integration mode

Purpose: compose reviewed packages with PostgreSQL and local services before external effects.

- Uses real PostgreSQL and Graphile Worker.
- Replaces Privy, Arc, The Graph/Subgraph MCP, and LLM network access with deterministic simulators.
- Runs migrations, API/worker orchestration, concurrency, restart, failure, and recovery suites.
- Remains the fallback when external providers are unavailable.

### Testnet evidence mode

Purpose: Gate P4 and P6 live proof.

- Requires human-approved Privy/Arc, Graph/Subgraph MCP, and LLM configuration in ignored/approved secret stores.
- Checks Arc chain/token/policy/deployment identities before running.
- Limits settlement to an approved recipient and cap.
- Produces sanitized public identifiers and result tables only.
- Stops new submission work on configuration mismatch or doubt.

### Frontend mock mode

Purpose: independently close A05/B05/C05.

- Uses the P4-frozen OpenAPI and sanitized response fixtures.
- Simulates every authoritative, provider, Arc, Graph/MCP, and recovery-agent state.
- Contains no provider credentials or direct settlement capability.
- Must behave identically to production UI for state labeling and disabled actions.

## 22. Gate P4 integration procedure

P4 is deliberately procedural so convergence does not turn into open-ended shared development.

1. Record exact reviewed A04, B04, and C04 package versions and tree SHAs.
2. Coder A creates the single composition branch from the approved integration base.
3. Replace the settlement simulator with B04’s public package entry point; run contract compatibility before any live call.
4. Replace the recovery/evidence, Subgraph MCP, and LLM simulators with C04 public entry points; run tool/evidence/recommendation/command compatibility.
5. Run offline root checks first. A contract mismatch stops composition and opens one owner-specific compatibility ticket.
6. Run empty and upgrade migrations, API/worker boot, readiness, and safe-disable checks.
7. Run the complete local failure matrix with real packages but simulated external services.
8. A human enables testnet evidence mode and confirms network, token, wallet, policy, recipient, cap, funding, Graph deployment, MCP target, and LLM configuration.
9. Execute one allowed intent, discard the returned transaction hash at the fault boundary, query live The Graph data through Subgraph MCP, show the LLM candidate recommendation, and bind durable identity, Privy identity, Arc receipt/Transfer, Graph freshness, and deterministic-core disposition.
10. Execute wrong-scope and above-cap denials; confirm zero settlements.
11. Inject a lost local response after possible broadcast; confirm durable `UNKNOWN`, zero replacement transaction, and reconciliation to original evidence.
12. Simulate empty, lagging, unhealthy, unavailable, malformed/injected, multiple, and contradictory MCP candidates plus invalid LLM output; confirm `UNKNOWN` and no permission change.
13. Publish a sanitized Gate P4 manifest and freeze OpenAPI/recovery-view semantics.

P4 failures never produce ad hoc edits by multiple coders on the composition branch. The owning coder fixes their package in a focused branch, republishes a reviewed version, and A updates only the version slot.

## 23. Asynchronous merge-conflict prevention

### Path-level controls

- A owns root package manager files, shared compiler/lint/test configuration, OpenAPI, migrations, API, worker, contracts, and domain/storage packages.
- B owns only provider/chain adapter packages, provider fixtures, and human provider setup docs.
- C owns only reconciliation/recovery-agent/Subgraph-MCP/failure packages, recovery docs, and the Subgraph after C01.
- Frontend composition reserves one shell/route registry editor; B/C expose components through documented entry points instead of editing the registry concurrently.

### Commit controls

- One small task normally maps to one commit; do not combine unrelated numbered tasks merely to reduce PR count.
- Generated files stay in the same commit as their source and drift check.
- Formatting-only repo-wide rewrites are separate, human-scheduled changes, never hidden in a packet.
- A packet branch contains no merge from another active packet branch. Rebase/merge decisions follow human repository policy.

### Contract controls

- Published fixture/schema digests are immutable.
- Consumers pin a digest/version rather than a moving branch.
- New optional fields have deterministic default handling that fails closed.
- New enum variants are rejected until explicitly supported.
- Removal/deprecation never occurs in the same delivery phase as introduction.

## 24. Decision and escalation policy

Continue asynchronously with a documented conservative assumption for ordinary implementation details. Stop and request a human/product decision only when the choice could change:

- the one-intent/at-most-one-settlement invariant;
- stable Business Intent identity or payload-conflict semantics;
- monetary precision or canonical amount representation;
- which state grants submission ownership;
- when `UNKNOWN` may transition to `FAILED_SAFE`;
- Privy policy scope or bypass availability;
- Arc network/token identity;
- the non-authoritative role of any external indexer, Subgraph MCP, or LLM, or the four-action allowlist;
- use of non-testnet funds or irreversible external configuration;
- public API breaking compatibility after P4.

An escalation record contains the exact decision, safest default, affected contract/version, options, security impact, and owner. While it is unresolved, unaffected packets continue and the affected boundary fails closed.

## 25. Scope control and cut order

Never change acceptance evidence to accelerate delivery. When integration or provider assumptions fail, reduce optional scope or open an owner-specific compatibility task.

If time is constrained, cut in this order:

1. Optional Privy webhooks; retain complete polling.
2. Rolling/multiple policy support; retain one explicit policy.
3. Nonessential dashboard panels and telemetry dimensions; retain safety alerts.
4. Visual animation, theming, and secondary responsive polish; retain accessible core flows.
5. Arc Memo correlation if Privy cannot constrain the forwarded call; retain The Graph tuple/window discovery and strict authorization.

Sponsor-required scope is not on this list. A working frontend is an Arc
qualification requirement on every claimed Arc track. Cut inside the interface
down to the four minimum screens in section 5b, never the interface itself.

Never cut:

- durable constraints and atomic submission ownership;
- ambiguity classification and reconciliation;
- denial/zero-settlement proof;
- concurrency, restart, and lost-response tests;
- exact Arc receipt/Transfer verification;
- Graph freshness/candidate labeling, live Subgraph MCP use, meaningful LLM reasoning, and deterministic non-authority;
- secret/redaction checks;
- independent review and human merge controls.

## 26. Evidence manifest format

Every packet and project gate publishes a concise Markdown or JSON manifest with:

```text
artifact_id: <packet or gate>
artifact_version: <semver/fixture version>
source_commit: <full SHA>
source_tree: <full tree SHA>
contract_versions: <name=digest list>
environment: offline | local-integration | testnet | mainnet-readiness | frontend-mock
commands: <exact commands with PASS/FAIL>
acceptance: <criterion and evidence reference>
external_effect_count: <integer or NOT APPLICABLE>
secrets_review: PASS | FAIL
known_gaps: <explicit list>
next_owner_packet: <same-owner ID or project gate>
```

Successful command logs are summarized, not pasted wholesale. Failure logs retain only the minimum sanitized evidence needed for diagnosis. External transaction and deployment identifiers are public testnet evidence only after redaction review.

## 27. Final readiness audit

Before Gate P6 can pass, confirm:

- Exact source/tree identities are recorded for all composed artifacts.
- The implementation base and every contract-pack version are immutable and traceable.
- Root install, format, lint, type, unit, integration, contract, build, migration, browser, and policy checks pass.
- Every applicable test-matrix row records stable intent, durable state, and external settlement count.
- Allowed testnet flow has exactly one committed settlement.
- Denial and invalid-scope flows have zero settlement.
- Lost-response flow has no replacement and reconciles to the original transaction or safely remains `UNKNOWN`.
- Restart and two-agent scenarios preserve the invariant.
- Empty, lagging, erroneous, unavailable, or multiple Graph candidates never alter settlement permission.
- Safe disable stops new submissions while status and recovery reads continue.
- UI has no direct/bypass/force-pay action and labels authority/freshness correctly.
- Demo/reset instructions require no unsafe database surgery or external-history rewrite.
- Evidence, repository, logs, screenshots, fixtures, source maps, and reviews contain no secrets.
- Claimed partner tracks match the sponsor claim mapping in section 5. Circle Agent Stack remains unclaimed and `NOT QUALIFIED` until the reconsideration checklist in section 5b is complete and its Privy prize impact is re-audited; Hedera remains out of scope.
- Every Arc requirement row in section 5b has a delivered artifact, including the README architecture diagram and the explicit track naming in the submission.
- Public README and submission text contain no statement that undermines a claimed dependency; justifications cite measured numbers.
- Production composition requires a concrete Privy provider and authorization port; no absent-port default may authorize or submit a settlement.
- The live Graph client/model pair is explicitly configured in the runnable demo; the unavailable default and any direct-query fallback are labeled accurately.
- Privy and Arc claims use the qualification standard. The Graph claim requires live hashless discovery plus meaningful recovery-agent automation; otherwise it is `NOT VERIFIED` and removed from the submission.
- Mandatory FreePi gates and required CI apply to the exact candidate tree/head.
- A human performs the final review and merge.

## 28. Kickoff sequence

1. Human approves this plan and the frozen contract pack.
2. Record the implementation-base full SHA.
3. A, B, and C create independent worktrees and start A01, B01, and C01 simultaneously.
4. Each coder closes and advances through their own lane without waiting for global milestone closure.
5. Run project gates asynchronously when all required artifacts happen to be available; failures create focused owner tickets and do not halt unaffected work.
6. Do not start A05, B05, or C05 until P4 passes.
7. Record P1 integration friction and adjust optional scope while preserving all safety criteria.
