# Circle seller endpoint integration

Date/time: 2026-09-11T13:52:38Z

## User goal

Add Circle's official Arc nanopayments seller routes so the existing OneShot
paid-API cabinet can request and pay a real HTTPS x402 resource through the
deployed `oneshot.kapustazh.dev` site. Preserve the existing OneShot
at-most-once payment and recovery behavior.

## Original request

Create a new branch and implement the missing Circle seller application. The
deployed site is `oneshot.kapustazh.dev`; the intended dataset resource is
`/api/premium/dataset` at 10,000 atomic USDC units.

## Acceptance criteria

- Seller service exposes Circle Gateway-protected `/api/premium/quote`,
  `/api/premium/dataset`, `/api/premium/compute`, and `/api/premium/agent-task`
  routes with official sample-compatible methods and prices.
- Unpaid Arc Testnet requests return Circle x402 v2 payment requirements; paid
  requests settle through Circle's testnet facilitator and return the resource.
- Seller is testnet-only, validates its public receiving address, and does not
  require or persist a private key.
- Cloudflare Worker can proxy `/api/premium/*` to the separately deployed seller
  service while stripping OneShot credentials and exposing payment headers.
- Documentation explains local startup, Cloud Run deployment, Worker routing,
  `ONESHOT_X402_URL`, and required live checks.
- Tests cover unpaid requirements, paid success with mocked facilitator, route
  methods/prices, proxy behavior, and malformed configuration.
- Existing OneShot invariant remains unchanged: one Business Intent has at most
  one committed settlement; seller handlers have no chargeable side effects.

## Assumptions and non-goals

- Use Circle's official `createGatewayMiddleware` and the Arc Testnet
  facilitator; do not clone the full dashboard/private-key portion of the
  official sample.
- The seller is a separate Node service. The existing API remains the buyer and
  ledger authority; the Cloudflare Worker provides the same-domain public path.
- This session implements code and deployment instructions only. It does not
  deploy Cloud Run or mutate Cloudflare production configuration, because no
  deployment credentials or seller wallet address were supplied.
- Gate A and Gate B are not started in this session unless explicitly requested
  later; local verification and a review prompt handoff are still required.

## External documentation findings

- Circle's official seller quickstart uses `createGatewayMiddleware` and
  `gateway.require(price)`.
- The official Arc nanopayments sample defines the four requested routes and
  prices: GET quote at $0.001, GET dataset at $0.01, POST compute at $0.0003,
  and GET agent-task at $0.03.
- The buyer adapter requires exactly one affordable Arc Testnet Gateway option;
  the OneShot demo therefore points to dataset and caps it at `10000` atomic
  units.

## Branch state

- Branch: `feature/circle-seller-endpoint`
- Base: `develop` / `origin/develop` at `dc128a733456c7f8e3e591df624fa8136a793881`
- Worktree was clean before implementation.
- No commit or PR exists yet for this branch.

## Plan

1. Add the standalone seller app and native HTTP adapter around Circle
   middleware.
2. Add Worker same-domain proxy support.
3. Add Docker/deployment and environment documentation.
4. Add focused tests and run format, lint, typecheck, build, and test checks.
5. Record exact final tree/check evidence and hand off without starting Gate A.

## Files/components touched

- `apps/seller/`: standalone Node seller with Circle middleware, route handlers,
  runtime config, entrypoint, and focused tests.
- `apps/web/worker.ts`: same-domain `/api/premium/*` proxy with credential
  stripping and payment-header exposure.
- `Dockerfile.seller`, `cloudbuild-seller.yaml`: Google Cloud Run image/build
  artifacts.
- `.env.example`, `README.md`, `apps/web/README.md`,
  `docs/CIRCLE_X402_DEMO.md`, and `docs/CIRCLE_X402_SELLER.md`: configuration,
  deployment, and live verification instructions.
- `tsconfig.json` and `pnpm-lock.yaml`: workspace registration and locked SDK
  dependencies.
- `apps/web/test/worker-proxy.test.ts`: public proxy boundary tests.

## Commands/checks

- `pnpm install --lockfile-only`: passed; lockfile supply-chain policy passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm check:generated`: passed.
- `pnpm exec prettier --check "**/*.{ts,mts,mjs,json,jsonc,yml,yaml}"`: passed.
- `npx --yes markdownlint-cli2@0.18.1 "**/*.md" "#node_modules"`: passed,
  161 files, 0 errors.
- `pnpm test`: passed, 81 files and 1,050 tests.
- `pnpm build:frontend`: passed.
- `pnpm --filter @oneshot/seller test`: passed, 5 tests.
- Web proxy test suite: passed as part of 19 files and 95 tests.
- PostgreSQL integration was not rerun locally; seller changes have no database
  schema or ledger changes and CI remains the authoritative container run.

## External-doc findings

Circle's official seller quickstart and Arc nanopayments sample were checked
against the implementation. The route methods/prices match the sample. The
service uses only a public seller address and the testnet facilitator; the
official sample's private-key dashboard/withdrawal features are intentionally
outside this service.

## Unresolved deployment steps

- Operator must provide a real Arc Testnet seller address and deploy
  `oneshot-seller` to Google Cloud Run.
- Operator must deploy the Worker with `SELLER_BACKEND_URL` set to the seller's
  public HTTPS URL.
- Operator must set `ONESHOT_X402_URL` and `ONESHOT_X402_MAX_AMOUNT_ATOMIC=10000`
  on the API and payment worker, then verify both direct and same-domain URLs
  return HTTP 402 with a `PAYMENT-REQUIRED` header.
- No live payment or ArcScan transaction was created by local tests.

## Gate state and handoff

- Gate A: not started by request.
- Gate B: not applicable before Gate A/PR/CI.
- Current head: `dc128a733456c7f8e3e591df624fa8136a793881` with the seller
  implementation staged and no commit yet.
- Next step: review the final diff, stage only intended files, and hand off the
  branch plus deployment runbook. Do not claim live deployment or sponsor
  qualification without operator evidence.
