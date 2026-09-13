/**
 * Circle Gateway requires at least seven days of authorization validity.
 * Keep a bounded approval buffer for a human wallet prompt before OneShot
 * forwards the signed authorization.
 */
export const CIRCLE_X402_USER_WALLET_VALIDITY_WINDOW_SECONDS = 605_800;
