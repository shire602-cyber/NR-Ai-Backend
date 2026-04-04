import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { authMiddleware } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { generateInvoicePDF } from "../services/pdf-invoice.service";
import { createInvoicePaymentSession } from "../services/invoice-payment.service";
import { isStripeConfigured } from "../services/stripe.service";
import crypto from "crypto";

/**
 * Portal Public Routes
 * --------------------
 * Public endpoints for the client portal, accessible via portal access tokens.
 * No auth required for portal/:token routes — they use token-based access.
 */
export function registerPortalPublicRoutes(app: Express) {

  // =====================================
  // GENERATE PORTAL ACCESS (authenticated)
  // =====================================
  app.post("/api/portal/generate-access", authMiddleware, asyncHandler(async (req: Request, res: Response) => {
    const { contactId } = req.body;

    if (!contactId) {
      return res.status(400).json({ message: 'contactId is required' });
    }

    const contact = await storage.getCustomerContact(contactId);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Generate crypto-random token
    const token = crypto.randomBytes(32).toString('hex');

    // Set 1-year expiry
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await storage.setPortalAccessToken(contactId, token, expiresAt);

    res.json({
      portalUrl: `/portal/${token}`,
      token,
      expiresAt: expiresAt.toISOString(),
    });
  }));

  // =====================================
  // PORTAL INFO (public, no auth)
  // =====================================
  app.get("/api/portal/:token/info", asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    const contact = await storage.getCustomerContactByPortalToken(token);
    if (!contact) {
      return res.status(404).json({ message: 'Invalid or expired portal link' });
    }

    // Check expiry
    if (contact.portalAccessExpiresAt && new Date(contact.portalAccessExpiresAt) < new Date()) {
      return res.status(410).json({ message: 'This portal link has expired' });
    }

    // Get the company name for branding
    const company = await storage.getCompany(contact.companyId);

    res.json({
      customerName: contact.name,
      contactPerson: contact.contactPerson || null,
      companyName: company?.name || 'Najma Raeda Accounting',
      companyLogo: company?.logoUrl || null,
    });
  }));

  // =====================================
  // PORTAL INVOICES (public, no auth)
  // =====================================
  app.get("/api/portal/:token/invoices", asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    const contact = await storage.getCustomerContactByPortalToken(token);
    if (!contact) {
      return res.status(404).json({ message: 'Invalid or expired portal link' });
    }

    if (contact.portalAccessExpiresAt && new Date(contact.portalAccessExpiresAt) < new Date()) {
      return res.status(410).json({ message: 'This portal link has expired' });
    }

    // Find invoices matching this customer's name within the same company
    const allInvoices = await storage.getInvoicesByCompanyId(contact.companyId);
    const customerInvoices = allInvoices.filter(
      inv => inv.customerName.toLowerCase() === contact.name.toLowerCase()
    );

    // Return sanitized invoice data (no internal company details)
    const sanitizedInvoices = customerInvoices.map(inv => ({
      id: inv.id,
      number: inv.number,
      date: inv.date,
      currency: inv.currency,
      subtotal: inv.subtotal,
      vatAmount: inv.vatAmount,
      total: inv.total,
      status: inv.status,
    }));

    res.json(sanitizedInvoices);
  }));

  // =====================================
  // PORTAL INVOICE PDF (public, no auth)
  // =====================================
  app.get("/api/portal/:token/invoices/:invoiceId/pdf", asyncHandler(async (req: Request, res: Response) => {
    const { token, invoiceId } = req.params;

    const contact = await storage.getCustomerContactByPortalToken(token);
    if (!contact) {
      return res.status(404).json({ message: 'Invalid or expired portal link' });
    }

    if (contact.portalAccessExpiresAt && new Date(contact.portalAccessExpiresAt) < new Date()) {
      return res.status(410).json({ message: 'This portal link has expired' });
    }

    // Get the invoice
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Verify the invoice belongs to this customer and company
    if (invoice.companyId !== contact.companyId || invoice.customerName.toLowerCase() !== contact.name.toLowerCase()) {
      return res.status(403).json({ message: 'Access denied to this invoice' });
    }

    const lines = await storage.getInvoiceLinesByInvoiceId(invoice.id);
    const company = await storage.getCompany(invoice.companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    const pdfBuffer = await generateInvoicePDF(invoice, lines, company);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${invoice.number}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.send(pdfBuffer);
  }));

  // Public: Pay invoice via Stripe (no auth — accessed from public invoice view)
  app.post("/api/public/invoice/:token/pay", asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    if (!isStripeConfigured()) {
      return res.status(503).json({ message: "Online payment is not currently available" });
    }

    // Find invoice by share token
    const invoice = await storage.getInvoiceByShareToken(token);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (invoice.status === "paid") {
      return res.status(400).json({ message: "Invoice already paid" });
    }

    const origin = req.headers.origin || req.headers.referer || "http://localhost:5000";
    const returnUrl = `${origin}/view/invoice/${token}`;

    const result = await createInvoicePaymentSession(invoice.id, returnUrl);
    if (!result) {
      return res.status(500).json({ message: "Failed to create payment session" });
    }

    res.json({ url: result.sessionUrl });
  }));
}
