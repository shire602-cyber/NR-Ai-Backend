/**
 * Stripe Integration Routes
 * ─────────────────────────────
 * OAuth connect, transaction sync, webhook, and management endpoints
 * for the Stripe e-commerce integration.
 */

import type { Express, Request, Response } from 'express';
import { storage } from '../storage';
import { stripeService } from '../services/stripe.service';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { createLogger } from '../config/logger';

const log = createLogger('stripe-routes');

export function registerStripeRoutes(app: Express) {
  // =============================================
  // GET  /api/companies/:companyId/integrations/stripe/connect
  // Returns the Stripe OAuth connect URL
  // =============================================
  app.get(
    '/api/companies/:companyId/integrations/stripe/connect',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = req.user?.id;
      const { companyId } = req.params;

      const hasAccess = await storage.hasCompanyAccess(userId!, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (!stripeService.isConfigured()) {
        return res.status(503).json({
          message: 'Stripe integration is not configured on this server',
        });
      }

      // Build the redirect URI from the request origin
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const redirectUri = `${protocol}://${host}/api/integrations/stripe/callback`;

      const connectUrl = stripeService.getConnectUrl(companyId, redirectUri);
      res.json({ url: connectUrl });
    }),
  );

  // =============================================
  // GET  /api/integrations/stripe/callback
  // OAuth callback from Stripe — exchanges code for tokens
  // =============================================
  app.get(
    '/api/integrations/stripe/callback',
    asyncHandler(async (req: Request, res: Response) => {
      const { code, state: companyId, error, error_description } = req.query;

      if (error) {
        log.warn({ error, error_description }, 'Stripe OAuth error');
        return res.redirect(
          `/integrations?stripe_error=${encodeURIComponent(
            String(error_description || error),
          )}`,
        );
      }

      if (!code || !companyId) {
        return res.redirect('/integrations?stripe_error=missing_params');
      }

      try {
        const tokens = await stripeService.handleOAuthCallback(String(code));

        // Check if an integration already exists for this company
        const existing = await storage.getEcommerceIntegrations(
          String(companyId),
        );
        const stripeIntegration = existing.find(
          (i) => i.platform === 'stripe',
        );

        if (stripeIntegration) {
          // Update existing integration
          await storage.updateEcommerceIntegration(stripeIntegration.id, {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            apiKey: tokens.stripe_user_id,
            isActive: true,
            syncStatus: 'never',
            syncError: null,
          });
        } else {
          // Create new integration
          await storage.createEcommerceIntegration({
            companyId: String(companyId),
            platform: 'stripe',
            isActive: true,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            apiKey: tokens.stripe_user_id,
            syncStatus: 'never',
          });
        }

        log.info({ companyId }, 'Stripe integration connected');
        res.redirect('/integrations?stripe_connected=true');
      } catch (err) {
        log.error({ err }, 'Stripe OAuth callback failed');
        res.redirect('/integrations?stripe_error=oauth_failed');
      }
    }),
  );

  // =============================================
  // POST /api/companies/:companyId/integrations/stripe/sync
  // Fetch and import recent Stripe transactions
  // =============================================
  app.post(
    '/api/companies/:companyId/integrations/stripe/sync',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = req.user?.id;
      const { companyId } = req.params;

      const hasAccess = await storage.hasCompanyAccess(userId!, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Find the active Stripe integration
      const integrations = await storage.getEcommerceIntegrations(companyId);
      const integration = integrations.find(
        (i) => i.platform === 'stripe' && i.isActive,
      );
      if (!integration) {
        return res
          .status(404)
          .json({ message: 'No active Stripe integration found' });
      }

      if (!integration.accessToken) {
        return res
          .status(400)
          .json({ message: 'Stripe integration missing access token' });
      }

      // Mark as syncing
      await storage.updateEcommerceIntegration(integration.id, {
        syncStatus: 'syncing',
        syncError: null,
      });

      try {
        const since = integration.lastSyncAt || undefined;
        const transactions = await stripeService.fetchTransactions(
          integration.accessToken,
          since ? new Date(since) : undefined,
        );

        // Get existing transactions to skip duplicates
        const existingTxns = await storage.getEcommerceTransactions(companyId);
        const existingIds = new Set(existingTxns.map((t) => t.externalId));

        let imported = 0;
        let skipped = 0;

        for (const txn of transactions) {
          if (existingIds.has(txn.externalId)) {
            skipped++;
            continue;
          }

          await storage.createEcommerceTransaction({
            companyId,
            integrationId: integration.id,
            platform: 'stripe',
            externalId: txn.externalId,
            transactionType: txn.type === 'charge' ? 'payment' : txn.type,
            amount: String(txn.amount),
            currency: txn.currency,
            customerName: txn.customerName,
            customerEmail: txn.customerEmail,
            description: txn.description,
            status: txn.status,
            platformFees: txn.fees ? String(txn.fees) : null,
            netAmount: txn.fees
              ? String(txn.amount - txn.fees)
              : String(txn.amount),
            transactionDate: new Date(txn.date),
            metadata: JSON.stringify(txn.metadata),
            isReconciled: false,
          });
          imported++;
        }

        // Update integration sync status
        await storage.updateEcommerceIntegration(integration.id, {
          syncStatus: 'success',
          lastSyncAt: new Date(),
          syncError: null,
        });

        // Log the sync
        await storage.createIntegrationSync({
          companyId,
          integrationType: 'stripe',
          syncType: 'import',
          dataType: 'transactions',
          status: 'completed',
          recordCount: imported,
        });

        log.info(
          { companyId, imported, skipped },
          'Stripe sync completed',
        );

        res.json({
          message: 'Stripe sync completed',
          imported,
          skipped,
          total: transactions.length,
        });
      } catch (err) {
        log.error({ err, companyId }, 'Stripe sync failed');
        await storage.updateEcommerceIntegration(integration.id, {
          syncStatus: 'failed',
          syncError:
            err instanceof Error
              ? err.message
              : 'Unknown sync error',
        });
        return res.status(500).json({ message: 'Stripe sync failed' });
      }
    }),
  );

  // =============================================
  // GET  /api/companies/:companyId/integrations/stripe/transactions
  // List synced Stripe transactions
  // =============================================
  app.get(
    '/api/companies/:companyId/integrations/stripe/transactions',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = req.user?.id;
      const { companyId } = req.params;

      const hasAccess = await storage.hasCompanyAccess(userId!, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const allTransactions = await storage.getEcommerceTransactions(companyId);
      const stripeTransactions = allTransactions.filter(
        (t) => t.platform === 'stripe',
      );

      res.json(stripeTransactions);
    }),
  );

  // =============================================
  // DELETE /api/companies/:companyId/integrations/stripe/disconnect
  // Remove the Stripe integration (deletes tokens)
  // =============================================
  app.delete(
    '/api/companies/:companyId/integrations/stripe/disconnect',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = req.user?.id;
      const { companyId } = req.params;

      const hasAccess = await storage.hasCompanyAccess(userId!, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const integrations = await storage.getEcommerceIntegrations(companyId);
      const integration = integrations.find((i) => i.platform === 'stripe');

      if (!integration) {
        return res
          .status(404)
          .json({ message: 'No Stripe integration found' });
      }

      // Delete the integration (cascades to transactions via FK)
      await storage.deleteEcommerceIntegration(integration.id);

      log.info({ companyId }, 'Stripe integration disconnected');
      res.json({ message: 'Stripe integration disconnected' });
    }),
  );

  // =============================================
  // POST /api/companies/:companyId/integrations/stripe/webhook
  // Webhook endpoint for real-time Stripe events
  // No auth middleware — verified via Stripe signature
  // =============================================
  app.post(
    '/api/companies/:companyId/integrations/stripe/webhook',
    asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const signature = req.headers['stripe-signature'] as string;

      if (!signature) {
        return res.status(400).json({ message: 'Missing Stripe signature' });
      }

      // Find the integration to get the webhook secret
      const integrations = await storage.getEcommerceIntegrations(companyId);
      const integration = integrations.find(
        (i) => i.platform === 'stripe' && i.isActive,
      );

      if (!integration || !integration.webhookSecret) {
        return res
          .status(404)
          .json({ message: 'Stripe integration not found or no webhook secret configured' });
      }

      // Verify the webhook signature
      const event = stripeService.verifyWebhookSignature(
        req.body,
        signature,
        integration.webhookSecret,
      );

      if (!event) {
        return res.status(400).json({ message: 'Invalid webhook signature' });
      }

      log.info({ eventType: event.type, companyId }, 'Stripe webhook received');

      // Process relevant event types
      try {
        switch (event.type) {
          case 'charge.succeeded':
          case 'charge.failed':
          case 'charge.refunded': {
            const charge = event.data.object;
            await upsertTransactionFromWebhook(companyId, integration.id, {
              externalId: charge.id,
              type: charge.refunded ? 'refund' : 'payment',
              amount: charge.refunded
                ? -(charge.amount_refunded / 100)
                : charge.amount / 100,
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
            break;
          }

          case 'payout.paid':
          case 'payout.failed': {
            const payout = event.data.object;
            await upsertTransactionFromWebhook(companyId, integration.id, {
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
            break;
          }

          default:
            log.debug({ eventType: event.type }, 'Unhandled Stripe event type');
        }

        // Acknowledge receipt
        res.json({ received: true });
      } catch (err) {
        log.error({ err, eventType: event.type }, 'Webhook processing failed');
        // Still return 200 to prevent Stripe from retrying
        res.json({ received: true, error: 'Processing failed' });
      }
    }),
  );
}

// ─── Helpers ───────────────────────────────────────────────

/**
 * Create or update a transaction from a webhook event.
 * If a transaction with the same externalId exists, it is updated.
 */
async function upsertTransactionFromWebhook(
  companyId: string,
  integrationId: string,
  txn: {
    externalId: string;
    type: string;
    amount: number;
    currency: string;
    description: string;
    date: string;
    status: string;
    fees: number;
    customerName: string | null;
    customerEmail: string | null;
    metadata: Record<string, any>;
  },
) {
  // Check if transaction already exists
  const existingTxns = await storage.getEcommerceTransactions(companyId);
  const existing = existingTxns.find((t) => t.externalId === txn.externalId);

  if (existing) {
    await storage.updateEcommerceTransaction(existing.id, {
      status: txn.status,
      amount: String(txn.amount),
      description: txn.description,
      metadata: JSON.stringify(txn.metadata),
    });
  } else {
    await storage.createEcommerceTransaction({
      companyId,
      integrationId,
      platform: 'stripe',
      externalId: txn.externalId,
      transactionType: txn.type === 'charge' ? 'payment' : txn.type,
      amount: String(txn.amount),
      currency: txn.currency,
      customerName: txn.customerName,
      customerEmail: txn.customerEmail,
      description: txn.description,
      status: txn.status,
      platformFees: txn.fees ? String(txn.fees) : null,
      netAmount: txn.fees
        ? String(txn.amount - txn.fees)
        : String(txn.amount),
      transactionDate: new Date(txn.date),
      metadata: JSON.stringify(txn.metadata),
      isReconciled: false,
    });
  }
}
