import type { DeliveryState, IntentState } from '@oneshot/contracts';

export interface StatusCopy {
  readonly label: string;
  readonly tone: 'success' | 'pending' | 'warning' | 'danger' | 'neutral';
  readonly description: string;
}

const PAYMENT_STATUS: Readonly<Record<IntentState, StatusCopy>> = {
  AUTHORIZING: {
    label: 'Authorizing payment',
    tone: 'pending',
    description: 'The wallet policy is checking this request before payment can start.',
  },
  READY: {
    label: 'Ready to pay',
    tone: 'pending',
    description: 'The request is approved and waiting for the payment worker.',
  },
  SUBMITTING: {
    label: 'Payment in progress',
    tone: 'pending',
    description: 'OneShot is sending the approved payment and checking the Arc result.',
  },
  COMMITTED: {
    label: 'Paid and confirmed',
    tone: 'success',
    description: 'The payment is confirmed and can be reused for result delivery.',
  },
  FAILED_SAFE: {
    label: 'Stopped safely',
    tone: 'neutral',
    description: 'The request closed without a committed payment.',
  },
  UNKNOWN: {
    label: 'Checking payment',
    tone: 'warning',
    description: 'The outcome is being verified. Do not submit this request again.',
  },
  REJECTED: {
    label: 'Not approved',
    tone: 'danger',
    description: 'The request was stopped before a payment was submitted.',
  },
};

const DELIVERY_STATUS: Readonly<Record<DeliveryState, StatusCopy>> = {
  NOT_REQUESTED: {
    label: 'Result not requested',
    tone: 'neutral',
    description: 'The supplier result has not been requested yet.',
  },
  PENDING: {
    label: 'Retrieving result',
    tone: 'pending',
    description: 'The original supplier request is being resumed.',
  },
  AVAILABLE: {
    label: 'Result ready',
    tone: 'success',
    description: 'The paid API result is available.',
  },
  RETRIEVAL_FAILED: {
    label: 'Result needs attention',
    tone: 'warning',
    description: 'Payment is kept; the supplier result needs another read-only retrieval.',
  },
};

export function paymentStatusCopy(state: IntentState): StatusCopy {
  return PAYMENT_STATUS[state];
}

export function deliveryStatusCopy(state: DeliveryState): StatusCopy {
  return DELIVERY_STATUS[state];
}

export function serviceLabel(toolId: string): string {
  switch (toolId) {
    case 'circle-x402-api-v1':
      return 'OneShot x402 Dataset';
    case 'team-report-v1':
      return 'Direct Arc payment';
    default:
      return 'Paid API service';
  }
}

export function networkLabel(network: string): string {
  return network === 'eip155:5042002' ? 'Arc Testnet' : network;
}

export function maskIdentifier(value: string, visible = 6): string {
  if (value.length <= visible) return value;
  const head = Math.ceil(visible / 2);
  const tail = Math.floor(visible / 2);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function maskAddress(value: string): string {
  return maskIdentifier(value, 5);
}
