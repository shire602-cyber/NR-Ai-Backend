import { type Express, type Request, type Response } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import {
  creditNotes as creditNotesTable,
  creditNoteLines as creditNoteLinesTable,
  journalEntries,
  journalLines,
  invoices as invoicesTable
} from '../../shared/schema';
import { ACCOUNT_CODES } from '../lib/account-codes';
import { assertFiscalYearOpen } from '../lib/fiscal-year-guard';

export function registerCreditNoteRoutes(app: Express) {
  // =====================================
  // Credit Note Routes
  // =====================================

  // 1. List all credit notes for a company
  app.get("/api/companies/:companyId/credit-notes", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const creditNotes = await storage.getCreditNotesByCompanyId(companyId);
    res.json(creditNotes);
  }));

  // 2. Get single credit note with lines
  app.get("/api/companies/:companyId/credit-notes/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const creditNote = await storage.getCreditNote(id);
    if (!creditNote || creditNote.companyId !== companyId) {
      return res.status(404).json({ message: 'Credit note not found' });
    }

    const lines = await storage.getCreditNoteLinesByCreditNoteId(id);
    res.json({ ...creditNote, lines });
  }));

  // 3. Create a credit note (draft status)
  app.post("/api/companies/:companyId/credit-notes", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;
    const { lines, date, ...noteData } = req.body;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: 'At least one line item is required' });
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
    const noteDate = typeof date === 'string' ? new Date(date) : date;

    // Generate credit note number
    const existing = await storage.getCreditNotesByCompanyId(companyId);
    const number = noteData.number || `CN-${String(existing.length + 1).padStart(4, '0')}`;

    const creditNote = await (db as any).transaction(async (tx: any) => {
      // Create credit note
      const [cn] = await tx.insert(creditNotesTable).values({
        ...noteData,
        number,
        date: noteDate,
        companyId,
        subtotal,
        vatAmount,
        total,
        status: 'draft',
        createdBy: userId,
      }).returning();

      // Create credit note lines
      for (const line of lines) {
        await tx.insert(creditNoteLinesTable).values({
          creditNoteId: cn.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate ?? 0.05,
          vatSupplyType: line.vatSupplyType || 'standard_rated',
        });
      }

      return cn;
    });

    res.json(creditNote);
  }));

  // 4. Update a draft credit note
  app.put("/api/companies/:companyId/credit-notes/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user.id;
    const { lines, date, ...noteData } = req.body;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const existing = await storage.getCreditNote(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ message: 'Credit note not found' });
    }

    if (existing.status !== 'draft') {
      return res.status(400).json({ message: 'Can only update draft credit notes' });
    }

    // Recalculate totals if lines provided
    let subtotal = Number(existing.subtotal);
    let vatAmount = Number(existing.vatAmount);
    let total = Number(existing.total);

    if (lines && Array.isArray(lines) && lines.length > 0) {
      subtotal = 0;
      vatAmount = 0;
      for (const line of lines) {
        const lineTotal = line.quantity * line.unitPrice;
        subtotal += lineTotal;
        vatAmount += lineTotal * (line.vatRate || 0);
      }
      total = subtotal + vatAmount;
    }

    const noteDate = date ? (typeof date === 'string' ? new Date(date) : date) : undefined;

    const updatedCreditNote = await (db as any).transaction(async (tx: any) => {
      // Update credit note
      const [cn] = await tx.update(creditNotesTable)
        .set({
          ...noteData,
          ...(noteDate && { date: noteDate }),
          subtotal,
          vatAmount,
          total,
        })
        .where(eq(creditNotesTable.id, id))
        .returning();

      // Replace lines if provided
      if (lines && Array.isArray(lines) && lines.length > 0) {
        await tx.delete(creditNoteLinesTable).where(eq(creditNoteLinesTable.creditNoteId, id));
        for (const line of lines) {
          await tx.insert(creditNoteLinesTable).values({
            creditNoteId: cn.id,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            vatRate: line.vatRate ?? 0.05,
            vatSupplyType: line.vatSupplyType || 'standard_rated',
          });
        }
      }

      return cn;
    });

    res.json(updatedCreditNote);
  }));

  // 5. Post a credit note — creates the REVERSING journal entry
  app.post("/api/companies/:companyId/credit-notes/:id/post", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const creditNote = await storage.getCreditNote(id);
    if (!creditNote || creditNote.companyId !== companyId) {
      return res.status(404).json({ message: 'Credit note not found' });
    }

    if (creditNote.status !== 'draft') {
      return res.status(400).json({ message: 'Credit note is already posted or void' });
    }

    // Check fiscal year is open for the credit note date
    await assertFiscalYearOpen(companyId, creditNote.date);

    // Resolve accounts
    const accountsReceivable = await storage.getAccountByCode(companyId, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    const salesRevenue = await storage.getAccountByCode(companyId, ACCOUNT_CODES.PRODUCT_SALES);
    const vatPayable = await storage.getAccountByCode(companyId, ACCOUNT_CODES.VAT_PAYABLE_OUTPUT);

    if (!accountsReceivable || !salesRevenue) {
      return res.status(500).json({
        message: `Required accounts not found in chart of accounts for company ${companyId}. Ensure Accounts Receivable (${ACCOUNT_CODES.ACCOUNTS_RECEIVABLE}) and Product Sales (${ACCOUNT_CODES.PRODUCT_SALES}) exist.`
      });
    }

    const subtotal = Number(creditNote.subtotal);
    const vatAmount = Number(creditNote.vatAmount);
    const total = Number(creditNote.total);

    const posted = await (db as any).transaction(async (tx: any) => {
      // Generate entry number
      const entryNumber = await storage.generateEntryNumber(companyId, creditNote.date, tx);

      // Create journal entry (reversing — opposite of invoice)
      const [entry] = await tx.insert(journalEntries).values({
        companyId,
        date: creditNote.date,
        memo: `Credit Note ${creditNote.number} - ${creditNote.customerName}`,
        entryNumber,
        status: 'draft',
        source: 'credit_note',
        sourceId: creditNote.id,
        createdBy: userId,
        postedBy: null,
        postedAt: null,
      }).returning();

      // Credit: Accounts Receivable (total) — REVERSED from invoice
      await tx.insert(journalLines).values({
        entryId: entry.id,
        accountId: accountsReceivable.id,
        debit: 0,
        credit: total,
        description: `Credit Note ${creditNote.number} - ${creditNote.customerName}`,
      });

      // Debit: Product Sales (subtotal) — REVERSED from invoice
      await tx.insert(journalLines).values({
        entryId: entry.id,
        accountId: salesRevenue.id,
        debit: subtotal,
        credit: 0,
        description: `Sales reversal - Credit Note ${creditNote.number}`,
      });

      // Debit: VAT Payable (vatAmount) — REVERSED from invoice (if > 0)
      if (vatAmount > 0 && vatPayable) {
        await tx.insert(journalLines).values({
          entryId: entry.id,
          accountId: vatPayable.id,
          debit: vatAmount,
          credit: 0,
          description: `VAT reversal - Credit Note ${creditNote.number}`,
        });
      }

      // Update credit note status
      const [cn] = await tx.update(creditNotesTable)
        .set({
          status: 'posted',
          journalEntryId: entry.id,
        })
        .where(eq(creditNotesTable.id, id))
        .returning();

      return cn;
    });

    res.json(posted);
  }));

  // 6. Apply a posted credit note against an invoice
  app.post("/api/companies/:companyId/credit-notes/:id/apply", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user.id;
    const { invoiceId } = req.body;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!invoiceId) {
      return res.status(400).json({ message: 'invoiceId is required' });
    }

    const creditNote = await storage.getCreditNote(id);
    if (!creditNote || creditNote.companyId !== companyId) {
      return res.status(404).json({ message: 'Credit note not found' });
    }

    if (creditNote.status !== 'posted') {
      return res.status(400).json({ message: 'Credit note must be posted before it can be applied' });
    }

    if (creditNote.appliedToInvoiceId) {
      return res.status(400).json({ message: 'Credit note has already been applied' });
    }

    // Validate the target invoice
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice || invoice.companyId !== companyId) {
      return res.status(404).json({ message: 'Target invoice not found' });
    }

    const creditTotal = Number(creditNote.total);
    const invoiceTotal = Number(invoice.total);

    // Apply the credit note amount (capped at invoice total)
    const appliedAmount = Math.min(creditTotal, invoiceTotal);
    const fullyPaid = appliedAmount >= invoiceTotal;

    await (db as any).transaction(async (tx: any) => {
      // Update credit note with application details
      await tx.update(creditNotesTable)
        .set({
          appliedToInvoiceId: invoiceId,
          appliedAmount: String(appliedAmount),
        })
        .where(eq(creditNotesTable.id, id));

      // If credit note fully covers invoice, mark as paid
      if (fullyPaid) {
        await tx.update(invoicesTable)
          .set({ status: 'paid' })
          .where(eq(invoicesTable.id, invoiceId));
      }
    });

    const updated = await storage.getCreditNote(id);
    res.json(updated);
  }));

  // 7. Void a credit note
  app.post("/api/companies/:companyId/credit-notes/:id/void", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const creditNote = await storage.getCreditNote(id);
    if (!creditNote || creditNote.companyId !== companyId) {
      return res.status(404).json({ message: 'Credit note not found' });
    }

    if (creditNote.status === 'void') {
      return res.status(400).json({ message: 'Credit note is already void' });
    }

    await (db as any).transaction(async (tx: any) => {
      // If the credit note has a journal entry, void it too
      if (creditNote.journalEntryId) {
        await tx.update(journalEntries)
          .set({ status: 'void' })
          .where(eq(journalEntries.id, creditNote.journalEntryId));
      }

      // Void the credit note
      await tx.update(creditNotesTable)
        .set({ status: 'void' })
        .where(eq(creditNotesTable.id, id));
    });

    const voided = await storage.getCreditNote(id);
    res.json(voided);
  }));
}
