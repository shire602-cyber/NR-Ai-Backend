import type { Express, Request, Response } from 'express';
import { pool } from '../db';
import { storage } from '../storage';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { ACCOUNT_CODES } from '../lib/account-codes';
import { assertFiscalYearOpenPool } from '../lib/fiscal-year-guard';
import { createLogger } from '../config/logger';

const log = createLogger('fx-revaluation');

export function registerFxRevaluationRoutes(app: Express) {
  // POST /api/companies/:companyId/fx-revaluation
  // Revalue all open foreign-currency monetary items at the closing rate (IAS 21)
  app.post('/api/companies/:companyId/fx-revaluation',
    authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user!.id;
      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

      const { revaluationDate } = req.body;
      if (!revaluationDate) return res.status(400).json({ error: 'revaluationDate is required' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await assertFiscalYearOpenPool(client, companyId, new Date(revaluationDate));

        // 1. Find all open foreign-currency journal lines on monetary accounts (AR, AP)
        // These are lines where originalCurrency != 'AED' and originalCurrency IS NOT NULL
        const { rows: openItems } = await client.query(`
          SELECT
            jl.id, jl.account_id, jl.debit, jl.credit,
            jl.original_amount, jl.original_currency,
            je.exchange_rate as original_rate,
            a.code as account_code, a.type as account_type,
            a.name_en as account_name
          FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.entry_id
          JOIN accounts a ON a.id = jl.account_id
          WHERE je.company_id = $1
            AND je.status = 'posted'
            AND jl.original_currency IS NOT NULL
            AND jl.original_currency != 'AED'
            AND a.code IN ('1040', '2010')
          ORDER BY a.code
        `, [companyId]);

        if (openItems.length === 0) {
          await client.query('ROLLBACK');
          return res.json({ message: 'No foreign currency items to revalue', adjustments: [] });
        }

        // 2. Group by currency and get closing rates
        const currencies = [...new Set(openItems.map((r: any) => r.original_currency))];
        const adjustments: any[] = [];
        const jeLines: any[] = [];

        for (const currency of currencies) {
          // Get closing rate for this currency
          const rateResult = await client.query(`
            SELECT rate FROM exchange_rates
            WHERE company_id = $1 AND base_currency = 'AED' AND target_currency = $2
            ORDER BY effective_date DESC LIMIT 1
          `, [companyId, currency]);

          if (!rateResult.rows[0]) continue;
          const closingRate = Number(rateResult.rows[0].rate);

          // 3. For each line in this currency, compute the difference
          const currencyItems = openItems.filter((r: any) => r.original_currency === currency);

          for (const item of currencyItems) {
            const originalAmount = Number(item.original_amount);
            const originalRate = Number(item.original_rate);
            const originalBase = Number(item.debit) || Number(item.credit);
            const revaluedBase = originalAmount * closingRate;
            const difference = revaluedBase - originalBase;

            if (Math.abs(difference) < 0.01) continue; // No material difference

            adjustments.push({
              accountCode: item.account_code,
              accountName: item.account_name,
              currency,
              originalAmount,
              originalRate,
              closingRate,
              originalBase: Number(originalBase.toFixed(2)),
              revaluedBase: Number(revaluedBase.toFixed(2)),
              difference: Number(difference.toFixed(2)),
            });

            // Build JE line: adjust the monetary account and offset to FX gain/loss
            const isGain = difference > 0;
            const absDiff = Math.abs(difference);

            if (item.account_type === 'asset') {
              // AR revaluation: if rate went up, asset worth more = gain
              jeLines.push({
                accountId: item.account_id,
                debit: isGain ? absDiff : 0,
                credit: isGain ? 0 : absDiff,
              });
            } else {
              // AP revaluation: if rate went up, liability worth more = loss
              jeLines.push({
                accountId: item.account_id,
                debit: isGain ? 0 : absDiff,
                credit: isGain ? absDiff : 0,
              });
            }
          }
        }

        if (jeLines.length === 0) {
          await client.query('ROLLBACK');
          return res.json({ message: 'No material exchange differences', adjustments: [] });
        }

        // 4. Calculate net gain/loss
        const totalDebit = jeLines.reduce((s: number, l: any) => s + l.debit, 0);
        const totalCredit = jeLines.reduce((s: number, l: any) => s + l.credit, 0);
        const netDiff = totalDebit - totalCredit;

        // 5. Resolve FX gain/loss accounts
        const fxGainAccount = await storage.getAccountByCode(companyId, ACCOUNT_CODES.UNREALIZED_FX_GAIN);
        const fxLossAccount = await storage.getAccountByCode(companyId, ACCOUNT_CODES.UNREALIZED_FX_LOSS);

        if (!fxGainAccount || !fxLossAccount) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Both FX gain (4090) and FX loss (5160) accounts are required.' });
        }

        // Add the offsetting FX gain/loss line to balance the JE
        if (netDiff > 0) {
          // Net debit excess = FX gain (credit income)
          jeLines.push({
            accountId: fxGainAccount!.id,
            debit: 0,
            credit: netDiff,
          });
        } else if (netDiff < 0) {
          // Net credit excess = FX loss (debit expense)
          jeLines.push({
            accountId: fxLossAccount!.id,
            debit: Math.abs(netDiff),
            credit: 0,
          });
        }

        // 6. Create the revaluation JE
        const dateStr = new Date(revaluationDate).toISOString().slice(0, 10).replace(/-/g, '');
        const entryNumResult = await client.query(
          `SELECT COUNT(*) as count FROM journal_entries WHERE company_id = $1 AND entry_number LIKE $2 FOR UPDATE`,
          [companyId, `JE-${dateStr}%`]
        );
        const count = Number(entryNumResult.rows[0]?.count || 0);
        const entryNumber = `JE-${dateStr}-${String(count + 1).padStart(3, '0')}`;

        const { rows: [entry] } = await client.query(`
          INSERT INTO journal_entries (company_id, entry_number, date, memo, status, source, posted_by, posted_at, created_by)
          VALUES ($1, $2, $3, $4, 'posted', 'fx_revaluation', $5, NOW(), $5)
          RETURNING id
        `, [companyId, entryNumber, revaluationDate, `Foreign currency revaluation as of ${revaluationDate}`, userId]);

        for (const line of jeLines) {
          await client.query(`
            INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
            VALUES ($1, $2, $3, $4, $5)
          `, [entry.id, line.accountId, line.debit.toFixed(2), line.credit.toFixed(2), 'FX revaluation adjustment']);
        }

        await client.query('COMMIT');

        log.info(`FX revaluation completed for company ${companyId}: ${adjustments.length} items, entry ${entryNumber}`);

        res.json({
          message: `Revaluation complete. ${adjustments.length} items adjusted.`,
          entryNumber,
          entryId: entry.id,
          adjustments,
          totalGainLoss: Number(netDiff.toFixed(2)),
        });
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    })
  );

  // GET /api/companies/:companyId/fx-revaluation/preview
  // Preview revaluation without creating JE
  app.get('/api/companies/:companyId/fx-revaluation/preview',
    authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user!.id;
      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

      const { rows: openItems } = await pool.query(`
        SELECT
          jl.original_amount, jl.original_currency,
          je.exchange_rate as original_rate,
          a.code as account_code, a.name_en as account_name, a.type as account_type
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.entry_id
        JOIN accounts a ON a.id = jl.account_id
        WHERE je.company_id = $1
          AND je.status = 'posted'
          AND jl.original_currency IS NOT NULL
          AND jl.original_currency != 'AED'
          AND a.code IN ('1040', '2010')
      `, [companyId]);

      const currencies = [...new Set(openItems.map((r: any) => r.original_currency))];
      const adjustments: any[] = [];

      for (const currency of currencies) {
        const rateResult = await pool.query(`
          SELECT rate FROM exchange_rates
          WHERE company_id = $1 AND base_currency = 'AED' AND target_currency = $2
          ORDER BY effective_date DESC LIMIT 1
        `, [companyId, currency]);

        if (!rateResult.rows[0]) continue;
        const closingRate = Number(rateResult.rows[0].rate);

        for (const item of openItems.filter((r: any) => r.original_currency === currency)) {
          const originalAmount = Number(item.original_amount);
          const originalBase = originalAmount * Number(item.original_rate);
          const revaluedBase = originalAmount * closingRate;
          const difference = revaluedBase - originalBase;
          if (Math.abs(difference) < 0.01) continue;

          adjustments.push({
            accountCode: item.account_code,
            accountName: item.account_name,
            currency,
            originalAmount,
            closingRate,
            difference: Number(difference.toFixed(2)),
          });
        }
      }

      res.json({
        adjustments,
        totalGainLoss: adjustments.reduce((s: number, a: any) => s + a.difference, 0),
      });
    })
  );
}
