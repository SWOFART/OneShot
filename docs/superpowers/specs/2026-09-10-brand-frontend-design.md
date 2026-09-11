# Brand Frontend — Design

Repaint the OneShot web frontend onto the settled brand direction, and replace
the Privy wallet login list with a searchable picker.

- Date: 2026-09-10
- Branch: `milestone/brand-frontend`, based on `develop` at `95709a8`
- Status: approved design, ready for an implementation plan

## Problem

The brand direction was settled on a design canvas — a commit-ring mark, a
forest and signal-green palette, Rubik 300 throughout, and a diagonal hero cut.
None of it is in the repository. The shipping frontend is navy and cyan, uses
system fonts, and carries a placeholder PNG logo.

The palette is currently restated in three unrelated stylesheets, so nothing
holds the frontend to one appearance:

| File | Ground | Accent |
| --- | --- | --- |
| `apps/web/src/styles.css` | `#06090e` | `#7ee6f2`, `#2056c9` |
| `packages/settlement-ui/src/styles.css` | `#07101d` | `#7ee6f2`, `#7ce7b4` |
| `packages/recovery-ui/src/styles.css` | `#07101d` | `#64e1ed`, `#70e2ad` |

Separately, the operator sign-in opens Privy's default modal, whose wallet list
is long enough to be hard to scan and offers no search.

## Goals

- One palette, defined once, driving all three stylesheets.
- Light and dark boards from the canvas, dark as the default, switchable.
- The commit-ring mark and the diagonal hero cut in code, not just on canvas.
- A wallet chooser that can be searched, styled as part of the product.

## Non-goals

- The transaction-proof work in flight. `IntentStatusView`'s data flow, the
  API, the worker, and the domain are untouched; only its appearance changes.
- Routing. The app stays a single page and keeps the `#console` anchor.
- Copy rewrites. Existing hero, invariant, and footer text is preserved.
- Mainnet or network configuration of any kind.

## Design

### 1. `packages/brand` — the token and asset layer

A new workspace package, consumed by `apps/web`, `packages/settlement-ui`, and
`packages/recovery-ui`.

**`src/tokens.css`** is the only place brand hexes appear. Light board on bare
`:root`; dark board on `:root[data-theme='dark']`. Token names are `--os-*`.

| Token | Light | Dark |
| --- | --- | --- |
| `--os-ground` | `#f7f9f4` | `#0a0a0a` |
| `--os-panel` | `#0b332c` | `#0b332c` |
| `--os-signal` | `#00dc5f` | `#00dc5f` |
| `--os-field` | `#e9ffbd` | `#e9ffbd` |
| `--os-attempt` | `#4a7a60` | `#4a7a60` |
| `--os-ink` | `#0b332c` | `#eef7e6` |
| `--os-ink-muted` | `#3f5c46` | `#a9c4b2` |

Every value is sampled from the canvas, not invented. Semantic tokens for
state (`--os-state-committed`, `--os-state-unknown`, `--os-state-failed`) and
for surfaces (`--os-surface`, `--os-line`) are derived in the same block, so a
component never reaches for a raw hue.

**`src/CommitRing.tsx`** renders the mark: a squircle tile (64 viewBox,
`rx 19`, glyph inset 10) holding a ring at (32,32) r 15.5 — three short arcs for
open attempts at stroke 4.6 in `--os-attempt`, one long committed arc at stroke
6.4 in `--os-signal`, ending in a filled node r 5.6 at (41.96, 20.13).
Hierarchy is carried by stroke weight, never by opacity, so the one-ink cut is
the same mark. Below 32px the component switches to the reduced cut: attempt
arcs dropped, committed arc 7.4, node 6.4.

**`src/heroCut.ts`** exports a pure function:

```ts
heroClipPaths(width: number, height: number): { panel: string; figure: string }
```

It returns the two SVG path strings for the hero's parallel diagonals — panel
wider at the top, a 14px perpendicular channel between the shapes, 24px rounded
corners on every vertex including the acute ones. The canvas hardcoded these
for 1032×268; deriving them means the hero is no longer size-locked. Rounding
requires `clipPathUnits="userSpaceOnUse"` — polygon clip-paths cannot round
corners — so the caller passes measured pixels.

**`src/fonts.css`** loads Rubik 300/400 and Noto Sans 300/400 from Google
Fonts, with a real fallback stack. Everything is weight 300, wordmark included;
Rubik 300 is the floor Google Fonts offers.

### 2. Theme switching

`data-theme` on `<html>`, dark by default, persisted in `localStorage` under
`oneshot.theme`. An inline script in `apps/web/index.html` stamps the attribute
before first paint so no frame renders in the wrong palette. `color-scheme` is
set per theme so scrollbars and native form widgets follow. A toggle sits in
the top nav.

Reads and writes to `localStorage` are wrapped — a private window or blocked
site data must fall back to the default theme rather than throw.

### 3. Shell repaint

Section order is unchanged: nav, hero, invariants, console, footer.

- **Nav** — commit-ring tile plus `OneShot` in Rubik 300, network and asset
  chips as pills, theme toggle, console anchor.
- **Hero** — the one place the diagonal is cut. A `ResizeObserver` measures the
  hero box; paths come from `heroClipPaths`; the figure is CSS only (layered
  linear and radial gradients plus a blurred `repeating-linear-gradient` band),
  so there is nothing to license. Under 720px the acute corners stop reading,
  so the hero degrades to a plain rounded forest panel with the same content.
