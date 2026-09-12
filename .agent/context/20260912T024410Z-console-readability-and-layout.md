# Session Context: operator console readability and layout

## Date/time

- UTC: 2026-09-12T02:44:10Z

## User goal

Fix nine reported defects in the operator console frontend so the deployed app
at oneshot.kapustazh.dev/app is readable and correctly laid out in both themes.

## Original prompt/request

Nine numbered items with screenshots: (1) text unreadable in light theme,
(2) transaction info unreadable in dark theme, (3) remove the "Wallet &
permissions" and "Developer access" tabs, (4) Tools tab panels separated
incorrectly, (5) Jobs empty state has no line spacing, (6) hero on /app is
narrower than the surrounding elements and its text misaligns differently per
monitor, (7) x402 task-key field unstyled/inline with neighbouring text, help
text not on its own line, runbook link not left-aligned, type too small at high
resolution, (8) same treatment for Recovery & activity, (9) fade animation on
tab switch and theme change.

## Assumptions

- The two removed tabs were read-only restatements with no controls behind
  them, so removing them loses no operator capability. Confirmed by reading
  both sections: facts already shown elsewhere, plus a static code sample.
- "Make font bigger depending on resolution" means the page should scale with
  viewport width, implemented once at the root rather than per-component.

## Plan

1. Hand back to the user for review of the running app.
2. Run FreePi Gate A against the candidate tree before any push.

## Key decisions

- Root cause of (1) and (2) is one mistake in two directions: --os-panel and
  --os-field never flip with the theme and carry fixed inks; --os-ink and
  --os-ground flip together. Each defect paired one family's ink with the other
  family's surface, which is invisible in exactly one theme. Fixed by pairing
  correctly rather than by patching individual colours.
- Added --os-on-field-muted to the brand tokens: a fixed surface needs a fixed
  muted ink too, or secondary copy on lime falls back to near-white panel ink.
  Audited in packages/brand/test/tokens.test.ts (6.89:1, AA).
- The hero copy moved from absolute positioning to normal flow so it sets the
  hero height; Hero.tsx measures that height and feeds heroClipPaths. A fixed
  268px box was clipping the lead paragraph, and the amount clipped varied by
  monitor because the headline used a vw-based clamp. Type inside the hero is
  now rem-based; :root carries the single fluid clamp instead.
- Rejected per-component font-size bumps for (7) in favour of one root clamp,
  so every ratio on the page is preserved at every width.

## Files/components touched

- packages/brand/src/tokens.css - added --os-on-field-muted.
- packages/brand/test/tokens.test.ts - audit the new token in both themes.
- apps/web/src/styles.css - ink/surface pairing, root fluid type, .panel-heading
  (previously unstyled), .panel-stack, .paid-api-panel, .recovery-panel, a.secondary,
  hero layout and typography, theme and tab-switch motion.
- apps/web/src/components/Hero.tsx - measure height, drop the fixed 268px box.
- apps/web/src/App.tsx - removed the wallet and developer sections, keyed
  .tab-fade wrapper, .panel-stack on Tools, .recovery-panel on Recovery.
- apps/web/src/components/JobWorkspace.tsx - .paid-api-panel on the x402 section.
- apps/web/test/app-composition.test.tsx - assert the four-tab set.
- apps/web/test/styles.test.ts - guard the ink/surface pairing.

## Gate A round 1 (FAIL) and the fixes it forced

FreePi Gate A, glm-5.3-flash, returned FAIL on acceptance criterion 1: the
light theme still had unreadable text. The first pass fixed the reported
surfaces but missed that --os-surface also flips with the theme, so several
controls drawn on it kept panel inks:

- .response-output - near-white on white in light. Now --os-ink.
- .advanced-fields label - split out of the panel-ink group. Now --os-ink.
- .advanced-fields summary - now --os-ink-muted, weight 300 (was 600, the only
  bold left in the console).
- .job-workspace > input[readonly] - now --os-ink-muted.

Non-blocking findings also addressed: signal green on lime measured ~1.7:1, so
links on the field now take --os-on-field with an underline; fact rows on lime
take a new fixed --os-field-line token instead of the flipping --os-line.

apps/web/test/styles.test.ts gained a structural guard that resolves each
rule's nearest painting ancestor and fails on any fixed ink over a flipping
surface. Verified against the committed HEAD stylesheet: it reports all six
pre-fix pairings and reports the candidate clean.

## Commands/checks

- `pnpm build` - pass
- `pnpm test` - pass, 81 files / 1054 tests
- `pnpm lint` - pass
- `pnpm typecheck` - pass
- Browser check at 1440x1000, dev server in test mode: contrast measured from
  computed styles in both themes - tabs on ground 13.0 light / 18.0 dark,
  hero h1 on panel 12.52, quote dt/dd on lime field 6.89 / 12.8. All AA.

## External-doc findings

- None required; the change is confined to this repository's own tokens and
  stylesheet.

## Unresolved questions

- None.

## Git and PR state

- Branch: fix/console-readability-and-layout
- Base: develop at bfaf733b779dece7adc61c8b6483b1360e4f5667
- Commit: uncommitted working tree
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. User reviews the running app locally.
2. Stage the intended files, capture the candidate tree SHA, run FreePi Gate A
   in a fresh `npx free-pi-cli` process, then commit, push and open a draft PR
   targeting develop.
