# A01 — Foundation and Contract Runtime

Owner: Coder A
Effort: M — roughly one focused week
Branch: `milestone/a01-foundation-contracts`
Depends on: frozen `milestones/CONTRACTS.md` only
Next: A02 immediately after closure

## Outcome

A strict, independently runnable workspace exposes the frozen contracts, OpenAPI, deterministic domain simulator, and package-local quality commands. B and C can validate their fixtures without using A’s active branch.

## Small tasks

### A01.1 — Workspace baseline

- Create the `pnpm` workspace, pinned Node/package-manager metadata, strict TypeScript base config, formatter, linter, unit-test runner, and build scripts.
- Add root commands that delegate; package-local commands remain independently executable.
- Enable lockfile and generated-artifact drift checks. Do not weaken strictness for incomplete packages.

### A01.2 — Contract package

- Define branded/string types for intent, attempt, correlation, provider, transaction, block, and deployment identities.
- Define canonical integer-string validation and JSON-safe money serialization.
- Encode port request/result discriminated unions with exhaustive matching and unknown-enum rejection.

### A01.3 — OpenAPI v1

- Specify every endpoint, success/error response, authentication requirement, limits, examples, and stable error code from the frozen pack.
- Generate JSON Schema/TypeScript artifacts and add a drift test.
- Ensure no endpoint directly grants a settlement retry.

### A01.4 — Fixture validator

- Create the v1 fixture directories and schema validation command.
- Include accepted, replay, conflict, authorization, settlement, evidence, and Graph fixture placeholders with safe synthetic values.
- Reject unversioned, extra-sensitive, malformed, float-money, and unknown-result fixtures.

### A01.5 — Domain simulator

- Implement an in-memory deterministic API/worker simulator with injectable clock/IDs and external-submission counter.
- Consume the same public schemas as production code.
- Support every port result family without importing provider packages.

## Acceptance evidence

- Clean install, lint, type, unit, and build succeed from a fresh checkout.
- Package-local `contracts` and `testkit-domain` checks run without PostgreSQL, network, or credentials.
- OpenAPI generation is deterministic and drift fails CI.
- Invalid money, unknown enum, missing identity, and unexpected fixture fields fail closed.
- Simulator can create one intent and expose zero/one synthetic external submissions deterministically.

## Handoff artifact

Publish contract pack `contracts-v1`, validated fixtures, generated schema digest, simulator entry point, and exact verification commands. Consumers use the committed pack, not this branch.

## No-wait continuation

Start A02 after A01 local review. Missing provider examples become additive fixture tickets and do not block durable-intent implementation.

## Non-goals

No PostgreSQL persistence, real worker queue, provider SDK, real settlement, Subgraph, or production UI.
