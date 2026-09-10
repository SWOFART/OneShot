# C01 indexer removal/value matrix

Date checked: 2026-09-07

| Path                                                       | Lost-hash discovery                                                   | Freshness evidence                                                        | Arc Testnet         | Dependency                                           | Reuse                                          | Sponsor leverage                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Known Privy/Arc identity                                   | No hashless search; safest baseline when request/hash is known        | Direct provider/RPC state                                                 | Yes                 | Privy and Arc RPC                                    | High for known identity                        | None for The Graph                                          |
| Direct Arc log search                                      | Hashless tuple/window scan                                            | RPC head plus searched range                                              | Yes                 | Arc RPC                                              | Chain-specific scanner                         | None for The Graph                                          |
| Enhanced RPC/indexer                                       | Provider-specific hashless search                                     | Provider-specific                                                         | Must be proven      | Extra vendor                                         | Medium                                         | None for The Graph                                          |
| OneShot/Arc Subgraph through Studio GraphQL (optional MCP) | Structured transfer tuple/window candidates for an LLM recovery agent | `_meta` deployment, indexed block/time, indexing errors, and RPC head lag | Must be proven live | The Graph Studio; Network Gateway/MCP when supported | High for recovery views and agent explanations | Required live Graph-provider path for the selected AI track |

## Value test

Removing Subgraph MCP must remove automatic structured hashless candidate
discovery used by the LLM. It must not remove known-identity recovery, Arc
verification, the durable `UNKNOWN` hold, or any safety property.

The Graph path is retained only after a sanitized live trace proves that loss
of the transaction hash is recovered through the pinned MCP deployment and
that the returned candidate/freshness data materially changes the LLM's
selection or explanation. Otherwise OneShot uses direct recovery and reports
The Graph as `NOT VERIFIED`.

B01/B02 reject the memo-forwarding path because Privy cannot constrain the
nested recipient and amount. C01 therefore evaluates only the direct USDC
`Transfer` tuple/window path for v1; `memo_id` remains unused.
