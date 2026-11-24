# Roadmap

OneShot is an early-stage settlement engine: one business intent, many retries,
at most one committed USDC settlement. Arc Mainnet is the pinned default rail
and stays inactive until `ONESHOT_ALLOW_MAINNET_ACTIVATION=true`. Arc Testnet
and Base Sepolia are selectable. There are no customers or paying pilots yet.

This is a planning list, not a claim that later milestones are implemented.
Status words describe the repository as it stands, not a release promise.
GitHub milestones are optional trackers for the same names. This file does not
create them.

| Milestone                  | What it means                                                                                                                                                          | State                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Settlement core            | Durable intent, atomic submit ownership, integer USDC amounts, and at most one committed settlement                                                                   | In the tree. Keep it from regressing.                                                          |
| Operator recovery          | `UNKNOWN` stays unresolved until receipt evidence or a human decision. Graph discovery is not settlement authority.                                                    | In the tree for Arc Testnet. Arc Mainnet and Base Sepolia have no indexer in this build.       |
| Agent payments             | Browser workspace and MCP tools pay on the selected chain and record the same intent.                                                                                 | In the tree. A live end-to-end MCP payment trace is still pending.                             |
| Resumable paid work        | A team-operated testnet supplier can return a result without a second payment when delivery fails after settlement.                                                   | In the tree for that supplier. Third-party suppliers are not demonstrated.                    |
| Settlement chains          | A chain record selects Arc Mainnet, Arc Testnet, or Base Sepolia. Official chain id, token, and decimals only.                                                        | In the tree. See [CHAINS.md](docs/settlement/CHAINS.md). Another chain is a chain-integration issue. |
| Mainnet activation         | Arc Mainnet parameters are pinned. Settlement still requires `ONESHOT_ALLOW_MAINNET_ACTIVATION=true`.                                                                  | Not automatically active. Do not treat testnet evidence as a production claim.                |
| Pilots                     | Learn how agent teams handle a lost payment response, then run one narrow pilot.                                                                                      | Not started. Pricing is undecided.                                                             |

## How to use this

- Bugs and small fixes do not need a roadmap change.
- A planning issue names one milestone, or proposes a change to this list.
- A pull request that changes the product boundary updates this file in the
  same change.
- Evidence limits in the [README](README.md) stay authoritative over a
  milestone marked "in the tree."

Retired third-party purchasing and seller-proxy flows stay retired. A new
settlement chain is a chain-integration issue with official parameters, not a
guessed default.

Details and the issue workflow are in [docs/planning/README.md](docs/planning/README.md).
