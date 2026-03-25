import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { storage } from '../storage';
import { db } from '../db';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { generateEInvoiceXML } from '../services/einvoice.service';
import { aspEInvoiceService } from '../services/asp-einvoice.service';
import { einvoiceTransmissions } from '../../shared/schema';
import { createLogger } from '../config/logger';

const log = createLogger('einvoice-routes');

export function registerEInvoiceRoutes(app: Express) {
  // =====================================
  // E-Invoice ASP Transmission
  // =====================================

  /**
   * POST /api/companies/:companyId/invoices/:invoiceId/einvoice/submit
   * Generate UBL 2.1 XML, validate, submit to ASP, and record transmission.
   * If ASP is not configured the XML is still generated/validated for manual submission.
   */
  app.post(
    '/api/companies/:companyId/invoices/:invoiceId/einvoice/submit',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.id;
      const { companyId, invoiceId } = req.params;
      const { recipientId, recipientScheme } = req.body || {};

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.companyId !== companyId) {
        return res.status(404).json({ message: 'Invoice not found' });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }

      const lines = await storage.getInvoiceLinesByInvoiceId(invoiceId);
      if (lines.length === 0) {
        return res.status(400).json({ message: 'Invoice has no line items' });
      }

      // Generate UBL 2.1 XML
      const customer = invoice.customerName
        ? { name: invoice.customerName, trn: invoice.customerTrn || undefined }
        : undefined;

      const { xml, uuid: einvoiceUuid, hash } = generateEInvoiceXML(invoice, lines, company, customer);

      // Persist XML on the invoice record
      await storage.updateInvoice(invoiceId, {
        einvoiceUuid,
        einvoiceXml: xml,
        einvoiceHash: hash,
        einvoiceStatus: 'generated',
      });

      // Validate XML
      const validation = await aspEInvoiceService.validateXml(xml);

      const config = aspEInvoiceService.getConfig();

      if (!config) {
        // ASP not configured — return XML + validation for manual submission
        // Still record a transmission row for audit purposes
        await db.insert(einvoiceTransmissions).values({
          companyId,
          invoiceId,
          status: validation.valid ? 'pending' : 'failed',
          xmlHash: hash,
          errorMessage: validation.valid
            ? 'ASP not configured — XML generated and validated, ready for manual submission'
            : `Validation failed: ${validation.errors.join(', ')}`,
          createdBy: userId,
        });

        return res.json({
          submitted: false,
          aspConfigured: false,
          validation,
          xml,
          hash,
          uuid: einvoiceUuid,
          message: 'ASP not configured — XML generated and validated, ready for manual submission',
        });
      }

      if (!validation.valid) {
        await db.insert(einvoiceTransmissions).values({
          companyId,
          invoiceId,
          status: 'failed',
          aspProvider: config.provider,
          xmlHash: hash,
          errorMessage: `Validation failed: ${validation.errors.join(', ')}`,
          createdBy: userId,
        });

        return res.status(400).json({
          submitted: false,
          validation,
          message: `XML validation failed: ${validation.errors.join(', ')}`,
        });
      }

      // Submit to ASP
      const result = await aspEInvoiceService.submitInvoice({
        invoiceId,
        companyId,
        xml,
        recipientId,
        recipientScheme,
      });

      // Record transmission
      await db.insert(einvoiceTransmissions).values({
        companyId,
        invoiceId,
        transmissionId: result.transmissionId || null,
        status: result.status,
        aspProvider: config.provider,
        recipientId: result.recipientId || recipientId || null,
        xmlHash: hash,
        errorMessage: result.errorMessage || null,
        rawResponse: result.rawResponse ? JSON.stringify(result.rawResponse) : null,
        deliveredAt: result.status === 'delivered' ? new Date() : null,
        createdBy: userId,
      });

      // Update invoice e-invoice status
      await storage.updateInvoice(invoiceId, {
        einvoiceStatus: result.success ? 'submitted' : 'failed',
      });

      log.info({ invoiceId, transmissionId: result.transmissionId, status: result.status }, 'E-invoice submission recorded');

      res.json({
        submitted: result.success,
        aspConfigured: true,
        transmissionId: result.transmissionId,
        status: result.status,
        validation,
        hash,
        uuid: einvoiceUuid,
        ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
      });
    }),
  );

  /**
   * GET /api/companies/:companyId/invoices/:invoiceId/einvoice/status
   * Check latest transmission status for an invoice.
   * If ASP is configured, polls live status.
   */
  app.get(
    '/api/companies/:companyId/invoices/:invoiceId/einvoice/status',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.id;
      const { companyId, invoiceId } = req.params;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Fetch all transmissions for this invoice, newest first
      const transmissions = await db
        .select()
        .from(einvoiceTransmissions)
        .where(
          and(
            eq(einvoiceTransmissions.companyId, companyId),
            eq(einvoiceTransmissions.invoiceId, invoiceId),
          ),
        )
        .orderBy(desc(einvoiceTransmissions.submittedAt));

      if (transmissions.length === 0) {
        return res.json({ hasTransmissions: false, transmissions: [] });
      }

      const latest = transmissions[0];

      // If ASP is configured and the latest has a transmissionId, poll for live status
      if (latest.transmissionId && latest.status !== 'delivered' && latest.status !== 'failed') {
        const liveResult = await aspEInvoiceService.checkStatus(latest.transmissionId);
        if (liveResult.success && liveResult.status !== latest.status) {
          // Update the recorded status
          await db
            .update(einvoiceTransmissions)
            .set({
              status: liveResult.status,
              rawResponse: liveResult.rawResponse ? JSON.stringify(liveResult.rawResponse) : latest.rawResponse,
              ...(liveResult.status === 'delivered' ? { deliveredAt: new Date() } : {}),
            })
            .where(eq(einvoiceTransmissions.id, latest.id));

          latest.status = liveResult.status;
        }
      }

      res.json({
        hasTransmissions: true,
        latest: {
          id: latest.id,
          transmissionId: latest.transmissionId,
          status: latest.status,
          aspProvider: latest.aspProvider,
          recipientId: latest.recipientId,
          xmlHash: latest.xmlHash,
          errorMessage: latest.errorMessage,
          submittedAt: latest.submittedAt,
          deliveredAt: latest.deliveredAt,
        },
        transmissions: transmissions.map((t) => ({
          id: t.id,
          transmissionId: t.transmissionId,
          status: t.status,
          aspProvider: t.aspProvider,
          submittedAt: t.submittedAt,
          deliveredAt: t.deliveredAt,
          errorMessage: t.errorMessage,
        })),
      });
    }),
  );

  /**
   * GET /api/companies/:companyId/einvoice/transmissions
   * List all e-invoice transmissions for a company.
   * Supports ?status=sent&from=2026-01-01&to=2026-03-31 filters.
   */
  app.get(
    '/api/companies/:companyId/einvoice/transmissions',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.id;
      const { companyId } = req.params;
      const { status, from, to } = req.query;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const conditions = [eq(einvoiceTransmissions.companyId, companyId)];

      if (status && typeof status === 'string') {
        conditions.push(eq(einvoiceTransmissions.status, status));
      }
      if (from && typeof from === 'string') {
        conditions.push(gte(einvoiceTransmissions.submittedAt, new Date(from)));
      }
      if (to && typeof to === 'string') {
        conditions.push(lte(einvoiceTransmissions.submittedAt, new Date(to)));
      }

      const transmissions = await db
        .select()
        .from(einvoiceTransmissions)
        .where(and(...conditions))
        .orderBy(desc(einvoiceTransmissions.submittedAt));

      res.json(transmissions);
    }),
  );

  /**
   * POST /api/companies/:companyId/einvoice/validate
   * Validate an invoice's e-invoice XML without submitting to ASP.
   */
  app.post(
    '/api/companies/:companyId/einvoice/validate',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.id;
      const { companyId } = req.params;
      const { invoiceId } = req.body;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (!invoiceId) {
        return res.status(400).json({ message: 'invoiceId is required in request body' });
      }

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.companyId !== companyId) {
        return res.status(404).json({ message: 'Invoice not found' });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }

      const lines = await storage.getInvoiceLinesByInvoiceId(invoiceId);
      if (lines.length === 0) {
        return res.status(400).json({ message: 'Invoice has no line items' });
      }

      const customer = invoice.customerName
        ? { name: invoice.customerName, trn: invoice.customerTrn || undefined }
        : undefined;

      const { xml, hash } = generateEInvoiceXML(invoice, lines, company, customer);
      const validation = await aspEInvoiceService.validateXml(xml);

      res.json({
        invoiceId,
        valid: validation.valid,
        errors: validation.errors,
        hash,
      });
    }),
  );

  /**
   * GET /api/companies/:companyId/einvoice/readiness
   * E-invoicing readiness checklist for the company.
   */
  app.get(
    '/api/companies/:companyId/einvoice/readiness',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.id;
      const { companyId } = req.params;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }

      // Build checklist
      const checks = {
        hasTRN: {
          pass: !!(company.trnVatNumber && company.trnVatNumber.trim().length > 0),
          label: 'Company has TRN (Tax Registration Number)',
          detail: company.trnVatNumber || 'Not set',
        },
        hasAddress: {
          pass: !!(company.businessAddress && company.businessAddress.trim().length > 0),
          label: 'Company has business address',
          detail: company.businessAddress || 'Not set',
        },
        aspConfigured: {
          pass: aspEInvoiceService.getConfig() !== null,
          label: 'ASP (Accredited Service Provider) configured',
          detail: aspEInvoiceService.getConfig()
            ? `Provider: ${aspEInvoiceService.getConfig()!.provider}`
            : 'Not configured — set ASP_PROVIDER, ASP_API_URL, ASP_API_KEY env vars',
        },
        testInvoiceValidates: {
          pass: false,
          label: 'Test invoice passes XML validation',
          detail: 'Checking...',
        },
      };

      // Try to validate a test invoice if the company has any invoices
      try {
        const invoices = await storage.getInvoicesByCompanyId(companyId);
        if (invoices.length > 0) {
          const testInvoice = invoices[0];
          const lines = await storage.getInvoiceLinesByInvoiceId(testInvoice.id);
          if (lines.length > 0) {
            const customer = testInvoice.customerName
              ? { name: testInvoice.customerName, trn: testInvoice.customerTrn || undefined }
              : undefined;
            const { xml } = generateEInvoiceXML(testInvoice, lines, company, customer);
            const validation = await aspEInvoiceService.validateXml(xml);
            checks.testInvoiceValidates.pass = validation.valid;
            checks.testInvoiceValidates.detail = validation.valid
              ? 'Sample invoice XML passes all checks'
              : `Errors: ${validation.errors.join(', ')}`;
          } else {
            checks.testInvoiceValidates.detail = 'First invoice has no line items — skipped';
          }
        } else {
          checks.testInvoiceValidates.detail = 'No invoices found — create an invoice to test';
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        checks.testInvoiceValidates.detail = `Validation error: ${message}`;
      }

      const allPassed = Object.values(checks).every((c) => c.pass);

      res.json({
        ready: allPassed,
        checks,
      });
    }),
  );
}
