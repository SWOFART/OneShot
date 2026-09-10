# Session Context: brand frontend repaint and searchable wallet picker

## Date/time

- UTC: 2026-09-10T15:50:19Z

## User goal

Bring the shipping web frontend onto the brand direction settled on the design
canvas (commit-ring mark, forest and signal-green palette, Rubik 300, diagonal
hero cut), and replace Privy's oversized default wallet list with a searchable
picker the operator can actually scan.

## Original prompt/request

"make front that fits dsign we have in conversation claude design. What i would
alredy change is list of wallets, that is avalaible to use to log in. the list
is too big, so i'd add search possibility in this list. This is page while
transaction sent. Right now we are working on sowing the proof of transaction,
but page is ready, i guess you can find it in code. I need you to rework
frontend fully, so it follows our design"

## Assumptions

- The transaction-proof work in flight is a separate change; this one alters
  `IntentStatusView`'s appearance only, never its data flow.
- Arc Testnet `eip155:5042002` remains the only network, per repository policy.
- Both slice packages stay read-only; their zero-interactive-element contract
  is a constraint on the repaint, not a thing to renegotiate.

## Plan

1. Write the implementation plan from the approved design.
2. Build `packages/brand` (tokens, mark, hero geometry, fonts) test-first.
3. Repoint all three stylesheets at the shared tokens.
4. Repaint the shell; add the theme toggle and pre-paint guard.
5. Build the searchable wallet picker on Privy's headless SIWE flow.
6. Local checks, Gate A, push, CI, Gate B.

## Key decisions

- Dark board is the default, with the light board shipped as a `data-theme`
  swap and a nav toggle. Rejected: shipping only one board, which would strand
  half the canvas.
- One page, repainted in place. Rejected: splitting landing and console, which
  would add routing and churn the composition tests for no design gain.
- Our own searchable wallet picker on `useLoginWithSiwe`. Rejected: trimming
  `appearance.walletList`, which shortens the list but cannot add search;
  Privy's modal has no search hook.
- The hero clip paths are derived by a pure function rather than hardcoded at
  1032x268 as on the canvas, so the hero is not size-locked.

## Files/components touched

- `docs/superpowers/specs/2026-09-10-brand-frontend-design.md` - approved design.
- Planned: `packages/brand/*` (new), `apps/web/src/{styles.css,App.tsx}`,
  `apps/web/src/components/{LoginGate,WalletPicker}.tsx`,
  `apps/web/src/auth/*`, `packages/{settlement,recovery}-ui/src/styles.css`.

## Commands/checks

- `pnpm install --frozen-lockfile` - pass; `@privy-io/react-auth` 3.6.1 was
  declared but not installed locally before this.
- `git merge --ff-only origin/develop` - pass, `c140405` to `95709a8`.

## External-doc findings

- `@privy-io/react-auth` 3.6.1 typings (installed, read directly):
  `RuntimeLoginOverridableOptions` has no `walletList`, so `login()` cannot be
  narrowed to one wallet; `useLoginWithSiwe()` exposes `generateSiweMessage`,
  `generateSiweNonce`, and `loginWithSiwe`, which is the supported headless
  path a custom picker needs. `appearance.walletList` accepts 24
  `WalletListEntry` ids and only reorders or trims Privy's own modal.

## Unresolved questions

- None.

## Git and PR state

- Branch: `milestone/brand-frontend`
- Base: `develop` at `95709a8`
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Commit the design document and this record.
2. Produce the implementation plan with the writing-plans skill.
