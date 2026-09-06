# OneShot

Before planning, editing, reviewing, or publishing any change, read
`AGENTS.md`, `.agent/AGENTS.md`, and `.agent/MILESTONE_IMPLEMENTATION_LOOP.md`
completely and follow them as mandatory repository policy.

Those files are authoritative. Nothing in this file overrides them; the list below
is a reminder, not a replacement. If a policy file is missing or unreadable, stop
and report it. Do not guess the review or publishing process.

## Project

OneShot — Payment Intent Firewall. A `businessIntentId` binds organization,
supplier, invoice number, amount, currency, purchase order, and document version,
so one invoice settles exactly once even across competing agents, distinct
mandates, differing transaction nonces, and repeated retries after a lost
response. Built as a recovery/audit layer over existing payment rails
(EIP-3009 / x402), not as a replacement payment primitive.

Strategy notes and bounty analysis live in a separate vault repo:
`~/Documents/thoughts`. Do not commit vault notes here — event-window commit
history in this repo is inspected by hackathon judges.

## Non-negotiables

- Never implement directly on `main` or `develop`. Branch from `develop` as
  `milestone/<id>-<name>`, `feature/<name>`, or `fix/<name>`.
- All pull requests target `develop` and start as **draft**.
- Review Gate A (pre-PR, full workspace diff against `develop`) and Review Gate B
  (post-CI, bound to the exact PR head SHA) are both mandatory.
- Gates run in **independent sessions**. The implementation agent must never
  review its own work, and a Gate A session must never be reused for Gate B.
- Any content change invalidates Gate A. Any commit invalidates Gate B.
- `WARN`, truncated output, unavailable tooling, an auth failure, or an ambiguous
  verdict is a FAIL, not a pass.
- Never bypass a failing check with `--force`, `--no-verify`, broadened ignore
  rules, lowered thresholds, or dependency overrides. Fix the cause or report a
  genuine blocker.
- Never merge a pull request. The user performs final review and merges.
- Never commit secrets, keys, tokens, credentials, or personal data.

## Handoff format

When work is agent-complete, report: branch name, head commit SHA, PR URL, checks
run, Gate A and Gate B verdicts, known limitations, and the exact decision
required from the user.
