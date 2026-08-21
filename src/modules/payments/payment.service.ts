import type { AppEnvironment } from '../../config/env.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

export interface InitializePaymentInput {
  email: string;
  amountInKobo: number;
  reference: string;
}

export interface InitializePaymentResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/**
 * Initialize a Paystack transaction server-side.
 * Returns the checkout URL and reference to hand back to the client.
 */
export async function initializePayment(
  env: AppEnvironment,
  input: InitializePaymentInput,
): Promise<InitializePaymentResult> {
  const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountInKobo,
      reference: input.reference,
      channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
    }),
  });

  const body = (await response.json()) as { status: boolean; data: InitializePaymentResult };

  if (!response.ok || !body.status) {
    throw new Error(`Paystack initialization failed: ${JSON.stringify(body)}`);
  }

  return body.data;
}

/**
 * Verify a Paystack transaction server-side.
 * Returns true only when the transaction status is 'success'.
 */
export async function verifyPayment(
  env: AppEnvironment,
  reference: string,
): Promise<boolean> {
  const response = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      },
    },
  );

  if (!response.ok) return false;

  const body = (await response.json()) as { status: boolean; data: { status: string } };
  return body.status && body.data.status === 'success';
}
