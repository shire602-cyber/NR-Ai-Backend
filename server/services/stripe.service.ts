/**
 * Stripe Integration Service
 * ─────────────────────────────
 * Handles Stripe Connect OAuth, transaction fetching, and webhook processing.
 * Gracefully degrades when the `stripe` npm package is not installed.
 */

import { createLogger } from '../config/logger';

const log = createLogger('stripe');

// ─── Lazy Stripe SDK loading ───────────────────────────────
// stripe is an optional dependency — if not installed, all
// service methods return null or throw a clear config error.
let StripeConstructor: any = null;
try {
  StripeConstructor = (await import('stripe')).default;
} catch {
  log.warn('stripe npm package not installed — Stripe integration disabled');
}

const STRIPE_API_VERSION = '2024-12-18.acacia' as const;

function getStripeClient(): any | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !StripeConstructor) return null;
  return new StripeConstructor(key, { apiVersion: STRIPE_API_VERSION });
}

export const stripeService = {
  /** Whether the Stripe SDK is available at all. */
  isAvailable(): boolean {
    return StripeConstructor !== null;
  },

  /** Whether the platform-level keys are configured. */
  isConfigured(): boolean {
    return !!(
      StripeConstructor &&
      process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_CLIENT_ID
    );
  },

  /**
   * Generate a Stripe Connect OAuth URL so a merchant can connect their account.
   */
  getConnectUrl(companyId: string, redirectUri: string): string {
    const clientId = process.env.STRIPE_CLIENT_ID;
    if (!clientId) throw new Error('STRIPE_CLIENT_ID not configured');
    return `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${clientId}&scope=read_only&state=${companyId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  },

  /**
   * Exchange the OAuth authorization code for access/refresh tokens.
   */
  async handleOAuthCallback(
    code: string,
  ): Promise<{ stripe_user_id: string; access_token: string; refresh_token: string }> {
    const stripe = getStripeClient();
    if (!stripe) throw new Error('Stripe not configured');

    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    });

    return {
      stripe_user_id: response.stripe_user_id!,
      access_token: response.access_token!,
      refresh_token: response.refresh_token!,
    };
  },

  /**
   * Fetch recent transactions (charges, refunds, payouts) from a connected account.
   */
  async fetchTransactions(
    accessToken: string,
    since?: Date,
  ): Promise<StripeTransaction[]> {
    if (!StripeConstructor) throw new Error('Stripe SDK not installed');

    const stripe = new StripeConstructor(accessToken, {
      apiVersion: STRIPE_API_VERSION,
    });

    const params: any = { limit: 100 };
    if (since) params.created = { gte: Math.floor(since.getTime() / 1000) };

    // Safety cap to avoid unbounded fetches
    const MAX_RECORDS = 500;

    const transactions: StripeTransaction[] = [];

    // Auto-paginate charges
    const chargesList: any[] = [];
    for await (const charge of stripe.charges.list(params)) {
      chargesList.push(charge);
      if (chargesList.length >= MAX_RECORDS) break;
    }

    // Auto-paginate refunds
    const refundsList: any[] = [];
    for await (const refund of stripe.refunds.list(params)) {
      refundsList.push(refund);
      if (refundsList.length >= MAX_RECORDS) break;
    }

    // Auto-paginate payouts
    const payoutsList: any[] = [];
    for await (const payout of stripe.payouts.list(params)) {
      payoutsList.push(payout);
      if (payoutsList.length >= MAX_RECORDS) break;
    }

    for (const charge of chargesList) {
      transactions.push({
        externalId: charge.id,
        type: 'charge',
        amount: charge.amount / 100,
        currency: charge.currency.toUpperCase(),
        description:
          charge.description ||
          `Payment from ${charge.billing_details?.name || 'customer'}`,
        date: new Date(charge.created * 1000).toISOString(),
        status: charge.status,
        fees: (charge.application_fee_amount || 0) / 100,
        customerName: charge.billing_details?.name || null,
        customerEmail: charge.billing_details?.email || null,
        metadata: {
          customerId: charge.customer,
          receiptUrl: charge.receipt_url,
        },
      });
    }

    for (const refund of refundsList) {
      transactions.push({
        externalId: refund.id,
        type: 'refund',
        amount: -(refund.amount / 100),
        currency: refund.currency.toUpperCase(),
        description: `Refund: ${refund.reason || 'customer request'}`,
        date: new Date(refund.created * 1000).toISOString(),
        status: refund.status || 'succeeded',
        fees: 0,
        customerName: null,
        customerEmail: null,
        metadata: { chargeId: refund.charge },
      });
    }

    for (const payout of payoutsList) {
      transactions.push({
        externalId: payout.id,
        type: 'payout',
        amount: payout.amount / 100,
        currency: payout.currency.toUpperCase(),
        description: `Payout to bank: ${payout.description || 'settlement'}`,
        date: new Date(payout.created * 1000).toISOString(),
        status: payout.status,
        fees: 0,
        customerName: null,
        customerEmail: null,
        metadata: {},
      });
    }

    return transactions.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  },

  /**
   * Verify a Stripe webhook signature and return the parsed event.
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    webhookSecret: string,
  ): any | null {
    const stripe = getStripeClient();
    if (!stripe) return null;

    try {
      return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      log.warn({ err }, 'Webhook signature verification failed');
      return null;
    }
  },
};

// ─── Types ─────────────────────────────────────────────────

export interface StripeTransaction {
  externalId: string;
  type: 'charge' | 'refund' | 'payout';
  amount: number;
  currency: string;
  description: string;
  date: string;
  status: string;
  fees: number;
  customerName: string | null;
  customerEmail: string | null;
  metadata: Record<string, any>;
}
