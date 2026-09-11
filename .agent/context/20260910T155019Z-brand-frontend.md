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
- `.superpowers/sdd/2026-09-10-brand-frontend/*` - the 12-task implementation
  plan and its task briefs/reports.
- `packages/brand/*` (new package) - `tokens.css` (the repository's only
  literal-colour file), `fonts.css`, `CommitRing.tsx` (the mark, with its
  reduced cut), `heroCut.ts` (pure clip-path geometry), `index.ts`, and tests
  (`commit-ring.test.tsx`, `hero-cut.test.ts`, `tokens.test.ts` - the
  two-theme contrast audit).
- `apps/web/src/styles.css` - repainted onto `@oneshot/brand` tokens (824
  lines changed).
- `apps/web/src/theme.ts` and `apps/web/index.html` - `data-theme` selection
  with a pre-paint inline guard duplicating `theme.ts` deliberately (documented
  in the README's new Brand section).
- `apps/web/src/App.tsx`, `apps/web/src/components/LoginGate.tsx` - shell
  repaint and wallet-picker wiring.
- `apps/web/src/components/Hero.tsx` (new) - the diagonal hero cut; fixed in
  Task 12 to measure with `useLayoutEffect` instead of `useEffect` (was
  flashing `.hero-plain` before `.hero-cut` on every desktop load, since this
  app is pure client-side render with no SSR).
- `apps/web/src/components/WalletPicker.tsx` (new), `apps/web/src/auth/eip6963.ts`
  (new, EIP-6963 wallet discovery with validated announcements),
  `apps/web/src/auth/wallet-catalogue.ts` (new), `apps/web/src/auth/session.ts`,
  `apps/web/src/auth/privy-session.tsx` - the searchable wallet picker on
  Privy's headless SIWE flow; fixed in Task 12 to race each
  `wallet.provider.request(...)` call (`eth_requestAccounts`, `personal_sign`)
  against a 120s timeout (`WALLET_REQUEST_TIMEOUT_MS`), so a wallet that never
  responds rejects instead of stranding `WalletPicker` in `busy` state
  forever. The timeout's own rejection carries a fixed generic message with no
  wallet data, preserving `WalletPicker`'s existing sanitized-error contract.
- `apps/web/test/*` - `app-brand.test.tsx`, `eip6963.test.ts`, `hero.test.tsx`,
  `login-gate.test.tsx`, `styles.test.ts` (fails the build on a literal colour
  in this app's stylesheet), `theme.test.ts`, `wallet-picker.test.tsx`, and
  (new in Task 12) `privy-session.test.tsx` - fake-timer proof that a
  never-resolving wallet provider rejects at exactly the timeout rather than
  hanging, and that the rejection message contains none of the wallet's
  identifying fields.
- `packages/settlement-ui/src/styles.css`, `packages/recovery-ui/src/styles.css`
  - repointed at the shared brand tokens; both packages' zero-interactive-
  element contract preserved.
- `apps/web/README.md` (Task 12) - added a "Brand" section documenting
  `@oneshot/brand`, the literal-colour build guard, and the pre-paint theme
  guard duplication.
- `.agent/context/20260910T155019Z-brand-frontend.md` (this file, Task 12) -
  filled in with real verification results and head SHA.

## Commands/checks

- `pnpm install --frozen-lockfile` - pass; `@privy-io/react-auth` 3.6.1 was
  declared but not installed locally before this.
- `git merge --ff-only origin/develop` - pass, `c140405` to `95709a8`.

### Task 12 - whole-repository verification (2026-09-11, local machine, Node
v22.16.0/pnpm 11.19.0; repo's `.node-version` pins 24.19.0, so pnpm printed an
"Unsupported engine" warning on every command below - none of them failed
because of it)

- `pnpm format:check` - **pass**. "All matched files use Prettier code style!"
- `pnpm lint` (`eslint .`) - **pass**, no output, exit 0.
- `pnpm typecheck` (`tsc -b --pretty false`) - **pass**, no output, exit 0.
- `pnpm build` - **pass**. `tsc -b`, `@oneshot/recovery-ui` build,
  `@oneshot/settlement-ui` build, and `@oneshot/arc-subgraph` codegen+build all
  succeeded.
- `pnpm test` (runs `pnpm build` first, then `vitest run --exclude
  apps/web/browser/**` at the repo root) - **pass**. 69 test files, 987 tests,
  0 failures. `apps/web` alone: 16 test files, 86 tests (was 15/84 before this
  task's two fixes; `privy-session.test.tsx` is new and added 2).
- `pnpm --filter @oneshot/web test:browser` - **could not run in this
  environment**. `typecheck:browser` and `vite build --mode test` both passed,
  but the runner (`node scripts/run-browser-tests.mjs`, which sets
  `PW_DISABLE_TS_ESM=1` to dodge a Playwright 1.63/Node 24/Windows hang) then
  failed loading `playwright.config.ts` under plain Node ESM:
  `TypeError: Unknown file extension ".ts" ... ERR_UNKNOWN_FILE_EXTENSION`.
  This machine's Node (v22.16.0) predates this repo's expected runtime
  (`.node-version` pins 24.19.0) and does not strip TypeScript types by
  default. Independent of that, no Playwright browser binaries are installed
  anywhere on this machine (`~/Library/Caches/ms-playwright` and a filesystem
  search for any `ms-playwright`/`chromium` cache both came back empty), so
  the gate would still fail at browser launch even with a matching Node
  version. Not reported as passed; needs a matching Node runtime and
  `playwright install chromium` on a machine authorized for that, or CI.
- Literal-colour grep (`grep -rn "#[0-9a-fA-F]\{6\}" apps/web/src
  packages/settlement-ui/src packages/recovery-ui/src --include='*.css'
  --include='*.ts' --include='*.tsx'`) - **pass**, exactly the two expected
  lines, both the documented Privy config exception:
  ```
  apps/web/src/auth/privy-session.tsx:58:          theme: '#0a0a0a',
  apps/web/src/auth/privy-session.tsx:59:          accentColor: '#00dc5f',
  ```

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
- Head at Task 12 verification (2026-09-11):
  `e4b0c25894e9e194e0b5e10a78f310978eeaa126` -
  "fix(web): time out unresponsive wallet requests during sign-in", the second
  of two fixes carried into this task from earlier review (`29c8474` fixed the
  hero's pre-paint flash first, on top of `375c3c1`, the last commit of Task
  11). This record and the README Brand section land in one further commit on
  top of `e4b0c25` ("docs(web): document the brand package and the theme
  guard"); `git log -1` on this branch shows that commit's exact SHA.
- 23 commits total on this branch since `develop` (`7a48310`, the design
  document, through `e4b0c25`), covering the full 12-task plan in
  `.superpowers/sdd/2026-09-10-brand-frontend/`.
- Working tree: clean at every commit made in this task; nothing left staged
  or unstaged.
- PR: not created. Per the task-12 brief and `.agent/IMPLEMENTATION_LOOP.md`,
  opening the draft PR against `develop`, pushing, and running FreePi Gate
  A/B are handoff steps for a human at the end of this session, not run here.
- CI: not run (no push).

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. ~~Commit the design document and this record.~~ Done (`7a48310`).
2. ~~Produce the implementation plan with the writing-plans skill.~~ Done
   (`0b7ca90`, `d6ce32c`); all 12 tasks in
   `.superpowers/sdd/2026-09-10-brand-frontend/` are implemented as of
   `e4b0c25`, with this record and the README Brand section landing in one
   more commit on top.
3. Per `.agent/IMPLEMENTATION_LOOP.md` section 3 (not run in this task, by
   instruction): capture immutable Gate A evidence, run FreePi Gate A in a
   fresh read-only process, push `milestone/brand-frontend`, open the draft PR
   against `develop`, wait for required CI, then run Gate B against the exact
   head SHA. A human authorizes the merge; no agent merges.
