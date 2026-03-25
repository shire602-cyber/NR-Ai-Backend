import { Router, type Express, type Request, type Response } from 'express';
import crypto from 'crypto';
import { storage } from '../storage';
import { db, pool } from '../db';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { insertInvoiceSchema, invoices as invoicesTable, invoiceLines as invoiceLinesTable, journalEntries, journalLines, inventoryMovements, products } from '../../shared/schema';
import { generateInvoicePDF } from '../services/pdf-invoice.service';
import { generateEInvoiceXML } from '../services/einvoice.service';
import { ACCOUNT_CODES } from '../lib/account-codes';
import { assertFiscalYearOpen } from '../lib/fiscal-year-guard';
import { createLogger } from '../config/logger';

const log = createLogger('invoices');

export function registerInvoiceRoutes(app: Express) {
  // =====================================
  // Invoice Routes
  // =====================================

  // Customer-only: Full bookkeeping invoices (clients use simplified portal)
  app.get("/api/companies/:companyId/invoices", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;

    // Verify company access
    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const invoices = await storage.getInvoicesByCompanyId(companyId);
    res.json(invoices);
  }));

  // Customer-only: Get single invoice
  app.get("/api/invoices/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const invoice = await storage.getInvoice(id);

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Verify company access
    const hasAccess = await storage.hasCompanyAccess(userId, invoice.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Fetch invoice lines
    const lines = await storage.getInvoiceLinesByInvoiceId(id);

    res.json({ ...invoice, lines });
  }));

  // Check for similar invoices
  // Customer-only: Check for similar invoices
  app.post("/api/companies/:companyId/invoices/check-similar", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;
    const { customerName, total, date } = req.body;

    // Check if user has access to this company
    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const invoices = await storage.getInvoicesByCompanyId(companyId);

    // Find similar invoices
    const similarInvoices = invoices.filter(invoice => {
      // Check if customer name is similar (case-insensitive partial match)
      const customerMatch = customerName && invoice.customerName &&
        ((invoice.customerName || '').toLowerCase().includes((customerName || '').toLowerCase()) ||
        (customerName || '').toLowerCase().includes((invoice.customerName || '').toLowerCase()));

      // Check if total is within 10% range (handle zero to avoid division by zero)
      const amountMatch = total != null && invoice.total != null && (
        total === 0 ? Number(invoice.total) === 0 : Math.abs(Number(invoice.total) - total) / total < 0.1
      );

      // Check if date is within 7 days
      let dateMatch = false;
      if (date && invoice.date) {
        const checkDate = new Date(date);
        const invoiceDate = new Date(invoice.date);
        const daysDiff = Math.abs((checkDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
        dateMatch = daysDiff <= 7;
      }

      // Return if at least 2 criteria match
      const matchCount = [customerMatch, amountMatch, dateMatch].filter(Boolean).length;
      return matchCount >= 2;
    });

    res.json({
      hasSimilar: similarInvoices.length > 0,
      similarInvoices: similarInvoices.slice(0, 5).map(invoice => ({
        id: invoice.id,
        number: invoice.number,
        customerName: invoice.customerName,
        total: invoice.total,
        date: invoice.date,
        status: invoice.status,
      })),
    });
  }));

  // Customer-only: Create invoices
  app.post("/api/companies/:companyId/invoices", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;
    const { lines, date, ...invoiceData } = req.body;

    // Check if user has access to this company
    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Validate lines array
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "Invoice must have at least one line item" });
    }

    // Calculate totals
    let subtotal = 0;
    let vatAmount = 0;

    for (const line of lines) {
      const lineTotal = line.quantity * line.unitPrice;
      subtotal += lineTotal;
      vatAmount += lineTotal * (line.vatRate || 0);
    }

    const total = subtotal + vatAmount;

    // Convert date string to Date object if it's a string
    const invoiceDate = typeof date === 'string' ? new Date(date) : date;

    // Fiscal year guard — block invoices into closed periods
    await assertFiscalYearOpen(companyId, new Date(req.body.date || new Date()));

    // Resolve accounts by code (not by fragile nameEn string matching)
    const accountsReceivable = await storage.getAccountByCode(companyId, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    const salesRevenue = await storage.getAccountByCode(companyId, ACCOUNT_CODES.PRODUCT_SALES);
    const vatPayable = await storage.getAccountByCode(companyId, ACCOUNT_CODES.VAT_PAYABLE_OUTPUT);

    if (!accountsReceivable || !salesRevenue) {
      return res.status(500).json({ message: `Required accounts not found in chart of accounts for company ${companyId}. Ensure Accounts Receivable (${ACCOUNT_CODES.ACCOUNTS_RECEIVABLE}) and Product Sales (${ACCOUNT_CODES.PRODUCT_SALES}) exist.` });
    }

    // Multi-currency support: determine exchange rate
    const invoiceCurrency = invoiceData.currency || 'AED';
    let exchangeRate = 1.0;
    if (invoiceCurrency !== 'AED') {
      exchangeRate = await storage.getLatestExchangeRate(companyId, 'AED', invoiceCurrency);
    }

    // Wrap invoice creation + journal entry in a single transaction
    const invoice = await (db as any).transaction(async (tx: any) => {
      // Create invoice
      const [inv] = await tx.insert(invoicesTable).values({
        ...invoiceData,
        date: invoiceDate,
        companyId,
        subtotal,
        vatAmount,
        total,
      }).returning();

      // Create invoice lines
      for (const line of lines) {
        await tx.insert(invoiceLinesTable).values({
          invoiceId: inv.id,
          ...line,
        });
      }

      // Generate entry number atomically via storage helper
      const entryNumber = await storage.generateEntryNumber(companyId, invoiceDate, tx);

      // Convert amounts to base currency (AED) for GL
      const baseTotal = invoiceCurrency !== 'AED' ? total * exchangeRate : total;
      const baseSubtotal = invoiceCurrency !== 'AED' ? subtotal * exchangeRate : subtotal;
      const baseVatAmount = invoiceCurrency !== 'AED' ? vatAmount * exchangeRate : vatAmount;

      // Create journal entry for revenue recognition
      const [entry] = await tx.insert(journalEntries).values({
        companyId: companyId,
        date: invoiceDate,
        memo: `Sales Invoice ${inv.number} - ${inv.customerName}`,
        entryNumber,
        status: 'draft',
        source: 'invoice',
        sourceId: inv.id,
        createdBy: userId,
        postedBy: null,
        postedAt: null,
        currency: invoiceCurrency,
        exchangeRate: String(exchangeRate),
      }).returning();

      // Debit: Accounts Receivable (total)
      await tx.insert(journalLines).values({
        entryId: entry.id,
        accountId: accountsReceivable.id,
        debit: baseTotal,
        credit: 0,
        description: `Invoice ${inv.number} - ${inv.customerName}`,
        ...(invoiceCurrency !== 'AED' ? { originalAmount: total, originalCurrency: invoiceCurrency } : {}),
      });

      // Credit: Sales Revenue (subtotal)
      await tx.insert(journalLines).values({
        entryId: entry.id,
        accountId: salesRevenue.id,
        debit: 0,
        credit: baseSubtotal,
        description: `Sales revenue - Invoice ${inv.number}`,
        ...(invoiceCurrency !== 'AED' ? { originalAmount: subtotal, originalCurrency: invoiceCurrency } : {}),
      });

      // Credit: VAT Payable (vat amount) - only if there's VAT
      if (vatAmount > 0 && vatPayable) {
        await tx.insert(journalLines).values({
          entryId: entry.id,
          accountId: vatPayable.id,
          debit: 0,
          credit: baseVatAmount,
          description: `VAT output - Invoice ${inv.number}`,
          ...(invoiceCurrency !== 'AED' ? { originalAmount: vatAmount, originalCurrency: invoiceCurrency } : {}),
        });
      }

      return inv;
    });

    // =========================================
    // COGS: Create journal entry for cost of goods sold (separate transaction)
    // Only for invoice lines that reference products
    // =========================================
    try {
      // Filter lines that have a productId
      const productLines = lines.filter((line: any) => line.productId);

      if (productLines.length > 0) {
        // Look up each product to get costPrice and calculate total COGS
        let totalCOGS = 0;
        const cogsDetails: { productId: string; quantity: number; costPrice: number; cogsAmount: number; productName: string }[] = [];

        for (const line of productLines) {
          const product = await storage.getProduct(line.productId);
          if (product && product.costPrice) {
            const costPrice = parseFloat(String(product.costPrice));
            const cogsAmount = Math.round(line.quantity * costPrice * 100) / 100;
            if (cogsAmount > 0) {
              totalCOGS += cogsAmount;
              cogsDetails.push({
                productId: product.id,
                quantity: line.quantity,
                costPrice,
                cogsAmount,
                productName: product.name,
              });
            }
          }
        }

        if (totalCOGS > 0) {
          totalCOGS = Math.round(totalCOGS * 100) / 100;

          // Resolve COGS and Inventory accounts
          const cogsAccount = await storage.getAccountByCode(companyId, ACCOUNT_CODES.COGS);
          const inventoryAccount = await storage.getAccountByCode(companyId, ACCOUNT_CODES.INVENTORY);

          if (cogsAccount && inventoryAccount) {
            // COGS journal entry + inventory movements in a separate Drizzle transaction
            await (db as any).transaction(async (tx: any) => {
              const cogsEntryNumber = await storage.generateEntryNumber(companyId, invoiceDate, tx);

              // Create COGS journal entry
              const [cogsEntry] = await tx.insert(journalEntries).values({
                companyId,
                date: invoiceDate,
                memo: `COGS - Invoice ${invoice.number}`,
                entryNumber: cogsEntryNumber,
                status: 'draft',
                source: 'cogs',
                sourceId: invoice.id,
                createdBy: userId,
                postedBy: null,
                postedAt: null,
              }).returning();

              // Debit: COGS
              await tx.insert(journalLines).values({
                entryId: cogsEntry.id,
                accountId: cogsAccount.id,
                debit: totalCOGS,
                credit: 0,
                description: `Cost of goods sold - Invoice ${invoice.number}`,
              });

              // Credit: Inventory
              await tx.insert(journalLines).values({
                entryId: cogsEntry.id,
                accountId: inventoryAccount.id,
                debit: 0,
                credit: totalCOGS,
                description: `Inventory reduction - Invoice ${invoice.number}`,
              });

              // Create inventory movements (type "sale") for each product line
              for (const detail of cogsDetails) {
                await tx.insert(inventoryMovements).values({
                  productId: detail.productId,
                  companyId,
                  type: 'sale',
                  quantity: -Math.abs(detail.quantity), // Negative for sales
                  unitCost: String(detail.costPrice),
                  reference: `Invoice ${invoice.number}`,
                  notes: `Auto-generated COGS for invoice ${invoice.number}`,
                  totalCost: String(detail.cogsAmount),
                });

                // Update product stock atomically to prevent race conditions
                await pool.query(
                  'UPDATE products SET current_stock = current_stock - $1 WHERE id = $2',
                  [Math.abs(detail.quantity), detail.productId]
                );
              }

              log.info({ invoiceId: invoice.id, cogsEntryId: cogsEntry.id, totalCOGS, productCount: cogsDetails.length }, 'COGS journal entry and inventory movements created');
            });
          } else {
            log.warn({ companyId }, 'COGS or Inventory accounts not found — skipping COGS journal entry');
          }
        }
      }
    } catch (cogsError: any) {
      // COGS is supplementary — if it fails, the invoice is still valid
      log.error({ invoiceId: invoice.id, error: cogsError.message }, 'Failed to create COGS journal entry (invoice still valid)');
    }

    res.json(invoice);
  }));

  // Post invoice journal entries
  // Customer-only: Post invoice to journal
  app.post("/api/invoices/:id/post", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Get invoice
    const invoice = await storage.getInvoice(id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Check access
    const hasAccess = await storage.hasCompanyAccess(userId, invoice.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get all draft entries for this invoice
    const entries = await storage.getJournalEntriesByCompanyId(invoice.companyId);
    const invoiceEntries = entries.filter(e => e.sourceId === id && e.status === 'draft');

    if (invoiceEntries.length === 0) {
      return res.status(400).json({ message: 'No draft entries to post' });
    }

    // Post all draft entries
    for (const entry of invoiceEntries) {
      await storage.updateJournalEntry(entry.id, {
        status: 'posted',
        postedBy: userId,
        postedAt: new Date(),
      });
    }

    res.json({ message: 'Invoice entries posted successfully', count: invoiceEntries.length });
  }));

  // Customer-only: Update invoice
  app.put("/api/invoices/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;
    const { lines, date, ...invoiceData } = req.body;

    // Get invoice to verify it exists and get company access
    const invoice = await storage.getInvoice(id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Check if user has access to this company
    const hasAccess = await storage.hasCompanyAccess(userId, invoice.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const allEntries = await storage.getJournalEntriesByCompanyId(invoice.companyId);
    const postedJE = allEntries.find((e: any) => e.sourceId === id && e.status === 'posted');
    if (postedJE) {
      return res.status(400).json({ error: 'Cannot update invoice with a posted journal entry. Reverse the journal entry first.' });
    }

    // Validate lines array
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "Invoice must have at least one line item" });
    }

    // Calculate totals
    let subtotal = 0;
    let vatAmount = 0;

    for (const line of lines) {
      const lineTotal = line.quantity * line.unitPrice;
      subtotal += lineTotal;
      vatAmount += lineTotal * (line.vatRate || 0);
    }

    const total = subtotal + vatAmount;

    // Convert date string to Date object if it's a string
    const invoiceDate = typeof date === 'string' ? new Date(date) : date;

    // Wrap update + delete old lines + insert new lines in a transaction
    const updatedInvoice = await (db as any).transaction(async (tx: any) => {
      // Update invoice
      const [inv] = await tx.update(invoicesTable)
        .set({
          ...invoiceData,
          date: invoiceDate,
          subtotal,
          vatAmount,
          total,
        })
        .where(eq(invoicesTable.id, id))
        .returning();

      // Delete existing lines
      await tx.delete(invoiceLinesTable).where(eq(invoiceLinesTable.invoiceId, id));

      // Insert new lines
      for (const line of lines) {
        await tx.insert(invoiceLinesTable).values({
          invoiceId: id,
          ...line,
        });
      }

      return inv;
    });

    res.json(updatedInvoice);
  }));

  // Customer-only: Delete invoice
  app.delete("/api/invoices/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Get invoice to verify it exists and get company access
    const invoice = await storage.getInvoice(id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Check if user has access to this company
    const hasAccess = await storage.hasCompanyAccess(userId, invoice.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Cannot delete a paid invoice.' });
    }
    const allEntries = await storage.getJournalEntriesByCompanyId(invoice.companyId);
    const postedJE = allEntries.find((e: any) => e.sourceId === id && e.status === 'posted');
    if (postedJE) {
      return res.status(400).json({ error: 'Cannot delete invoice with a posted journal entry. Reverse the journal entry first.' });
    }

    await storage.deleteInvoice(id);
    res.json({ message: 'Invoice deleted successfully' });
  }));

  // Customer-only: Update invoice status
  app.patch("/api/invoices/:id/status", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, paymentAccountId } = req.body;
    const userId = (req as any).user.id;

    // Validate status
    const validStatuses = ['draft', 'sent', 'paid', 'void'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be one of: draft, sent, paid, void' });
    }

    // Get invoice to verify it exists and get company access
    const invoice = await storage.getInvoice(id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Check if user has access to this company
    const hasAccess = await storage.hasCompanyAccess(userId, invoice.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const oldStatus = invoice.status;

    // Payment recording when invoice is marked as paid
    // Note: Revenue is already recognized when invoice is created
    // Validate payment fields BEFORE updating status
    if (status === 'paid' && oldStatus !== 'paid') {
      // Validate payment account is provided
      if (!paymentAccountId) {
        return res.status(400).json({ message: 'Payment account is required when marking invoice as paid' });
      }

      // Validate payment account belongs to company
      const paymentAccount = await storage.getAccount(paymentAccountId);
      if (!paymentAccount || paymentAccount.companyId !== invoice.companyId) {
        return res.status(400).json({ message: 'Invalid payment account' });
      }

      // Validate payment account is an asset account (cash/bank)
      if (paymentAccount.type !== 'asset') {
        return res.status(400).json({ message: 'Payment account must be a cash or bank account' });
      }

      const accountsReceivable = await storage.getAccountByCode(invoice.companyId, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
      if (!accountsReceivable) {
        return res.status(500).json({ message: `Accounts Receivable account (${ACCOUNT_CODES.ACCOUNTS_RECEIVABLE}) not found for company ${invoice.companyId}` });
      }

      // Ensure fiscal year is open before recording payment
      await assertFiscalYearOpen(invoice.companyId, new Date());

      // Update invoice status only after all validations pass
      const updatedInvoice = await storage.updateInvoiceStatus(id, status);

      // Wrap payment journal entry in transaction
      await (db as any).transaction(async (tx: any) => {
        const now = new Date();
        const entryNumber = await storage.generateEntryNumber(invoice.companyId, now, tx);

        const [entry] = await tx.insert(journalEntries).values({
          companyId: invoice.companyId,
          date: now,
          memo: `Payment received for Invoice ${invoice.number}`,
          entryNumber,
          status: 'draft',
          source: 'payment',
          sourceId: invoice.id,
          createdBy: userId,
          postedBy: null,
          postedAt: null,
        }).returning();

        // Debit: Selected payment account (total)
        await tx.insert(journalLines).values({
          entryId: entry.id,
          accountId: paymentAccountId,
          debit: invoice.total,
          credit: 0,
          description: `Payment received - Invoice ${invoice.number}`,
        });

        // Credit: Accounts Receivable (total)
        await tx.insert(journalLines).values({
          entryId: entry.id,
          accountId: accountsReceivable.id,
          debit: 0,
          credit: invoice.total,
          description: `Clear A/R - Invoice ${invoice.number}`,
        });

      });

      res.json(updatedInvoice);
    } else {
      // For non-paid status transitions, just update
      const updatedInvoice = await storage.updateInvoiceStatus(id, status);
      res.json(updatedInvoice);
    }
  }));

  // =====================================
  // E-Invoicing (PINT AE / UBL 2.1)
  // =====================================

  // Customer-only: Generate e-invoice XML for an invoice
  app.post("/api/invoices/:id/generate-einvoice", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const invoice = await storage.getInvoice(id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, invoice.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const lines = await storage.getInvoiceLinesByInvoiceId(id);
    const company = await storage.getCompany(invoice.companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    const customer = invoice.customerName
      ? { name: invoice.customerName, trn: invoice.customerTrn || undefined }
      : undefined;

    const { xml, uuid, hash } = generateEInvoiceXML(invoice, lines, company, customer);

    // Save e-invoice data to the invoice record
    await storage.updateInvoice(id, {
      einvoiceUuid: uuid,
      einvoiceXml: xml,
      einvoiceHash: hash,
      einvoiceStatus: 'generated',
    });

    res.json({ uuid, hash, status: 'generated' });
  }));

  // Customer-only: Get e-invoice XML for an invoice
  app.get("/api/invoices/:id/einvoice-xml", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const invoice = await storage.getInvoice(id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, invoice.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!invoice.einvoiceXml) {
      return res.status(404).json({ message: 'E-invoice has not been generated for this invoice' });
    }

    res.set('Content-Type', 'application/xml');
    res.set('Content-Disposition', `attachment; filename="einvoice-${invoice.number}.xml"`);
    res.send(invoice.einvoiceXml);
  }));

  // =====================================
  // Invoice Sharing & PDF
  // =====================================

  // Customer-only: Generate share link for invoice
  app.post("/api/invoices/:id/share", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const invoice = await storage.getInvoice(id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, invoice.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Generate a random token
    const token = crypto.randomBytes(16).toString('hex');
    // 90-day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    await storage.setInvoiceShareToken(id, token, expiresAt);

    res.json({
      shareUrl: `/view/invoice/${token}`,
      token,
    });
  }));

  // Customer-only: Download invoice as PDF
  app.get("/api/invoices/:id/pdf", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const invoice = await storage.getInvoice(id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, invoice.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const lines = await storage.getInvoiceLinesByInvoiceId(id);
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

  // Public: View invoice by share token (NO auth required)
  app.get("/api/public/invoices/:token", asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    const invoice = await storage.getInvoiceByShareToken(token);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found or link is invalid' });
    }

    // Check expiry
    if (invoice.shareTokenExpiresAt && new Date(invoice.shareTokenExpiresAt) < new Date()) {
      return res.status(410).json({ message: 'This invoice link has expired' });
    }

    const lines = await storage.getInvoiceLinesByInvoiceId(invoice.id);
    const company = await storage.getCompany(invoice.companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Return sanitized data (no internal IDs exposed except what's needed)
    res.json({
      invoice: {
        number: invoice.number,
        customerName: invoice.customerName,
        customerTrn: invoice.customerTrn,
        date: invoice.date,
        currency: invoice.currency,
        subtotal: invoice.subtotal,
        vatAmount: invoice.vatAmount,
        total: invoice.total,
        status: invoice.status,
      },
      lines: lines.map(l => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate,
        vatSupplyType: l.vatSupplyType,
      })),
      company: {
        name: company.name,
        trnVatNumber: company.trnVatNumber,
        businessAddress: company.businessAddress,
        contactPhone: company.contactPhone,
        contactEmail: company.contactEmail,
        websiteUrl: company.websiteUrl,
        logoUrl: company.logoUrl,
      },
    });
  }));

  // Public: Download PDF by share token (NO auth required)
  app.get("/api/public/invoices/:token/pdf", asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    const invoice = await storage.getInvoiceByShareToken(token);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found or link is invalid' });
    }

    if (invoice.shareTokenExpiresAt && new Date(invoice.shareTokenExpiresAt) < new Date()) {
      return res.status(410).json({ message: 'This invoice link has expired' });
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
