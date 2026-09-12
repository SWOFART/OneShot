import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createArcReceiptSource } from '../src/receipt-source.js';

const TRANSACTION_HASH = `0x${'a'.repeat(64)}`;
const BLOCK_HASH = `0x${'b'.repeat(64)}`;
const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECIPIENT = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x3600000000000000000000000000000000000000';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function topic(address: string): string {
  return `0x${'0'.repeat(24)}${address.slice(2)}`;
}

function receiptPayload() {
  return {
    transactionHash: TRANSACTION_HASH,
    transactionIndex: '0x0',
    blockHash: BLOCK_HASH,
    blockNumber: '0x64',
    from: WALLET,
    to: TOKEN,
    cumulativeGasUsed: '0x1',
    gasUsed: '0x1',
    contractAddress: null,
    logsBloom: `0x${'0'.repeat(512)}`,
    status: '0x1',
    type: '0x2',
    effectiveGasPrice: '0x1',
    logs: [
      {
        address: TOKEN,
        topics: [TRANSFER_TOPIC, topic(WALLET), topic(RECIPIENT)],
        data: `0x${'0'.repeat(63)}1`,
        blockNumber: '0x64',
        transactionHash: TRANSACTION_HASH,
        transactionIndex: '0x0',
        blockHash: BLOCK_HASH,
        logIndex: '0x3',
        removed: false,
      },
    ],
  };
}

async function withRpcReceipt(
  result: unknown,
  callback: (rpcUrl: string) => Promise<void>,
  onRequest: () => void = () => undefined,
): Promise<void> {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    onRequest();
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { readonly id: number };
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as AddressInfo;
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

describe('Arc receipt source', () => {
  it('maps a finalized Arc receipt without exposing a signer or send path', async () => {
    await withRpcReceipt(receiptPayload(), async (rpcUrl) => {
      const source = createArcReceiptSource({ rpcUrl });
      await expect(source.getReceipt(TRANSACTION_HASH)).resolves.toMatchObject({
        transactionHash: TRANSACTION_HASH,
        chainId: 5042002,
        from: WALLET,
        to: TOKEN,
        status: 1,
        blockNumber: 100n,
        blockHash: BLOCK_HASH,
        logs: [
          expect.objectContaining({
            address: TOKEN,
            logIndex: 3,
          }),
        ],
      });
    });
  });

  it('returns null for a missing receipt and rejects malformed hashes before RPC access', async () => {
    let requests = 0;
    await withRpcReceipt(null, async (rpcUrl) => {
      const source = createArcReceiptSource({ rpcUrl });
      await expect(source.getReceipt(TRANSACTION_HASH)).resolves.toBeNull();
      await expect(source.getReceipt('not-a-transaction-hash')).resolves.toBeNull();
    }, () => {
      requests += 1;
    });
    expect(requests).toBe(1);
  });

  it('requires Arc Testnet rather than accepting a caller-selected chain', () => {
    expect(() =>
      createArcReceiptSource({ rpcUrl: 'http://127.0.0.1:1', chainId: 1 }),
    ).toThrow('User-wallet receipt verification requires Arc Testnet');
  });
});
