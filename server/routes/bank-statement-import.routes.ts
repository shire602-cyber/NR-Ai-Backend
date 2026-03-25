/**
 * Bank Statement Import Routes
 * ─────────────────────────────
 * Endpoints for parsing and importing bank statements (CSV, OFX).
 * Supports UAE banks: Emirates NBD, ADCB, FAB, Mashreq, RAKBANK.
 */

import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { storage } from '../storage';
import {
  parseCSV,
  parseOFX,
  detectBankFormat,
  type ParsedTransaction,
} from '../services/bank-statement-parser.service';
import { autoReconcileTransactions } from '../services/auto-reconcile.service';
import { createLogger } from '../config/logger';

const log = createLogger('bank-statement-import');

// Maximum content size: ~10 MB of text
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;

export function registerBankStatementImportRoutes(app: Express) {

  // =====================================
  // 1. POST /api/companies/:companyId/bank-statements/parse
  //    Parse a bank statement file for preview (does NOT import)
  // =====================================
  app.post(
    '/api/companies/:companyId/bank-statements/parse',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = req.user!.id;

      // Access check
      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Accept raw text content from the request body
      const { content, filename, dateFormat, delimiter, bankPreset } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({
          message: 'Missing or invalid "content" field. Send the file content as a string.',
        });
      }

      if (content.length > MAX_CONTENT_LENGTH) {
        return res.status(400).json({
          message: 'File content exceeds the 10 MB limit.',
        });
      }

      // Detect format
      const detected = detectBankFormat(content);
      const format = detected.format;
      const resolvedPreset = bankPreset || detected.bankPreset || 'generic';
      const resolvedDelimiter = delimiter || detected.delimiter;

      // Parse transactions
      let transactions: ParsedTransaction[];
      try {
        if (format === 'ofx') {
          transactions = parseOFX(content);
        } else {
          transactions = parseCSV(content, {
            dateFormat,
            delimiter: resolvedDelimiter,
            bankPreset: resolvedPreset,
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Parse error';
        log.error({ err, companyId }, 'Bank statement parse failed');
        return res.status(400).json({
          message: `Failed to parse bank statement: ${message}`,
        });
      }

      if (transactions.length === 0) {
        return res.status(400).json({
          message: 'No transactions found in the file. Ensure it contains a valid header row and transaction data.',
        });
      }

      // Detect duplicates against existing bank_transactions
      const existing = await storage.getBankTransactionsByCompanyId(companyId);
      const existingSet = new Set(
        existing.map(t => duplicateKey(t.transactionDate, Number(t.amount), t.description))
      );

      let duplicateCount = 0;
      for (const txn of transactions) {
        const key = duplicateKey(new Date(txn.date), txn.amount, txn.description);
        if (existingSet.has(key)) {
          duplicateCount++;
        }
      }

      // Compute date range
      const dates = transactions.map(t => t.date).sort();
      const dateRange = {
        from: dates[0],
        to: dates[dates.length - 1],
      };

      log.info(
        { companyId, format, preset: resolvedPreset, count: transactions.length, duplicateCount },
        'Bank statement parsed'
      );

      res.json({
        format,
        bankPreset: resolvedPreset,
        transactionCount: transactions.length,
        dateRange,
        transactions,
        duplicateCount,
      });
    })
  );

  // =====================================
  // 2. POST /api/companies/:companyId/bank-statements/import
  //    Import parsed transactions into bank_transactions table
  // =====================================
  app.post(
    '/api/companies/:companyId/bank-statements/import',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = req.user!.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Validate request body
      const bodySchema = z.object({
        bankAccountId: z.string().uuid('Invalid bank account ID'),
        transactions: z.array(z.object({
          date: z.string(),
          description: z.string(),
          amount: z.number(),
          reference: z.string().optional(),
          balance: z.number().optional(),
          rawData: z.record(z.string()).optional(),
        })).min(1, 'At least one transaction is required'),
        skipDuplicates: z.boolean().optional().default(true),
      });

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: 'Invalid request body',
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const { bankAccountId, transactions, skipDuplicates } = parsed.data;

      // Verify the bank account exists and belongs to this company
      const account = await storage.getAccount(bankAccountId);
      if (!account || account.companyId !== companyId) {
        return res.status(404).json({ message: 'Bank account not found for this company' });
      }

      // Build duplicate set from existing transactions
      const existing = await storage.getBankTransactionsByCompanyId(companyId);
      const existingSet = new Set(
        existing.map(t => duplicateKey(t.transactionDate, Number(t.amount), t.description))
      );

      let imported = 0;
      let skipped = 0;
      let duplicates = 0;

      for (const txn of transactions) {
        const key = duplicateKey(new Date(txn.date), txn.amount, txn.description);
        const isDuplicate = existingSet.has(key);

        if (isDuplicate) {
          duplicates++;
          if (skipDuplicates) {
            skipped++;
            continue;
          }
        }

        await storage.createBankTransaction({
          companyId,
          bankAccountId,
          transactionDate: new Date(txn.date),
          description: txn.description,
          amount: String(txn.amount),
          reference: txn.reference || null,
          importSource: 'csv',
          isReconciled: false,
        });

        // Add to the set so within-batch duplicates are also caught
        existingSet.add(key);
        imported++;
      }

      log.info(
        { companyId, bankAccountId, imported, skipped, duplicates, total: transactions.length },
        'Bank statement imported'
      );

      res.json({
        imported,
        skipped,
        duplicates,
        total: transactions.length,
      });
    })
  );

  // =====================================
  // 3. POST /api/companies/:companyId/bank-statements/auto-reconcile
  //    Trigger auto-reconciliation after import
  // =====================================
  app.post(
    '/api/companies/:companyId/bank-statements/auto-reconcile',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = req.user!.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const result = await autoReconcileTransactions(companyId);

      log.info(
        { companyId, autoMatched: result.autoMatchedCount, manualReview: result.manualReviewCount },
        'Auto-reconciliation completed after bank statement import'
      );

      res.json(result);
    })
  );
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Create a deterministic key for duplicate detection.
 * Matches on date (YYYY-MM-DD) + amount (rounded to 2 decimals) + description (lowercase trimmed).
 */
function duplicateKey(date: Date | string, amount: number, description: string): string {
  const d = date instanceof Date
    ? date.toISOString().split('T')[0]
    : new Date(date).toISOString().split('T')[0];
  const a = Math.round(amount * 100); // integer cents to avoid floating point
  const desc = (description || '').toLowerCase().trim();
  return `${d}|${a}|${desc}`;
}
