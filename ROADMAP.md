# Roadmap

OneShot is an early-stage settlement engine: one business intent, many retries,
at most one committed USDC settlement. Arc Testnet (`eip155:5042002`) is the
rail in this tree. Mainnet is disabled. There are no customers or paying pilots
yet.

This is a planning list, not a claim that later milestones are implemented.
Status words describe the repository as it stands, not a release promise.
GitHub milestones are optional trackers for the same names. This file does not
create them.

| Milestone                  | What it means                                                                                                                                                          | State                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Settlement core            | Durable intent, atomic submit ownership, integer USDC amounts, and at most one committed settlement                                                                   | In the tree. Keep it from regressing.                                                          |
| Operator recovery          | `UNKNOWN` stays unresolved until receipt evidence or a human decision. Graph discovery is not settlement authority.                                                    | In the tree. Fresh live Graph qualification is still not claimed.                              |
| Agent payments             | Browser workspace and MCP tools pay on the configured testnet and record the same intent.                                                                             | In the tree. A live end-to-end MCP payment trace is still pending.                             |
| Resumable paid work        | A team-operated testnet supplier can return a result without a second payment when delivery fails after settlement.                                                   | In the tree for that supplier. Third-party suppliers are not demonstrated.                    |
| More settlement chains     | A chain record selects another pinned USDC testnet without a second settlement for the same intent. Official chain id, token, and decimals only.                     | Not in this tree. Track it with a chain-integration issue.                                    |
| Mainnet                    | Official Arc mainnet parameters, an explicit human authorization, and a settlement cap. No guessed addresses.                                                         | Disabled. Do not treat testnet evidence as mainnet readiness.                                 |
| Pilots                     | Learn how agent teams handle a lost payment response, then run one narrow pilot.                                                                                      | Not started. Pricing is undecided.                                                             |

## How to use this

- Bugs and small fixes do not need a roadmap change.
- A planning issue names one milestone, or proposes a change to this list.
- A pull request that changes the product boundary updates this file in the
  same change.
- Evidence limits in the [README](README.md) stay authoritative over a
  milestone marked "in the tree."

Details and the issue workflow are in [docs/planning/README.md](docs/planning/README.md).
