# OneShot Settlement UI

`@oneshot/settlement-ui` is the independently composable B05 slice for Privy
authorization and Arc settlement details. It renders sanitized API fields only
and exposes no settlement, retry, resend, or policy-override action.

## Entry points

- `SettlementDetailsRoute`: the route slot. Reads one Business Intent through an
  injected `SettlementClient` and renders the composed slice.
- `SettlementDetailsPanel`: presentational composition for a shell that already
  holds a projected view.
- `PolicySummaryPanel`, `AuthorizationStatePanel`, `SettlementStatePanel`,
  `TransactionDetails`: the individual panels, mountable on their own.
- `toSettlementDetailsView`: projects a frozen `IntentResponse` into the display
  model used by every component here.
- `createSettlementClient`: HTTP client for the frozen OpenAPI seam.
- `createMockSettlementClient`: the same client bound to the frozen mock server.
- `createInMemorySettlementClient`: deterministic client for component tests.
- `validateExplorerUrl`, `assertNoSensitiveFields`, `formatAtomicUsdc`: the
  boundary rules the panels are built on.
- `DEFAULT_EXPLORER_HOSTS`: the explorer hosts a link may point at unless the
  caller supplies its own list.

## Composition note

The shell owns routing. Mount the route slot where settlement details belong and
pass the identifier the shell already resolved:

```tsx
import { SettlementDetailsRoute, createSettlementClient } from '@oneshot/settlement-ui';
import '@oneshot/settlement-ui/styles.css';

const client = createSettlementClient({
  baseUrl: import.meta.env.VITE_ONESHOT_API_BASE_URL ?? '',
  getAuthToken: () => sessionToken,
});

<SettlementDetailsRoute businessIntentId={intentId} client={client} />;
```

A deployment whose explorer differs from `DEFAULT_EXPLORER_HOSTS` passes its own
list through `allowedExplorerHosts`. An empty list disables explorer links.

This package does not edit the application shell or its route registry, so Gate
P5 composition stays a single-editor change in the shell.

## Contract binding

- OpenAPI: frozen v1 seam, digest
  `f639e2d2729cd061d606cd35eb83961c58067a3660ecc5437c0f4596c88edc2c`.
- Mock server: `@oneshot/contracts` `OPENAPI_MOCK_SERVER_VERSION` `1.0.0`,
  re-exported here as `SETTLEMENT_UI_MOCK_SERVER_VERSION`.
- Fields consumed: `IntentResponse.payment_mode`, `IntentResponse.policy`, `AttemptView.authorization_status`,
  `SettlementView.token_contract`, `SettlementView.explorer_url`, plus the
  base intent, attempt, settlement, and evidence fields.
- View contract version: `settlement-details-v1`.

## Safety rules this slice enforces

- **No bypass.** No component renders a submit, resubmit, force-pay, or
  policy-override control. The client interface is read-only by construction.
- **`UNKNOWN` is not terminal.** It renders as not final, with no settlement
  action and no confirmation count. Arc is shown as pending or final only.
- **Verified evidence only.** Transaction details render when the durable state
  is `COMMITTED`, the settlement identity is well formed, and authoritative
  evidence exists. Normal server-wallet intents require an authoritative Arc
  observation. A `USER_WALLET` intent may use its authoritative OneShot
  observation because the API records that observation only after its exact Arc
  receipt and Transfer-log verification succeeds. Anything less renders as
  unverified with details withheld.
- **Policy scope is explicit.** User-wallet intents display policy as not
  applicable: the connected wallet signs the reviewed transfer directly, so no
  server-side Privy spending policy governs that payment.
- **Validated outbound links.** An explorer URL becomes an `href` only if it is
  https, carries no embedded credentials, sits on the host allowlist, and
  references the exact transaction hash being displayed. Hash binding alone is
  not enough, because a hostile host can quote the real hash back. Anything else
  is dropped with a stated reason.
- **Fail-closed redaction.** A response carrying a secret-shaped field name, or
  a credential-shaped value under any name (PEM private key, JWT, bearer token),
  is refused before projection, and the route renders "Response withheld"
  instead of any part of it. Identity fields that render verbatim — recipient,
  network, asset, state, and the identifiers — are rejected outright if they
  carry control characters, since they bypass `sanitizeText` by design.
- **Exact money.** Amounts are formatted from integer atomic units with `bigint`
  string arithmetic. A malformed amount renders as malformed, never as a
  rounded number.

## Fixtures

Seven scenarios come from the frozen contract pack
(`packages/contracts/fixtures/ui/v1/`). Five more are Lane B local fixtures for
states the frozen pack does not carry, since published fixture digests are
immutable:

| Scenario                         | Source | Covers                                        |
| -------------------------------- | ------ | --------------------------------------------- |
| `authorized-committed`           | frozen | Verified settlement with explorer link        |
| `auth-checking`                  | frozen | Authorization in progress                     |
| `auth-denied-recipient`          | frozen | Recipient not on the allowlist                |
| `auth-cap-exceeded`              | frozen | Amount above the per-settlement cap           |
| `auth-unavailable`               | frozen | Authorization service unavailable             |
| `auth-config-mismatch`           | frozen | Policy configuration mismatch                 |
| `unknown-reconcile-only`         | frozen | `UNKNOWN` with lagging index evidence         |
| `ready-authorized`               | Lane B | Authorized, nothing submitted                 |
| `submitting-in-flight`           | Lane B | Attempt crossing the provider boundary        |
| `final-revert`                   | Lane B | Reverted transaction, no committed settlement |
| `hostile-explorer-link`          | Lane B | Unsafe explorer URL and hostile strings       |
| `committed-without-arc-evidence` | Lane B | Committed record without Arc proof            |

The synthetic fixtures publish links through `testnet.arcscan.io`, which is not
the documented Arc testnet explorer. `FIXTURE_EXPLORER_HOSTS` exists so the
fixture viewer and component tests opt into that host explicitly instead of the
package widening its default allowlist.

Run the standalone fixture viewer:

```bash
pnpm --filter @oneshot/settlement-ui dev
```

Open `/?scenario=unknown-reconcile-only`. Any key of `SETTLEMENT_SCENARIOS` may
be selected. Its banner marks all data as synthetic review fixtures; it is not
live sponsor evidence.

## Checks

```bash
pnpm --filter @oneshot/settlement-ui verify
```

This runs format, lint, typecheck, test, and build. Tests cover every fixture,
redaction, malicious strings and URLs, unavailable evidence, exact amount
formatting, keyboard reachability, responsive breakpoints, and an `axe-core`
accessibility scan of every scenario. `test/contrast.test.ts` reads the palette
tokens from the stylesheet and asserts WCAG AA contrast on both surfaces, which
the axe scan cannot check under jsdom.