- **Invariants, console, footer** — plain rounded rectangles, 22px radius, per
  the brand rule that the diagonal appears once per view.

### 4. Slice stylesheets

`settlement-ui` and `recovery-ui` keep their internal `--ink`, `--panel`,
`--muted`, `--line` grammar. Those declarations stop holding hexes and point at
`--os-*` instead. Component code in both packages is untouched.

Both slices are read-only by contract —
`packages/settlement-ui/test/component.test.ts` asserts that
`button, a, input` inside them count zero. The repaint adds no interactive
element to either.

### 5. Wallet picker

`apps/web/src/components/WalletPicker.tsx` replaces the single "Sign in with
Privy" button in `LoginGate`.

**Detection.** On mount, dispatch `eip6963:requestProvider` and collect
`eip6963:announceProvider` events. Each gives a wallet's own name, icon, RDNS,
and EIP-1193 provider.

**Catalogue.** `apps/web/src/auth/wallet-catalogue.ts` holds the known
`WalletListEntry` ids with display names, for wallets that are not installed.

**Search.** One input filters both groups, case-insensitively, on display name
and RDNS. Detected wallets sort first. `ArrowUp`/`ArrowDown` move the active
option, `Enter` selects, `Escape` clears the query. The list is a
`role="listbox"` with `aria-activedescendant`, so it is operable without a
mouse and announced correctly.

**Sign-in.** Verified against the installed `@privy-io/react-auth` 3.6.1
typings — `login()` cannot take a wallet list, but `useLoginWithSiwe()` exposes
the headless flow:

1. `provider.request({ method: 'eth_requestAccounts' })`
2. `generateSiweMessage({ address, chainId: 'eip155:5042002' })`
3. `provider.request({ method: 'personal_sign', params: [message, address] })`
4. `loginWithSiwe({ signature, message, walletClientType, connectorType: 'injected' })`

**Fallbacks.** "Other wallet" calls `login()` and lets Privy's own modal cover
WalletConnect and mobile. "Continue with email" calls
`login({ loginMethods: ['email'] })`.

**Errors.** Three failure modes each map to a short sanitized message: the user
rejects the connection or the signature (EIP-1193 code 4001), the provider
returns an empty account list, and the provider or Privy call throws. The SIWE
message is bound to `eip155:5042002` but `personal_sign` does not require the
wallet to be on that chain, so no chain switch is requested. Signatures,
addresses, messages, and tokens are never logged, and no failure is silently
swallowed.

The existing machine-token path in `LoginGate` is unchanged.

## Testing

| Area | Test |
| --- | --- |
| Palette | Contrast audit over `--os-*` in **both** themes, extending the existing static WCAG check in `packages/settlement-ui/test/contrast.test.ts` |
| Hero geometry | Unit tests on `heroClipPaths` — channel width, corner count, monotonic diagonals, degenerate and small sizes |
| Mark | Snapshot of full and reduced cuts; assert the reduced cut drops the attempt arcs |
| Theme | Default is dark; toggle flips `data-theme`; a throwing `localStorage` still renders |
| Wallet picker | Search filtering, keyboard navigation, and the SIWE call order against a mocked Privy hook; rejection and no-account paths surface a message |
| Slices | Existing zero-interactive-element assertions continue to pass |
| Regression | Existing axe/a11y suites and the Playwright P5 gate spec pass unchanged |

New behavior is written test-first.

## Files

**New** — `packages/brand/` (`package.json`, `tsconfig.json`, `src/tokens.css`,
`src/fonts.css`, `src/CommitRing.tsx`, `src/heroCut.ts`, `src/index.ts`, tests),
`apps/web/src/components/WalletPicker.tsx`,
`apps/web/src/auth/wallet-catalogue.ts`, `apps/web/src/auth/eip6963.ts`,
`apps/web/src/theme.ts`.

**Rewritten** — `apps/web/src/styles.css`, `apps/web/src/App.tsx`,
`apps/web/src/components/LoginGate.tsx`, `apps/web/src/auth/privy-session.tsx`,
`packages/settlement-ui/src/styles.css`,
`packages/recovery-ui/src/styles.css`.

**Touched** — `apps/web/index.html` (font link, pre-paint theme guard),
`apps/web/vite.config.ts` and the slice Vite configs (brand alias),
`apps/web/package.json`, `pnpm-workspace.yaml`.

`apps/web/public/logo.png` stays as the favicon only; the mark in the page is
the SVG component.

## Risks

- **Wallet auth moves into our code.** The SIWE flow is Privy's supported
  headless API, but the sign-in path is now ours to get right. It carries
  tests, and it goes through Gate A and Gate B like any other change.
- **Hero geometry.** Rounded acute corners are fiddly; the derived paths are
  covered by unit tests rather than checked by eye alone.
- **Contrast.** Signal green on forest is bright. The contrast test runs over
  both themes so a palette edit that drops below AA fails in CI, not in review.

## Delivery

Per `.agent/IMPLEMENTATION_LOOP.md`: local format, lint, typecheck, test and
build; a single staged candidate tree; FreePi Gate A before push; required CI;
FreePi Gate B on the draft-PR head. PR targets `develop`. A human merges.
