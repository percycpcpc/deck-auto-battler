import { signStripePayload, verifyStripeSignature } from './stripe.js';

const MOCK_SECRET = 'mock-checkout-webhook-secret';
const encode = value => btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const decode = value => atob(value.replaceAll('-', '+').replaceAll('_', '/'));

export function createMockProvider() {
  return {
    isConfigured: () => false,

    async createCheckoutSession({ user, successUrl }) {
      const sessionId = `mock.${encode(user.id)}.${crypto.randomUUID()}`;
      const separator = successUrl.includes('?') ? '&' : '?';
      return { url: `${successUrl}${separator}mock_checkout=1&sessionId=${encodeURIComponent(sessionId)}`, sessionId };
    },

    async handleWebhook({ payload }) {
      const { sessionId } = JSON.parse(payload);
      const match = /^mock\.([A-Za-z0-9_-]+)\.[0-9a-f-]+$/i.exec(sessionId || '');
      if (!match) throw new Error('invalid mock checkout session');
      const eventPayload = JSON.stringify({
        id: `evt_${sessionId}`,
        type: 'checkout.session.completed',
        data: { object: { id: sessionId, client_reference_id: decode(match[1]) } },
      });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = `t=${timestamp},v1=${await signStripePayload(MOCK_SECRET, timestamp, eventPayload)}`;
      await verifyStripeSignature({ payload: eventPayload, signature, secret: MOCK_SECRET });
      const event = JSON.parse(eventPayload);
      return {
        type: event.type,
        userId: event.data.object.client_reference_id,
        sessionId: event.data.object.id,
      };
    },
  };
}
