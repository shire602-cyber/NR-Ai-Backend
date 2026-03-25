import type { Express, Request, Response } from 'express';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { storage } from '../storage';
import { pool } from '../db';
import { createLogger } from '../config/logger';
import { ACCOUNT_CODES } from '../lib/account-codes';

const log = createLogger('fiscal-years');

// Use ACCOUNT_CODES.RETAINED_EARNINGS if it exists, otherwise fallback to "3020"
const RETAINED_EARNINGS_CODE = (ACCOUNT_CODES as any).RETAINED_EARNINGS || '3020';

export function registerFiscalYearRoutes(app: Express) {
  // =====================================
  // Fiscal Year Routes
  // =====================================

  // List all fiscal years for a company
  app.get("/api/companies/:companyId/fiscal-years", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT * FROM fiscal_years WHERE company_id = $1 ORDER BY start_date DESC`,
      [companyId]
    );

    res.json(result.rows);
  }));

  // Create a new fiscal year
  app.post("/api/companies/:companyId/fiscal-years", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { name, startDate, endDate } = req.body;

    if (!name || !startDate || !endDate) {
      return res.status(400).json({ message: 'name, startDate, and endDate are required' });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: 'startDate must be before endDate' });
    }

    // Validate no overlap with existing fiscal years
    const overlapResult = await pool.query(
      `SELECT id, name FROM fiscal_years
       WHERE company_id = $1
         AND start_date <= $3::date
         AND end_date >= $2::date`,
      [companyId, startDate, endDate]
    );

    if (overlapResult.rows.length > 0) {
      const overlapping = overlapResult.rows[0];
      return res.status(400).json({
        message: `Date range overlaps with existing fiscal year: ${overlapping.name}`
      });
    }

    const result = await pool.query(
      `INSERT INTO fiscal_years (company_id, name, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, 'open')
       RETURNING *`,
      [companyId, name, startDate, endDate]
    );

    log.info({ companyId, fiscalYearId: result.rows[0].id, name }, 'Fiscal year created');
    res.status(201).json(result.rows[0]);
  }));

  // Close a fiscal year (year-end close)
  app.post("/api/companies/:companyId/fiscal-years/:id/close", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get the fiscal year
    const fyResult = await pool.query(
      `SELECT * FROM fiscal_years WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );

    if (fyResult.rows.length === 0) {
      return res.status(404).json({ message: 'Fiscal year not found' });
    }

    const fy = fyResult.rows[0];

    if (fy.status === 'closed') {
      return res.status(400).json({ message: 'Fiscal year is already closed' });
    }

    // Resolve Retained Earnings account
    const retainedEarningsAccount = await storage.getAccountByCode(companyId, RETAINED_EARNINGS_CODE);
    if (!retainedEarningsAccount) {
      return res.status(500).json({
        message: 'Retained Earnings account (3020) not found. Please ensure it exists in the chart of accounts.'
      });
    }

    // Use a dedicated client for the transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get all income accounts with their balances for the fiscal year date range
      // Income balance = credits - debits (for posted entries only)
      const incomeResult = await client.query(
        `SELECT
           a.id AS account_id,
           a.name_en AS account_name,
           a.code AS account_code,
           COALESCE(SUM(CAST(jl.credit AS numeric)), 0) - COALESCE(SUM(CAST(jl.debit AS numeric)), 0) AS balance
         FROM accounts a
         INNER JOIN journal_lines jl ON jl.account_id = a.id
         INNER JOIN journal_entries je ON je.id = jl.entry_id
         WHERE a.company_id = $1
           AND a.type = 'income'
           AND je.status = 'posted'
           AND je.date >= $2::date
           AND je.date <= $3::date
         GROUP BY a.id, a.name_en, a.code
         HAVING COALESCE(SUM(CAST(jl.credit AS numeric)), 0) - COALESCE(SUM(CAST(jl.debit AS numeric)), 0) != 0`,
        [companyId, fy.start_date, fy.end_date]
      );

      // Get all expense accounts with their balances for the fiscal year date range
      // Expense balance = debits - credits (for posted entries only)
      const expenseResult = await client.query(
        `SELECT
           a.id AS account_id,
           a.name_en AS account_name,
           a.code AS account_code,
           COALESCE(SUM(CAST(jl.debit AS numeric)), 0) - COALESCE(SUM(CAST(jl.credit AS numeric)), 0) AS balance
         FROM accounts a
         INNER JOIN journal_lines jl ON jl.account_id = a.id
         INNER JOIN journal_entries je ON je.id = jl.entry_id
         WHERE a.company_id = $1
           AND a.type = 'expense'
           AND je.status = 'posted'
           AND je.date >= $2::date
           AND je.date <= $3::date
         GROUP BY a.id, a.name_en, a.code
         HAVING COALESCE(SUM(CAST(jl.debit AS numeric)), 0) - COALESCE(SUM(CAST(jl.credit AS numeric)), 0) != 0`,
        [companyId, fy.start_date, fy.end_date]
      );

      const incomeAccounts = incomeResult.rows;
      const expenseAccounts = expenseResult.rows;

      // Calculate totals
      const totalIncome = incomeAccounts.reduce((sum: number, row: any) => sum + Number(row.balance), 0);
      const totalExpenses = expenseAccounts.reduce((sum: number, row: any) => sum + Number(row.balance), 0);
      const netIncome = totalIncome - totalExpenses; // positive = profit, negative = loss

      // Generate entry number for the closing entry inside the transaction
      const entryDate = new Date(fy.end_date);
      const dateStr = entryDate.toISOString().slice(0, 10).replace(/-/g, '');
      const entryNumResult = await client.query(
        `SELECT COUNT(*) as count FROM journal_entries WHERE company_id = $1 AND entry_number LIKE $2 FOR UPDATE`,
        [companyId, `JE-${dateStr}%`]
      );
      const entryNumCount = Number(entryNumResult.rows[0]?.count || 0);
      const entryNumber = `JE-${dateStr}-${String(entryNumCount + 1).padStart(3, '0')}`;

      // Create the closing journal entry
      const jeResult = await client.query(
        `INSERT INTO journal_entries (company_id, entry_number, date, memo, source, source_id, status, created_by)
         VALUES ($1, $2, $3, $4, 'year_end_close', $5, 'posted', $6)
         RETURNING *`,
        [
          companyId,
          entryNumber,
          fy.end_date,
          `Year-end closing entry for ${fy.name}`,
          id,
          userId
        ]
      );

      const closingEntry = jeResult.rows[0];

      // Debit each income account to zero it out
      for (const incomeRow of incomeAccounts) {
        const amount = Math.abs(Number(incomeRow.balance)).toFixed(2);
        await client.query(
          `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            closingEntry.id,
            incomeRow.account_id,
            amount,   // Debit to zero out income (which normally has credit balance)
            '0.00',
            `Close ${incomeRow.account_name} (${incomeRow.account_code})`
          ]
        );
      }

      // Credit each expense account to zero it out
      for (const expenseRow of expenseAccounts) {
        const amount = Math.abs(Number(expenseRow.balance)).toFixed(2);
        await client.query(
          `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            closingEntry.id,
            expenseRow.account_id,
            '0.00',
            amount,   // Credit to zero out expense (which normally has debit balance)
            `Close ${expenseRow.account_name} (${expenseRow.account_code})`
          ]
        );
      }

      // Net difference goes to Retained Earnings
      // Profit (netIncome > 0): Credit Retained Earnings
      // Loss (netIncome < 0): Debit Retained Earnings
      if (netIncome !== 0) {
        const reAmount = Math.abs(netIncome).toFixed(2);
        await client.query(
          `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            closingEntry.id,
            retainedEarningsAccount.id,
            netIncome < 0 ? reAmount : '0.00',   // Debit if loss
            netIncome > 0 ? reAmount : '0.00',   // Credit if profit
            `Net income transferred to Retained Earnings`
          ]
        );
      }

      // Update the fiscal year to closed
      const updateResult = await client.query(
        `UPDATE fiscal_years
         SET status = 'closed',
             closed_at = NOW(),
             closed_by = $1,
             closing_entry_id = $2
         WHERE id = $3
         RETURNING *`,
        [userId, closingEntry.id, id]
      );

      await client.query('COMMIT');

      log.info({
        companyId,
        fiscalYearId: id,
        closingEntryId: closingEntry.id,
        totalIncome,
        totalExpenses,
        netIncome
      }, 'Fiscal year closed');

      res.json({
        fiscalYear: updateResult.rows[0],
        closingEntry: {
          id: closingEntry.id,
          entryNumber: closingEntry.entry_number,
          totalIncome: totalIncome.toFixed(2),
          totalExpenses: totalExpenses.toFixed(2),
          netIncome: netIncome.toFixed(2),
          incomeAccountsClosed: incomeAccounts.length,
          expenseAccountsClosed: expenseAccounts.length
        }
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }));

  // Delete a fiscal year (only if open and no entries exist in range)
  app.delete("/api/companies/:companyId/fiscal-years/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get the fiscal year
    const fyResult = await pool.query(
      `SELECT * FROM fiscal_years WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );

    if (fyResult.rows.length === 0) {
      return res.status(404).json({ message: 'Fiscal year not found' });
    }

    const fy = fyResult.rows[0];

    if (fy.status === 'closed') {
      return res.status(400).json({ message: 'Cannot delete a closed fiscal year' });
    }

    // Check if any journal entries exist within the fiscal year date range
    const entriesResult = await pool.query(
      `SELECT COUNT(*) AS count FROM journal_entries
       WHERE company_id = $1
         AND date >= $2::date
         AND date <= $3::date`,
      [companyId, fy.start_date, fy.end_date]
    );

    const entryCount = Number(entriesResult.rows[0].count);
    if (entryCount > 0) {
      return res.status(400).json({
        message: `Cannot delete fiscal year: ${entryCount} journal ${entryCount === 1 ? 'entry exists' : 'entries exist'} within the date range`
      });
    }

    await pool.query('DELETE FROM fiscal_years WHERE id = $1', [id]);

    log.info({ companyId, fiscalYearId: id }, 'Fiscal year deleted');
    res.json({ message: 'Fiscal year deleted successfully' });
  }));
}
