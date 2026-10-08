<!-- The brand lock-up from apps/web's own `.top-nav`, rendered by
     `scripts/render-nav-panel.mjs`; re-run that script after a brand token,
     mark, or label change. -->
<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="docs/assets/nav-panel-dark.svg"
    />
    <img
      src="docs/assets/nav-panel-light.svg"
      alt="OneShot — settlement engine"
      width="381"
    />
  </picture>
</div>

# OneShot

**One job. Many retries. One settlement.**

OneShot is a settlement engine for companies building AI agents that purchase
paid tools and services. It keeps one approved business obligation tied to at
most one committed settlement, even when a job retries, crashes, or loses the
payment response.

Early-stage prototype · Arc Testnet only · Seeking feedback and pilot partners.

[Discuss an integration or pilot](mailto:work@kapustazh.dev) ·
[Developer guide](docs/DEVELOPER_GUIDE.md) ·
[Architecture](docs/DOMAIN_ARCHITECTURE.md)

## Why OneShot

An agent pays for a service. The connection drops before the receipt arrives.
A replacement agent cannot tell whether payment succeeded. Retrying can pay
twice; stopping leaves the job unfinished and an operator investigating.

OneShot gives retries a durable identity and preserves payment evidence. An
uncertain payment enters `UNKNOWN` and must be reconciled before any decision
to retry payment. A missing or delayed index result never proves non-payment.

The goal is to help teams recover interrupted agent workflows with a clear
record of what was approved, attempted, and settled.

## Who we are building for

Our initial focus is **B2B teams building AI agents** that buy paid API
operations or digital results. Companies running those agents internally are
prospective buyers; platforms selling services to agents are prospective
integration partners.

A representative workflow is an agent buying a company report. If payment
succeeds but delivery fails, a replacement agent resumes the original job and
retrieves its result without a replacement payment. Supplier delivery recovery
requires the supplier to support stable order identity and result retrieval.

## How it works

1. **Record the obligation.** One stable business intent survives retries,
   restarts, and multiple agent instances.
2. **Control settlement.** Durable, atomic state grants submission ownership;
   authorization and spending policy constrain the worker-owned wallet action.
3. **Resolve uncertainty.** Reconcile ambiguous outcomes against provider and
   Arc receipt evidence. Hold unresolved payments for further investigation.
4. **Resume delivery.** Keep the supplier result separate from settlement so
   downstream failures do not erase an existing payment.

```text
1 Business Intent / N Attempts / at most 1 committed Settlement
```

OneShot owns intent and settlement state. Privy provides wallet access and
scoped authorization on the worker-owned settlement path; Arc provides the
USDC settlement rail. The Graph discovers recovery candidates and supplies
observations, while Arc verifies them. Index results and model advice cannot
authorize settlement.

Browser and MCP user-wallet flows use a separate payer-bound path: the user's
wallet signs and broadcasts the transaction, and OneShot verifies its receipt.
An MCP bearer authenticates a workspace; it cannot sign or broadcast payments.

## What exists today

| Area                         | Current evidence and limits                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settlement engine            | Durable intent ledger, API, settlement workers, and reconciliation core are implemented.                                                                                                                             |
| Testnet payment and recovery | Repository evidence records a live 1.00 USDC Privy-authorized Arc Testnet settlement, policy denials with zero broadcasts, and a lost-response drill that recovered the original settlement without another payment. |
| Agent and operator access    | Browser workspace and MCP tools `arc_payment` and `arc_payment_submit` are implemented. A live end-to-end MCP payment trace remains pending in the documented status.                                                |
| Paid job delivery            | A team-operated testnet report supplier supports task/order binding and separate delivery/result retrieval. Third-party supplier execution is not demonstrated.                                                      |
| Graph recovery               | Studio GraphQL discovery is implemented. Fresh live evidence of its material effect on model-assisted recovery remains pending; sponsor qualification is not verified.                                               |

See [live settlement evidence](docs/settlement/LIVE_EVIDENCE.md) and the
[qualification report](packages/reconciliation/docs/c06/QUALIFICATION_REPORT.md)
for the recorded runs and their limitations. These are prototype evidence,
not production-scale validation. Mainnet is disabled.

## Stage and next steps

OneShot is built by a two-person team and is currently validating its customer
problem. We do not yet have customers, paying pilots, or a validated customer
feedback loop. Pricing is undecided; subscription and per-transaction models
are options to test with prospective buyers.

Our next priority is customer discovery with agent builders and internal
automation teams, followed by a narrowly scoped pilot. We want to understand
how teams handle ambiguous payments today, what recovery costs them, and where
OneShot would fit into their existing stack.

We are also seeking service-platform partners to test payment and delivery
recovery together. Broad supplier support and exactly-once execution of
arbitrary tools are outside the current demonstrated scope.

## Talk to us

Building agents that purchase services, running them inside your company, or
selling tools to agents? We would like to hear how you handle retries and lost
payment responses, and discuss a technical integration or early pilot.

**[work@kapustazh.dev](mailto:work@kapustazh.dev)**

## Explore the project

| Resource                                           | Purpose                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Developer guide](docs/DEVELOPER_GUIDE.md)         | Local setup, operator sign-in, repository layout, API routes, and state machine |
| [Domain architecture](docs/DOMAIN_ARCHITECTURE.md) | Ownership, domain model, and system boundaries                                  |
| [Agent connection guide](docs/MCP_ARC_PAYMENT.md)  | MCP deployment, client configuration, and walkthrough                           |
| [Recovery hardening](docs/RECOVERY_HARDENING.md)   | Recovery, authentication, and operational contracts                             |
| [Product plan](plan.md)                            | Scope, roadmap, and delivery gates                                              |
| [Contribution policy](AGENTS.md)                   | Repository policies and review requirements                                     |

## License

MIT. See [LICENSE](LICENSE).
