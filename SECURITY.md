# Security

OneShot moves USDC and stores settlement state. Report a vulnerability in
private. Do not open a public issue, pull request, or discussion for a
security problem, and do not include exploit details, credentials, or live
transaction secrets in public text.

## Private report

Use GitHub private vulnerability reporting:

<https://github.com/SWOFART/OneShot/security/advisories/new>

If that form is unavailable, email [work@kapustazh.dev](mailto:work@kapustazh.dev)
with the subject `OneShot security`. Include what you can verify, the affected
component, and the impact. Leave out secrets, seed phrases, and raw credentials.

## What helps

- The component (API, worker, reconciliation, wallet, MCP, web, or chain adapter).
- Whether the issue can submit, replay, or hide a settlement.
- The network, if one is involved. Arc Testnet is `eip155:5042002`. Mainnet is
  disabled.
- A minimal description of impact. Proof-of-concept detail belongs only in the
  private report.

A maintainer will acknowledge the report and coordinate a fix. Public issues
remain available for defects that are not security vulnerabilities.
