# Gateway funding UX

## Goal

Add an explicit user-wallet funding flow for Circle Gateway Nanopayments on Arc
Testnet. The connected buyer wallet funds its own Gateway balance; OneShot must
never fund or substitute a server wallet.

## Branch

- Branch: `fix/gateway-funding`
- Base: refreshed `origin/develop` (record exact SHA during Gate A)
- Worktree: `OneShot-gateway-funding`

## Acceptance criteria

- Funding is initiated only by an explicit user action from the connected Privy
  EVM wallet.
- The flow uses Arc Testnet only (`chainId` 5042002, Gateway domain 26) and
  testnet USDC only.
- The flow approves the Gateway Wallet to spend the requested ERC-20 amount,
  waits for a successful receipt, then calls `deposit(USDC, amount)`.
- It never sends a normal ERC-20 transfer directly to the Gateway Wallet.
- The active wallet address is the depositor and cannot be substituted.
- Amounts remain integer atomic units / bigint and are validated before wallet
  prompts.
- A lost or ambiguous deposit response is held for verification; the UI does
  not blindly repeat the deposit.
- The paid API path can use the resulting Gateway balance without changing its
  existing at-most-once settlement state machine.

## Non-goals

- No mainnet support or real-value funding.
- No server-side funding, private-key handling, or Gateway credentials.
- No changes to durable paid API settlement semantics.
- No automatic deposits without user confirmation.

## Failure boundaries

- Before approval submission: no Gateway balance effect; retry may be offered.
- Approval submitted/pending/reverted: do not submit deposit until approval is
  confirmed; preserve the approval hash when available.
- Deposit submitted/pending/lost response: do not retry blindly; show the hash
  or verification instruction and re-check Gateway balance/pending deposits.

## Selected test matrix cases

- Privy denial: zero Gateway funding and no deposit call.
- Crash/lost response around approval and deposit: preserve safe hold and avoid
  duplicate deposit prompts.
- Repeated funding action: balance/known pending state checked before a new
  deposit.
- Exact wallet, chain, token, Gateway contract, and integer amount validation.

## Public integration evidence

Circle documents Arc Testnet as Gateway Nanopayments domain 26, requires a
Gateway deposit before gas-free payments, and warns against direct ERC-20
transfers to the Gateway Wallet. Testnet USDC and testnet gas only are in scope.
