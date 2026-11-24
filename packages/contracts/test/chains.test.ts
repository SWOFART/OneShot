import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARC_MAINNET_CHAIN,
  ARC_TESTNET_CHAIN,
  BASE_SEPOLIA_CHAIN,
  ENABLED_SETTLEMENT_NETWORKS,
  createChainRegistry,
  isEnabledSettlementNetwork,
  parseCreateIntentRequest,
  selectSettlementChain,
  settlementChainRegistry,
} from '../src/index.js';

const intent = {
  business_intent_id: 'intent-chain-1',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '1000000',
  asset: 'USDC',
  purpose: 'Invoice INV-1001',
};

describe('settlement chain registry', () => {
  it('keeps Arc Testnet as the first enabled chain', () => {
    expect(settlementChainRegistry.list()[0]).toBe(ARC_TESTNET_CHAIN);
    expect(settlementChainRegistry.enabled().map((chain) => chain.id)).toEqual([
      'arc-testnet',
      'base-sepolia',
    ]);
  });

  it('pins Base Sepolia USDC and leaves Arc Mainnet unpublished', () => {
    expect(BASE_SEPOLIA_CHAIN.chainId).toBe(84532);
    expect(BASE_SEPOLIA_CHAIN.caip2).toBe('eip155:84532');
    expect(BASE_SEPOLIA_CHAIN.settlementAsset).toEqual({
      symbol: 'USDC',
      decimals: 6,
      contract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    });
    expect(BASE_SEPOLIA_CHAIN.nativeAsset).toEqual({ symbol: 'ETH', decimals: 18 });
    expect(ARC_MAINNET_CHAIN.enabled).toBe(false);
    expect(ARC_MAINNET_CHAIN.verification).toBe('UNPUBLISHED');
    expect(JSON.stringify(settlementChainRegistry.list())).not.toMatch(/https?:\/\//);
  });

  it('builds an isolated registry without changing the shipped catalog', () => {
    const extra = createChainRegistry([
      ...settlementChainRegistry.list(),
      {
        id: 'example-testnet',
        displayName: 'Example Testnet',
        family: 'evm',
        settlementMethod: 'erc20-transfer',
        verification: 'PINNED',
        enabled: true,
        isMainnet: false,
        chainId: 1,
        caip2: 'eip155:1',
        settlementAsset: {
          symbol: 'USDC',
          decimals: 6,
          contract: '0x0000000000000000000000000000000000000001',
        },
        nativeAsset: { symbol: 'ETH', decimals: 18 },
      },
    ]);
    expect(extra.get('example-testnet')?.displayName).toBe('Example Testnet');
    expect(settlementChainRegistry.get('example-testnet')).toBeUndefined();
  });

  it('matches the OpenAPI settlement network enum', () => {
    const openapi = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../openapi/openapi.v1.json'), 'utf8'),
    ) as {
      components: {
        schemas: {
          CreateIntentRequest: { properties: { network: { enum?: string[] } } };
          IntentResponse: { properties: { network: { enum?: string[] } } };
        };
      };
    };
    expect(openapi.components.schemas.CreateIntentRequest.properties.network.enum).toEqual([
      ...ENABLED_SETTLEMENT_NETWORKS,
    ]);
    expect(openapi.components.schemas.IntentResponse.properties.network.enum).toEqual([
      ...ENABLED_SETTLEMENT_NETWORKS,
    ]);
  });
});

describe('direct intent network validation', () => {
  it('accepts every enabled settlement network', () => {
    for (const network of ENABLED_SETTLEMENT_NETWORKS) {
      expect(parseCreateIntentRequest({ ...intent, network }).network).toBe(network);
    }
  });

  it('rejects a network that is not an enabled chain', () => {
    expect(() => parseCreateIntentRequest({ ...intent, network: 'eip155:1' })).toThrow(
      /enabled settlement chain/u,
    );
    expect(isEnabledSettlementNetwork('eip155:1')).toBe(false);
  });
});

describe('selectSettlementChain', () => {
  it('defaults to Arc Testnet when no selector is set', () => {
    expect(selectSettlementChain({}).id).toBe('arc-testnet');
  });

  it('selects Base Sepolia from ONESHOT_CHAIN', () => {
    expect(selectSettlementChain({ ONESHOT_CHAIN: 'base-sepolia' }).caip2).toBe('eip155:84532');
  });

  it('refuses a disagreement between the two selectors', () => {
    expect(() =>
      selectSettlementChain({ ONESHOT_CHAIN: 'base-sepolia', ONESHOT_ARC_PROFILE: 'arc-testnet' }),
    ).toThrow(/different chains/u);
  });

  it('refuses unpublished mainnet', () => {
    expect(() => selectSettlementChain({ ONESHOT_CHAIN: 'arc-mainnet' })).toThrow(/no pinned/u);
  });
});
