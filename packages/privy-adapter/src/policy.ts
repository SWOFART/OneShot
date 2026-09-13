/**
 * Privy authorization policy model (B01.3).
 *
 * Verified 2026-09-07 against https://docs.privy.io/controls/policies/overview.
 * See `.agent/research/20260907-b01-arc-privy-verification.md`.
 *
 * A Privy policy is rules over conditions, and the condition field sources
 * relevant to settlement are:
 *
 * - `ethereum_transaction` — `to`, `value`, `chain_id`
 * - `ethereum_calldata`    — the called function and its decoded arguments,
 *                            given the contract ABI
 *
 * That set fully constrains a DIRECT ERC-20 transfer, which is why v1 settles
 * with one. It does not reach inside a forwarded inner call, which is why the
 * Arc Memo path is not used for settlement.
 */

/** The five dimensions a settlement policy must pin. */
export type ConstrainedDimension =
  | 'chain'
  | 'destinationContract'
  | 'nativeValue'
  | 'method'
  | 'recipient'
  | 'amount';

export const REQUIRED_DIMENSIONS: readonly ConstrainedDimension[] = [
  'chain',
  'destinationContract',
  'nativeValue',
  'method',
  'recipient',
  'amount',
];

export type PolicySupport = 'SUPPORTED' | 'NOT_SUPPORTED';

export interface PathAssessment {
  readonly path: 'direct-erc20-transfer' | 'arc-memo-forwarded';
  readonly support: PolicySupport;
  /** Dimensions a documented Privy condition can actually deny. */
  readonly constrainable: readonly ConstrainedDimension[];
  /** Dimensions no documented condition reaches. Empty means fully covered. */
  readonly unconstrainable: readonly ConstrainedDimension[];
  readonly rationale: string;
}

/**
 * Direct ERC-20 `transfer(address,uint256)` from the execution wallet.
 *
 * Every dimension maps to a documented condition: `to` and `chain_id` and
 * `value` on `ethereum_transaction`, and the method plus its decoded `_to` and
 * `_value` arguments on `ethereum_calldata`.
 */
export const DIRECT_TRANSFER_ASSESSMENT: PathAssessment = {
  path: 'direct-erc20-transfer',
  support: 'SUPPORTED',
  constrainable: REQUIRED_DIMENSIONS,
  unconstrainable: [],
  rationale:
    'The wallet calls the USDC contract directly, so recipient and amount are ' +
    'top-level decoded arguments of the signed call and every dimension maps ' +
    'to a documented Privy condition.',
};

/**
 * Settlement forwarded through the Arc Memo contract
 * (`0x5294E9927c3306DcBaDb03fe70b92e01cCede505`).
 *
 * `ethereum_calldata` decodes the arguments of the function the wallet calls.
 * Here that is the Memo function; the USDC recipient and amount live in an
 * inner call the documented conditions do not decode. B01.3 permits SUPPORTED
 * only with deny fixtures for every wrong dimension, and recipient and amount
 * cannot be denied, so this path is NOT_SUPPORTED for settlement.
 */
export const MEMO_FORWARDED_ASSESSMENT: PathAssessment = {
  path: 'arc-memo-forwarded',
  support: 'NOT_SUPPORTED',
  constrainable: ['chain', 'destinationContract', 'nativeValue', 'method'],
  unconstrainable: ['recipient', 'amount'],
  rationale:
    'Privy decodes the arguments of the called function only. On the Memo ' +
    'path that is the Memo function, so the forwarded transfer recipient and ' +
    'amount are not reachable by any documented condition and cannot be denied.',
};

/**
 * Decide whether a path may carry settlement.
 *
 * Fails closed: a path is usable only when it leaves no dimension
 * unconstrained. There is no "mostly constrained" settlement path.
 */
export function isSettlementPathPermitted(assessment: PathAssessment): boolean {
  return assessment.support === 'SUPPORTED' && assessment.unconstrainable.length === 0;
}

/** The settlement path v1 uses, chosen by the B01.3 spike. */
export const SELECTED_SETTLEMENT_PATH = DIRECT_TRANSFER_ASSESSMENT;
