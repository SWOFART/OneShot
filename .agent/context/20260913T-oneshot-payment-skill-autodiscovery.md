# OneShot payment skill: endpoint and payer discovery

## Goal

Make the downloadable `oneshot-arc-payment` skill use the canonical OneShot
MCP endpoint by default and explain how to resolve the active user wallet
without confusing a workspace bearer with a payer address.

## Acceptance criteria

- The skill identifies `https://oneshot.kapustazh.dev/mcp` as the canonical
  default endpoint.
- The skill never asks for or exposes the bearer in a task prompt.
- The skill reads an active wallet/account connector when the host provides one.
- Without wallet context, the skill requests only the public payer address and
  never guesses from a recipient, server wallet, or historical payment.
- Public docs and the in-app MCP guide match the skill behavior.

## Assumptions and non-goals

- The current `arc_payment` MCP schema intentionally keeps `payer_wallet`
  required because OneShot must bind the intent before the user signs.
- Skill instructions cannot create a wallet connector or register an MCP server
  in an arbitrary agent host; host configuration remains required once.
- This change does not enable the retained corporate server-wallet mode and does
  not alter payment or settlement code.

## Branch

`fix/oneshot-payment-skill-autodiscovery`, based on `origin/develop` at the
current checkout.

## Validation

- `pnpm exec prettier --check apps/web/src/components/McpDocsPage.tsx`
- `git diff --check`
- `pnpm --filter @oneshot/web build`
