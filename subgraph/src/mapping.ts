import { Transfer as TransferEvent } from '../generated/ArcTestnetUSDC/ERC20';
import { SettlementCandidate, UsdcTransfer } from '../generated/schema';

export function handleTransfer(event: TransferEvent): void {
  const transfer = new UsdcTransfer(event.transaction.hash.concatI32(event.logIndex.toI32()));

  transfer.transactionHash = event.transaction.hash;
  transfer.logIndex = event.logIndex;
  transfer.blockNumber = event.block.number;
  transfer.blockTimestamp = event.block.timestamp;
  transfer.from = event.params.from;
  transfer.to = event.params.to;
  transfer.amount = event.params.value;

  transfer.save();

  const candidate = new SettlementCandidate(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  );

  candidate.transactionHash = event.transaction.hash;
  candidate.logIndex = event.logIndex;
  candidate.blockNumber = event.block.number;
  candidate.blockHash = event.block.hash;
  candidate.blockTimestamp = event.block.timestamp;
  candidate.network = 'eip155:5042002';
  candidate.tokenContract = event.address;
  candidate.sender = event.params.from;
  candidate.recipient = event.params.to;
  candidate.amountAtomic = event.params.value;
  candidate.memoId = null;

  candidate.save();
}
