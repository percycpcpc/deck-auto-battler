const STRIPE_CHECKOUT_URL = 'https://api.stripe.com/v1/checkout/sessions';
const SIGNATURE_TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

const bytesToHex = bytes => [...new Uint8Array(bytes)]
  .map(byte => byte.toString(16).padStart(2, '0'))
  .join('');

const constantTimeEqual = (left, right) => {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
};

export async function signStripePayload(secret, timestamp, payload) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return bytesToHex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`)));
}

export async function verifyStripeSignature({ payload, signature, secret, now = Date.now() }) {
  if (!secret || !signature) throw new Error('invalid webhook signature');
  const parts = signature.split(',').map(part => part.trim().split('='));
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const candidates = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!Number.isFinite(timestamp) || candidates.length === 0) throw new Error('invalid webhook signature');
  if (Math.abs(Math.floor(now / 1000) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error('expired webhook signature');
  }
  const expected = await signStripePayload(secret, timestamp, payload);
  if (!candidates.some(candidate => constantTimeEqual(candidate, expected))) {
    throw new Error('invalid webhook signature');
  }
  return true;
}

export function createStripeProvider(env) {
  return {
    isConfigured: () => Boolean(env.STRIPE_SECRET_KEY),

    async createCheckoutSession({ user, successUrl, cancelUrl }) {
      if (!env.STRIPE_PRICE_ID) throw new Error('Stripe price is not configured');
      const body = new URLSearchParams({
        mode: 'payment',
        'line_items[0][price]': env.STRIPE_PRICE_ID,
        'line_items[0][quantity]': '1',
        client_reference_id: user.id,
        'metadata[user_id]': user.id,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      const response = await fetch(STRIPE_CHECKOUT_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      const result = await response.json();
      if (!response.ok || !result.url || !result.id) {
        throw new Error(result?.error?.message || 'Stripe checkout creation failed');
      }
      return { url: result.url, sessionId: result.id };
    },

    async handleWebhook({ payload, signature }) {
      await verifyStripeSignature({
        payload, signature, secret: env.STRIPE_WEBHOOK_SECRET,
      });
      const event = JSON.parse(payload);
      if (event.type !== 'checkout.session.completed') return { type: event.type };
      const session = event.data?.object || {};
      const userId = session.metadata?.user_id || session.client_reference_id;
      if (!userId) throw new Error('completed checkout missing user id');
      return { type: event.type, userId, sessionId: session.id };
    },
  };
}
