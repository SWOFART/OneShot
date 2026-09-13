# Session Context: live Arc subgraph

## Date/time

- UTC: 2026-09-08T11:38:31Z

## User goal

Deploy a live OneShot Subgraph that indexes Arc Testnet USDC transfers and make
it available to the recovery path through The Graph Gateway and Subgraph MCP.

## Original prompt/request

The user confirmed that the Privy secret, Graph deploy key, and Graph Gateway
API key exist in Google Secret Manager and asked to continue connecting The
Graph. No credential values belong in the repository.

## Assumptions

- Arc Testnet `eip155:5042002` and its USDC interface remain the selected demo profile.
- The initial start block may intentionally precede the first OneShot demo transfer.
- The Graph results discover candidates only; Arc RPC remains authoritative.

## Plan

1. Commit and publish the independently buildable subgraph source.
2. Wait for a Graph Network indexer allocation to the published deployment.
3. Verify an immutable live query through Gateway and Subgraph MCP.
4. Wire the live MCP adapter without exposing credentials.

## Key decisions

- Index immutable USDC `Transfer` events with sender, recipient, amount, block,
  log index, timestamp, and transaction hash.
- Pin the recovery path to the immutable manifest deployment instead of an
  automatically moving Studio version label.
- Publish registration on Arbitrum One while the indexed data source remains Arc Testnet.

## Files/components touched

- `subgraph/`: manifest, ERC-20 ABI, schema, mapping, package metadata, lockfile,
  candidate-query documentation, and generated/build ignores.

## Commands/checks

- `pnpm --dir subgraph codegen` - passed.
- `pnpm --dir subgraph build` - passed.
- Studio deployment `v0.1.0` - deployed and indexing live Arc events without errors.
- Studio GraphQL `_meta` and transfer query - passed with live data.
- Graph Gateway immutable-deployment query - publication visible, currently waiting on an Indexer allocation.
- `git diff --check` - passed before handoff preparation.

## External-doc findings

- The Graph CLI `0.98.1` uses the Studio deploy endpoint and supports publishing
  the same Arc-indexing manifest through The Graph Network registration on Arbitrum One.
- Hosted Subgraph MCP queries published deployments through The Graph Gateway;
  a Studio-only deployment is insufficient for that path.

## Unresolved questions

- Which of the two duplicate publication registrations should be the canonical Subgraph ID.
- When the first Indexer allocation will become available for the published deployment.

## Git and PR state

- Branch: `milestone/c06-live-subgraph`
- Base: `origin/develop` at `25a17d86b56822a7e7440d34c331b740cb6d7f04`
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN; the user requested no review gates for this configuration/integration step.
- Gate B: NOT RUN; no PR exists.

## Handoff/next steps

1. Obtain the canonical public Subgraph ID from Graph Explorer/Studio.
2. Wait for allocation and verify the live deployment through Gateway and hosted Subgraph MCP.
3. Commit and push the focused branch, then implement the runtime adapter separately.
