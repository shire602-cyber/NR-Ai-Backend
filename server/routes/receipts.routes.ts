import { Router, type Express, type Request, type Response } from 'express';
import { storage } from '../storage';
import { z } from 'zod';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { insertInvoiceSchema } from '../../shared/schema';

export function registerReceiptRoutes(app: Express) {
  // =====================================
  // Receipt Routes
  // =====================================

  // Customer-only: Full receipts/expenses access
  app.get("/api/companies/:companyId/receipts", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;

    // Check if user has access to this company
    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const receipts = await storage.getReceiptsByCompanyId(companyId);
    res.json(receipts);
  }));

  // Check for similar transactions
  // Customer-only: Check for similar receipts/transactions
  app.post("/api/companies/:companyId/receipts/check-similar", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;
    const { merchant, amount, date } = req.body;

    // Check if user has access to this company
    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const receipts = await storage.getReceiptsByCompanyId(companyId);

    // Find similar transactions
    const merchantLower = typeof merchant === 'string' ? merchant.toLowerCase() : '';
    const amountNum = typeof amount === 'number' && Number.isFinite(amount) ? amount : NaN;
    const similarTransactions = receipts.filter(receipt => {
      // Merchant name similar (case-insensitive partial match) — guarded against undefined/empty
      const rcptMerchantLower = typeof receipt.merchant === 'string' ? receipt.merchant.toLowerCase() : '';
      const merchantMatch = !!merchantLower && !!rcptMerchantLower && (
        rcptMerchantLower.includes(merchantLower) || merchantLower.includes(rcptMerchantLower)
      );

      // Amount within 10% — guarded against NaN/zero
      const rcptAmountNum = typeof receipt.amount === 'number' && Number.isFinite(receipt.amount) ? receipt.amount : NaN;
      const amountMatch = Number.isFinite(amountNum) && Number.isFinite(rcptAmountNum) && amountNum !== 0
        && Math.abs(rcptAmountNum - amountNum) / Math.abs(amountNum) < 0.1;

      // Date within 7 days — guarded against invalid dates
      let dateMatch = false;
      if (date && receipt.date) {
        const checkDate = new Date(date);
        const receiptDate = new Date(receipt.date);
        if (!isNaN(checkDate.getTime()) && !isNaN(receiptDate.getTime())) {
          const daysDiff = Math.abs((checkDate.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24));
          dateMatch = daysDiff <= 7;
        }
      }

      const matchCount = [merchantMatch, amountMatch, dateMatch].filter(Boolean).length;
      return matchCount >= 2;
    });

    res.json({
      hasSimilar: similarTransactions.length > 0,
      similarTransactions: similarTransactions.slice(0, 5).map(receipt => ({
        id: receipt.id,
        merchant: receipt.merchant,
        amount: receipt.amount,
        date: receipt.date,
        category: receipt.category,
      })),
    });
  }));

  app.post("/api/companies/:companyId/receipts", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;

    // Check if user has access to this company
    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const receiptData = req.body;

    console.log('[Receipts] Creating receipt:', {
      companyId,
      userId,
      merchant: receiptData.merchant,
      amount: receiptData.amount,
      hasImageData: !!receiptData.imageData,
      imageDataLength: receiptData.imageData?.length
    });

    const receipt = await storage.createReceipt({
      ...receiptData,
      companyId, // Add companyId from URL params
      uploadedBy: userId,
    });

    console.log('[Receipts] Receipt created successfully:', receipt.id);
    res.json(receipt);
  }));

  // Customer-only: Update receipt
  app.put("/api/receipts/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Convert empty category string to null (UUID field cannot accept empty strings)
    if (req.body.category === '') {
      req.body.category = null;
    }

    const updatedReceipt = await storage.updateReceipt(id, req.body);
    console.log('[Receipts] Receipt updated successfully:', id);
    res.json(updatedReceipt);
  }));

  // Customer-only: Delete receipt
  app.delete("/api/receipts/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    await storage.deleteReceipt(id);
    res.json({ message: 'Receipt deleted successfully' });
  }));

  // Customer-only: Post receipt to journal entry
  app.post("/api/receipts/:id/post", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;
    const { accountId, paymentAccountId } = req.body;

    // Validate required fields
    if (!accountId || !paymentAccountId) {
      return res.status(400).json({ message: 'Expense account and payment account are required' });
    }

    // Get receipt
    const receipt = await storage.getReceipt(id);
    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found' });
    }

    // Check if already posted
    if (receipt.posted) {
      return res.status(400).json({ message: 'Receipt has already been posted' });
    }

    // Check if user has access to this company
    const hasAccess = await storage.hasCompanyAccess(userId, receipt.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Validate amount is present and positive
    const totalAmount = (receipt.amount || 0) + (receipt.vatAmount || 0);
    if (totalAmount <= 0) {
      return res.status(400).json({ message: 'Receipt amount must be greater than zero' });
    }

    // Get accounts to validate they exist and are correct types
    const expenseAccount = await storage.getAccount(accountId);
    const paymentAccount = await storage.getAccount(paymentAccountId);

    if (!expenseAccount || !paymentAccount) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // CRITICAL: Validate accounts belong to the same company as the receipt
    if (expenseAccount.companyId !== receipt.companyId) {
      return res.status(403).json({ message: 'Expense account must belong to the same company as the receipt' });
    }

    if (paymentAccount.companyId !== receipt.companyId) {
      return res.status(403).json({ message: 'Payment account must belong to the same company as the receipt' });
    }

    // Validate account types
    if (expenseAccount.type !== 'expense') {
      return res.status(400).json({ message: 'Selected account must be an expense account' });
    }

    if (paymentAccount.type !== 'asset') {
      return res.status(400).json({ message: 'Payment account must be a cash or bank account (asset)' });
    }

    // Parse date safely — fall back to today if the receipt date is missing
    // or unparseable (OCR can produce invalid strings).
    const parsedReceiptDate = receipt.date ? new Date(receipt.date) : new Date();
    const entryDate = isNaN(parsedReceiptDate.getTime()) ? new Date() : parsedReceiptDate;

    // Create entry + both journal lines atomically. If any step fails the whole
    // operation rolls back, so we never leave an entry without its balancing lines.
    const { entry } = await storage.createJournalEntryWithLines(
      {
        companyId: receipt.companyId,
        date: entryDate,
        memo: `Receipt: ${receipt.merchant || 'Expense'} - ${receipt.category || 'General'}`,
        status: 'posted',
        source: 'receipt',
        sourceId: receipt.id,
        createdBy: userId,
        postedBy: userId,
        postedAt: new Date(),
      } as any,
      [
        {
          accountId: expenseAccount.id,
          debit: totalAmount,
          credit: 0,
          description: `${receipt.merchant || 'Expense'} - ${receipt.category || 'General'}`,
        } as any,
        {
          accountId: paymentAccount.id,
          debit: 0,
          credit: totalAmount,
          description: `Payment for ${receipt.merchant || 'expense'}`,
        } as any,
      ],
    );

    // Update receipt with posting information
    const updatedReceipt = await storage.updateReceipt(id, {
      accountId,
      paymentAccountId,
      posted: true,
      journalEntryId: entry.id,
    });

    console.log('[Receipts] Receipt posted successfully:', id, 'Journal entry:', entry.id);
    res.json(updatedReceipt);
  }));
}
