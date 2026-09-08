import { Transfer as TransferEvent } from '../generated/ArcTestnetUSDC/ERC20';
import { UsdcTransfer } from '../generated/schema';

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
}
