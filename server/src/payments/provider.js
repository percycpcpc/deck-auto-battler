import { createMockProvider } from './mock.js';
import { createStripeProvider } from './stripe.js';

export function isConfigured(env = {}) {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function getPaymentProvider(env = {}) {
  return isConfigured(env) ? createStripeProvider(env) : createMockProvider(env);
}
