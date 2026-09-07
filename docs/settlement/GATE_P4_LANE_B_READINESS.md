# Gate P4 readiness, lane B

What lane B provides for Gate P4, what Coder A must change to use it, and the
one naming disagreement that needs settling before composition.

## 1. What to inject

`docs/GATE_P4_CHECKLIST.md` step 1 and 2 replace the simulator ports in
`apps/worker/src/composition.ts`. The replacements are:

| Checklist name              | Actual export               | Package                  |
| --------------------------- | --------------------------- | ------------------------ |
| `ArcSettlementAdapter`      | `ArcSettlementAdapter`      | `@oneshot/privy-adapter` |
| `PrivyAuthorizationAdapter` | `PrivyAuthorizationAdapter` | `@oneshot/privy-adapter` |

Both declare `contractVersion = '1.0.0'`, and the settlement adapter declares
`network = 'eip155:5042002'`, matching what `composeWorker` verifies.

```ts
import { ArcSettlementAdapter, PrivyAuthorizationAdapter } from '@oneshot/privy-adapter';
import { loadSettlementConfig } from '@oneshot/arc-adapter';

const config = loadSettlementConfig(process.env);

const settlementPort = new ArcSettlementAdapter(config, walletProvider);
const authorizationPort = new PrivyAuthorizationAdapter(config, reviewedBaseline, observeIdentity);
```

## 2. Naming disagreement to settle

The checklist reserves package slots `@oneshot/adapter-arc` and
`@oneshot/adapter-privy`. Lane B shipped `@oneshot/arc-adapter` and
`@oneshot/privy-adapter`, and those names are already merged, imported, and
referenced in `pnpm-workspace.yaml`, the root `tsconfig.json`, and the fixture
and documentation set.

Renaming is possible but touches every consumer. The names above are what
exists today. This needs an explicit decision rather than being discovered
during composition.

Both adapters live in `@oneshot/privy-adapter` rather than being split across
two packages, because settlement is a Privy wallet action that carries an Arc
transfer: splitting them would put half of one call path in each package.

## 3. Conformance is checked at compile time

`packages/privy-adapter/src/p4-conformance.ts` mirrors the worker's
`AuthorizationPort` and `SettlementPort` interfaces and statically asserts both
adapters satisfy them, including the `contractVersion` and `network` fields
that `composeWorker` reads.

It mirrors rather than imports, because importing `apps/worker` would break the
lane rule against depending on another owner's implementation package. The
mirror is verified to fail: renaming `submit` makes `tsc` report

```text
error TS2344: Type 'ArcSettlementAdapter' does not satisfy the constraint
'WorkerInjectableSettlementPort'.
```

If Coder A changes those interfaces, this file fails the build and the mismatch
surfaces here instead of during composition.

## 4. What A must supply

The adapters take their provider as an injected interface, so nothing in lane B
opens a socket or reads a credential.

`WalletProvider` needs two methods:

- `sendTransaction({ chainId, to, value, data, idempotencyKey, referenceId })`
  signs and broadcasts, and **must pass `idempotencyKey` through to Privy** so a
  duplicate collapses provider-side as well as in OneShot state.
- `getReceipt(transactionHash)` returns the receipt or `null`.

`PrivyAuthorizationAdapter` also needs a reviewed `SettlementBaseline` and an
`observeIdentity()` callback returning the currently deployed identity, so
policy drift is detected before authorization rather than during a payment.

## 5. Behaviour worth knowing before composition

- **Drift reports `UNAVAILABLE`, not `DENIED`.** A drifted policy makes every
  answer untrustworthy rather than making this particular intent unauthorized.
  Treat it as retryable-after-fix, not as a decision about the intent.
- **`POSSIBLY_SUBMITTED` is the default for doubt.** Only a proven pre-broadcast
  failure or an on-chain revert returns `DEFINITELY_NOT_SUBMITTED`. Everything
  else, including an unreadable receipt and a receipt that does not prove our
  Transfer, is possibly submitted.
- **A successful receipt is not confirmation.** `CONFIRMED` requires exactly one
  matching Transfer from the configured token to the expected recipient for the
  exact amount.
- **Native value is always zero**, asserted by test.

## 6. Still not proven

Per `.agents/skills/sponsor-qualification/SKILL.md`, no sponsor claim may rest
on fixtures. These remain unverified against reality and are listed in
`COMPATIBILITY_MANIFEST.liveGapsForGateP4`:

- No Privy tenant has executed a policy denial or an allowed settlement.
- Arc receipt and Transfer log shapes are modelled from documentation.
- Privy wallet and policy identifier formats are shape-guessed.

`docs/settlement/LIVE_EVIDENCE.md` still reads `LIVE_NOT_RUN`. Privy and Arc
claims stay `NOT VERIFIED` until it does not.
