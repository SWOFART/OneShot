# C06 qualification demo context

- Branch: `milestone/c06-qualification-demo`
- Base: merged `origin/develop` at `1250dec79bc702939fe2a3b0fd00e66bb34128af`
- User correction: C06 starts from merged `develop`, not the C05 feature branch.
- Public target: `https://oneshot.kapustazh.dev/` currently serves
  `apps/placeholder-frontend` through Wrangler.
- C06 will publish the recovery UI as a clearly labelled synthetic review demo,
  add repeatable qualification/evidence checks, and preserve zero-submit safety.
- Live Privy, Arc Testnet, and Subgraph MCP evidence is absent at branch start.
  Sponsor verdicts therefore remain `NOT VERIFIED`; fixtures and plans must not
  be promoted into live evidence.
- No external wallet, policy, funding, deployment, or real-value mutation is in
  scope without separate human provisioning and authorization.
- FreePi policy: use `/model free-pi/glm-5.3-flash` first; do not stream noisy
  progress. If a quiet review is not practical, provide the exact prompt to the
  user for manual relay.

## Implemented

- Wrangler now builds/deploys the recovery viewer instead of the placeholder.
- Wrangler owns the frontend build hook, so Cloudflare's direct `wrangler
deploy` path creates `site-dist` on a clean checkout.
- The public viewer uses in-memory fixtures, exposes a scenario selector, and
  carries a persistent synthetic/not-live evidence banner.
- Production recovery defaults no longer substitute Graph/model simulators;
  absent live ports fail closed as unavailable.
- Added a sponsor evidence classifier that requires `LIVE_CAPTURE` for live
  requirements and reports `NOT_VERIFIED` for plans, simulators, or missing refs.
- Added C06 evidence index, demo/reset runbook, live capture checklist,
  qualification report, and limitations.
- Merged `origin/milestone/c06-live-subgraph` commit `fe54774`: Arc Testnet USDC
  Subgraph source plus a recorded Studio deployment. This does not upgrade The
  Graph beyond `NOT VERIFIED` because the canonical immutable identity, Indexer
  allocation, live MCP trace, and model/core trace remain missing.

## Validation

- Recovery UI: lint/type/build PASS; 51 tests PASS.
- Reconciliation: lint/type/build PASS; 74 tests PASS.
- Worker: lint/type PASS; 20 tests PASS.
- Root: lint/type/build PASS; 569 tests PASS; generated contracts and fixtures PASS.
- Replay nondeterminism found during full validation was fixed by binding the
  chaos harness decision timestamp to its recorded scenario clock.
- Wrangler production bundle dry-run PASS; no deployment performed.
- Desktop and 390x844 mobile visual QA PASS.
- Changed-file Prettier PASS. Repository-wide format remains affected by the
  pre-existing Windows line-ending baseline.

## Live gate

Privy, Arc, and The Graph remain `NOT VERIFIED`. C06 live acceptance cannot pass
until a human provisions and returns the sanitized artifacts in
`packages/reconciliation/docs/c06/LIVE_CAPTURE_CHECKLIST.md`.

## Review state

- Recorded base: `1250dec79bc702939fe2a3b0fd00e66bb34128af`.
- Gate A passed tree `28b9445183b7d453ab813662ab3be0d15afbd2e3` and
  produced commit `41399ad18433116b71eb9ad910bec34e024f3f60`.
- That Gate A is now invalidated by the user-requested merge of
  `milestone/c06-live-subgraph` and the subsequent integration fixes. A new
  candidate review is required before another push.

## Post-review integration

- Merged commit `fe547744db3ef4d70e8d87a7bdcf8b736cafb6c9` through merge
  commit `4ce750f`.
- Cloudflare check `15da7c47-1b3d-4f57-8408-d772eb4396fc` failed at the
  pre-deploy boundary. Its private log requires Cloudflare login; the local
  configuration showed that a clean direct `wrangler deploy` had no guaranteed
  `site-dist` build.
- Added Wrangler `build.command`; dry-run now logs the custom Vite build before
  loading four static assets.
- Added `subgraph` to the root pnpm workspace, moved dependency authority to the
  root lockfile, and removed the redundant nested lockfile.
- Subgraph codegen PASS and Graph build PASS on Windows PowerShell.
- Root lint/type/build PASS; 569 tests PASS after the merge. Root build now
  includes the Subgraph compiler.
- Wrangler dry-run PASS with the custom build hook visibly executing before
  asset discovery. No Cloudflare deployment or rerun was performed.
