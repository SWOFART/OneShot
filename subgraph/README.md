# OneShot Arc Testnet Subgraph

Indexes USDC `Transfer` events on Arc Testnet for OneShot's lost-transaction-hash recovery path.

The subgraph discovers settlement candidates by sender, recipient, amount, and a bounded block window. Candidate data is observational: OneShot verifies any selected transaction through Arc RPC before changing authoritative settlement state.

## Network

- Network: Arc Testnet (`eip155:5042002`)
- USDC contract: `0x3600000000000000000000000000000000000000`
- Start block: `61000000`
- Studio slug: `oneshot-arc-testnet`

## Local validation

```sh
pnpm --filter @oneshot/arc-subgraph codegen
pnpm --filter @oneshot/arc-subgraph build
```

## Studio deployment

Authenticate with the Subgraph Studio deploy key without committing it, then run:

```sh
graph auth <DEPLOY_KEY>
pnpm --filter @oneshot/arc-subgraph deploy:studio
```

After deployment, pin the immutable deployment ID in the OneShot runtime. Runtime queries use a separate Gateway API key through Subgraph MCP.

## Candidate query

```graphql
query CandidateTransfers(
  $sender: Bytes!
  $recipient: Bytes!
  $amount: BigInt!
  $minBlock: BigInt!
  $maxBlock: BigInt!
) {
  usdcTransfers(
    where: {
      from: $sender
      to: $recipient
      amount: $amount
      blockNumber_gte: $minBlock
      blockNumber_lte: $maxBlock
    }
    orderBy: blockNumber
    orderDirection: asc
  ) {
    id
    transactionHash
    logIndex
    blockNumber
    blockTimestamp
    from
    to
    amount
  }
  _meta {
    deployment
    hasIndexingErrors
    block {
      number
      hash
      timestamp
    }
  }
}
```
