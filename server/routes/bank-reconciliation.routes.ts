import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { storage } from '../storage';
import { db } from '../db';
import { journalEntries, journalLines, accounts } from '../../shared/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

/**
 * Manual Bank Reconciliation Routes
 * ──────────────────────────────────
 * Allows users to manually reconcile journal lines for bank/cash accounts
 * (account codes starting with 10xx) against bank statements.
 */
export function registerBankReconciliationRoutes(app: Express) {

  // =====================================
  // 1. GET unreconciled journal lines for bank/cash accounts
  // =====================================
  app.get(
    '/api/companies/:companyId/bank-reconciliation/unreconciled',
    authMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user?.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Find all unreconciled journal lines for bank/cash accounts (codes starting with 10)
      const rows = await (db as any)
        .select({
          lineId: journalLines.id,
          entryId: journalLines.entryId,
          accountId: journalLines.accountId,
          debit: journalLines.debit,
          credit: journalLines.credit,
          lineDescription: journalLines.description,
          isReconciled: journalLines.isReconciled,
          // Journal entry fields
          entryDate: journalEntries.date,
          entryNumber: journalEntries.entryNumber,
          entryMemo: journalEntries.memo,
          entryStatus: journalEntries.status,
          // Account fields
          accountCode: accounts.code,
          accountName: accounts.nameEn,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
        .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
        .where(
          and(
            eq(journalEntries.companyId, companyId),
            eq(journalEntries.status, 'posted'),
            eq(journalLines.isReconciled, false),
            sql`${accounts.code} LIKE '10%'`
          )
        );

      res.json({ unreconciledLines: rows });
    })
  );

  // =====================================
  // 2. POST reconcile journal lines
  // =====================================
  app.post(
    '/api/companies/:companyId/bank-reconciliation/reconcile',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user?.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const schema = z.object({
        journalLineIds: z.array(z.string().uuid()).min(1, 'At least one journal line ID is required'),
        bankStatementDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
        bankStatementRef: z.string().optional(),
      });

      const validated = schema.parse(req.body);

      // Verify all lines belong to this company and are bank/cash accounts
      const lines = await (db as any)
        .select({
          lineId: journalLines.id,
          entryCompanyId: journalEntries.companyId,
          accountCode: accounts.code,
          isReconciled: journalLines.isReconciled,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
        .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
        .where(inArray(journalLines.id, validated.journalLineIds));

      // Validate ownership
      const invalidLines = lines.filter((l: any) => l.entryCompanyId !== companyId);
      if (invalidLines.length > 0) {
        return res.status(403).json({ message: 'Some journal lines do not belong to this company' });
      }

      // Check that all requested IDs were found
      const foundIds = new Set(lines.map((l: any) => l.lineId));
      const missingIds = validated.journalLineIds.filter((id: string) => !foundIds.has(id));
      if (missingIds.length > 0) {
        return res.status(404).json({ message: 'Some journal lines were not found', missingIds });
      }

      // Check that none are already reconciled
      const alreadyReconciled = lines.filter((l: any) => l.isReconciled);
      if (alreadyReconciled.length > 0) {
        return res.status(400).json({
          message: 'Some journal lines are already reconciled',
          alreadyReconciledIds: alreadyReconciled.map((l: any) => l.lineId),
        });
      }

      // Mark lines as reconciled
      const now = new Date();
      await (db as any)
        .update(journalLines)
        .set({
          isReconciled: true,
          reconciledAt: now,
          reconciledBy: userId,
        })
        .where(inArray(journalLines.id, validated.journalLineIds));

      res.json({
        message: `${validated.journalLineIds.length} journal line(s) reconciled successfully`,
        reconciledCount: validated.journalLineIds.length,
        bankStatementDate: validated.bankStatementDate,
        bankStatementRef: validated.bankStatementRef || null,
      });
    })
  );

  // =====================================
  // 3. POST unreconcile journal lines
  // =====================================
  app.post(
    '/api/companies/:companyId/bank-reconciliation/unreconcile',
    authMiddleware,
    requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user?.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const schema = z.object({
        journalLineIds: z.array(z.string().uuid()).min(1, 'At least one journal line ID is required'),
      });

      const validated = schema.parse(req.body);

      // Verify all lines belong to this company
      const lines = await (db as any)
        .select({
          lineId: journalLines.id,
          entryCompanyId: journalEntries.companyId,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
        .where(inArray(journalLines.id, validated.journalLineIds));

      const invalidLines = lines.filter((l: any) => l.entryCompanyId !== companyId);
      if (invalidLines.length > 0) {
        return res.status(403).json({ message: 'Some journal lines do not belong to this company' });
      }

      const foundIds = new Set(lines.map((l: any) => l.lineId));
      const missingIds = validated.journalLineIds.filter((id: string) => !foundIds.has(id));
      if (missingIds.length > 0) {
        return res.status(404).json({ message: 'Some journal lines were not found', missingIds });
      }

      // Reverse reconciliation
      await (db as any)
        .update(journalLines)
        .set({
          isReconciled: false,
          reconciledAt: null,
          reconciledBy: null,
        })
        .where(inArray(journalLines.id, validated.journalLineIds));

      res.json({
        message: `${validated.journalLineIds.length} journal line(s) unreconciled successfully`,
        unreconciledCount: validated.journalLineIds.length,
      });
    })
  );

  // =====================================
  // 4. GET reconciliation summary per bank account
  // =====================================
  app.get(
    '/api/companies/:companyId/bank-reconciliation/summary',
    authMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user?.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Aggregate reconciliation stats per bank/cash account
      const rows = await (db as any)
        .select({
          accountId: accounts.id,
          accountCode: accounts.code,
          accountName: accounts.nameEn,
          totalReconciled: sql<number>`COALESCE(SUM(CASE WHEN ${journalLines.isReconciled} = true THEN 1 ELSE 0 END), 0)`.as('total_reconciled'),
          totalUnreconciled: sql<number>`COALESCE(SUM(CASE WHEN ${journalLines.isReconciled} = false THEN 1 ELSE 0 END), 0)`.as('total_unreconciled'),
          reconciledDebitTotal: sql<string>`COALESCE(SUM(CASE WHEN ${journalLines.isReconciled} = true THEN CAST(${journalLines.debit} AS numeric) ELSE 0 END), 0)`.as('reconciled_debit_total'),
          reconciledCreditTotal: sql<string>`COALESCE(SUM(CASE WHEN ${journalLines.isReconciled} = true THEN CAST(${journalLines.credit} AS numeric) ELSE 0 END), 0)`.as('reconciled_credit_total'),
          unreconciledDebitTotal: sql<string>`COALESCE(SUM(CASE WHEN ${journalLines.isReconciled} = false THEN CAST(${journalLines.debit} AS numeric) ELSE 0 END), 0)`.as('unreconciled_debit_total'),
          unreconciledCreditTotal: sql<string>`COALESCE(SUM(CASE WHEN ${journalLines.isReconciled} = false THEN CAST(${journalLines.credit} AS numeric) ELSE 0 END), 0)`.as('unreconciled_credit_total'),
          lastReconciledAt: sql<string>`MAX(${journalLines.reconciledAt})`.as('last_reconciled_at'),
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
        .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
        .where(
          and(
            eq(journalEntries.companyId, companyId),
            eq(journalEntries.status, 'posted'),
            sql`${accounts.code} LIKE '10%'`
          )
        )
        .groupBy(accounts.id, accounts.code, accounts.nameEn);

      res.json({ accounts: rows });
    })
  );
}
