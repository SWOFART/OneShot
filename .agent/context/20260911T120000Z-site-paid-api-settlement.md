# Session Context: site-paid-api-settlement

## Date/time

- UTC: 2026-09-11T12:00:00Z

## User goal

Integrate the existing Circle x402 paid-API buyer flow into the OneShot website so an operator can start a real Arc Testnet payment from the site, see the ArcScan transaction evidence, and inspect recovery/activity evidence when a payment response is delayed or lost. Preserve the invariant that duplicate delivery, retries, or agent lag produce at most one payment.

## Original prompt/request

The user asked to create a new branch from `develop` and start integrating the paid API into the website instead of linking to the hardcoded `pnpm demo:402` tester. The site should demonstrate a real Circle payment visible on ArcScan, enforce one payment when the same transaction is sent twice, and expose recovery/activity via The Graph. The user explicitly asked not to start Gate A and requested a Gate A review prompt for later use.

## Assumptions

- The paid API endpoint is a configured HTTPS Circle x402 resource, not an arbitrary browser-supplied URL; this avoids SSRF and keeps the quote/payment scope pinned.
- The existing Privy-controlled EOA and funded Circle Gateway Testnet balance remain deployment prerequisites; this work does not deposit funds or execute a live payment.
- Circle Gateway's x402 response transaction is initially provider evidence; OneShot commits only after Arc receipt evidence proves the expected USDC transfer, otherwise it remains `UNKNOWN` and recovery is required.
- The website uses the existing authenticated operator cabinet and OneShot API/worker rather than exposing wallet secrets or signing material to the browser.

## Plan

1. Add a durable paid-API target and response projection tied atomically to one Business Intent.
2. Add Circle x402 quote/start/status API routes and a worker settlement adapter with receipt verification and stable provider identity.
3. Bind x402 provider hashes to recovery and The Graph candidate discovery, and include paid-API settlements in activity.
4. Replace the runbook-only website card with a quote/start/status UI and ArcScan/recovery links.
5. Add applicable duplicate, parallel, response-loss, Graph-delay, provider-policy, restart, and downstream-result tests; run local checks only.
6. Stop before Gate A and leave a compact review prompt for a later fresh FreePi session.

## Key decisions

- The existing direct Arc transfer remains unchanged. Circle x402 is a separate settlement adapter selected only for paid-API intents, preventing a downstream API payment from becoming a second direct settlement.
- The API stores the exact validated x402 quote and request target before the worker can submit. The worker's durable `READY -> SUBMITTING` claim remains the only submission permission.
- Circle's transaction hash is persisted on the submitting attempt as soon as it is returned. Arc receipt verification is required for `COMMITTED`; missing or delayed receipt/Graph evidence stays `UNKNOWN`.
- No recovery action can submit a replacement x402 request. The Graph remains candidate discovery only and Arc receipt verification plus the ledger decide.

## Files/components touched

- Contracts/domain: paid-API request, quote, and view types plus generated OpenAPI artifacts.
- Storage: paid-API target/response migration and atomic ledger operations; activity/reset support.
- Supplier/worker: Circle x402 quote/target parsing, receipt-bound settlement adapter, runtime wiring, and recovery bridge support.
- API/web: configured quote/start/status endpoints, client, website paid-API panel, and ArcScan/recovery presentation.
- Tests/docs/.env placeholders and this context record.

## Commands/checks

- `git status --short --branch` - clean `develop` before branching.
- `git switch -c feature/site-paid-api-settlement` - created from `develop` at `e03f46faf56edf6747d7ba269eeae02b140b2ab8`.
- `pnpm.cmd test` - passed: 79 files, 1,042 tests; this runs the build and excludes only `apps/web/browser/**`.
- `pnpm.cmd lint` - passed.
- `pnpm.cmd typecheck` - passed.
- `pnpm.cmd check:generated` - passed.
- `pnpm.cmd format:check` and `git diff --check` - passed.
- Focused supplier, worker, contracts, and storage suites - passed (12, 49, 37, and 13 tests respectively; worker count includes the x402 recovery-bridge coverage).
- `pnpm.cmd --filter @oneshot/storage-postgres test:integration` - skipped by default because `TEST_POSTGRES` is unset.
- `TEST_POSTGRES=1 pnpm.cmd --filter @oneshot/storage-postgres test:integration` - not runnable in this environment: Testcontainers reported `Could not find a working container runtime strategy`.
- Live Circle/Arc payment - intentionally not run; no external effect is authorized in this implementation session.

## External-doc findings

- Circle's current x402 buyer guide says Gateway payments use an EIP-3009 authorization, require a one-time Gateway USDC deposit, and may settle onchain later; the buyer receives a response before batch settlement is necessarily visible onchain. The site must therefore distinguish provider response from Arc-confirmed commitment.
- Circle's current x402 seller guide pins Arc Testnet as `eip155:5042002`, documents `PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE`, and recommends `settle()` for seller-side verification.
- Circle's current Gateway contract-address reference lists Arc Testnet GatewayWallet as `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`.
- Privy's current signer documentation confirms server-side wallet actions through configured signers; this repository's existing Privy x402 signer continues to keep private keys out of OneShot.

## Unresolved questions

- The live deployment must provide a configured Circle x402 resource, an EOA-compatible Privy wallet, a funded Gateway Testnet balance, and Arc/Graph/Vertex identities before a live demo can be accepted.
- Exact live Gateway batch timing may leave the UI at `UNKNOWN` until Arc receipt/Graph reconciliation catches up.

## Git and PR state

- Branch: `feature/site-paid-api-settlement`
- Base: `develop` at `e03f46faf56edf6747d7ba269eeae02b140b2ab8`
- Commit: uncommitted
- PR: not created
- CI: not run
- Intended changes are staged; the final staged tree identity is reported in the handoff.

## Review gates

- Gate A: PASS — user-provided fresh FreePi read-only verdict; no blocking findings.
- Gate B: NOT RUN

## Handoff/next steps

1. Commit the staged implementation after the Gate A PASS.
2. Push the feature branch and open a PR targeting `develop`.
3. Keep Gate B and live payment execution outside this handoff unless explicitly requested.
