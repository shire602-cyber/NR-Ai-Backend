import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { authMiddleware } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { generateInvoicePDF } from "../services/pdf-invoice.service";
import crypto from "crypto";
import type { CustomerContact, Invoice } from "../../shared/schema";

/**
 * Return true when the invoice belongs to the given customer contact.
 *
 * Three-tier check, strongest first:
 *   1. FK equality: invoice.contactId === contact.id. The real fix for
 *      the portal IDOR bug. New flows always populate contactId, so in
 *      steady state this is the only path that fires.
 *   2. TRN match: both sides carry a VAT registration number. Not
 *      vulnerable to name collisions.
 *   3. Name match (legacy fallback): trimmed, case-insensitive. Still
 *      used for invoices created before the contact_id column existed.
 *      Will stop being needed once old rows are backfilled.
 */
function invoiceBelongsToContact(inv: Invoice, contact: CustomerContact): boolean {
  if (inv.contactId && inv.contactId === contact.id) return true;

  const contactTrn = contact.trnNumber?.trim() || '';
  const invoiceTrn = inv.customerTrn?.trim() || '';
  if (contactTrn.length > 0 && invoiceTrn.length > 0) {
    return contactTrn === invoiceTrn;
  }
  const contactName = contact.name.trim().toLowerCase();
  const invoiceName = (inv.customerName || '').trim().toLowerCase();
  return contactName.length > 0 && contactName === invoiceName;
}

// Sliding expiry window on portal access. Was 365 days; reducing
// the blast radius of a leaked link to 90 days.
const PORTAL_TOKEN_TTL_DAYS = 90;

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

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + PORTAL_TOKEN_TTL_DAYS);

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

    // Find invoices matching this customer within the same company.
    // See invoiceBelongsToContact — prefers TRN match, falls back to name.
    const allInvoices = await storage.getInvoicesByCompanyId(contact.companyId);
    const customerInvoices = allInvoices.filter(inv => invoiceBelongsToContact(inv, contact));

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

    // Verify the invoice belongs to this customer and company.
    if (invoice.companyId !== contact.companyId || !invoiceBelongsToContact(invoice, contact)) {
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
}
