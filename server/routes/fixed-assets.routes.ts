import type { Express, Request, Response } from 'express';
import { pool } from '../db';
import { storage } from '../storage';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { createLogger } from '../config/logger';
import { ACCOUNT_CODES } from '../lib/account-codes';
import { assertFiscalYearOpenPool } from '../lib/fiscal-year-guard';

const log = createLogger('fixed-assets');

export function registerFixedAssetRoutes(app: Express) {
  // =====================================
  // Fixed Asset CRUD
  // =====================================

  // List all fixed assets for a company
  app.get("/api/companies/:companyId/fixed-assets", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT * FROM fixed_assets WHERE company_id = $1 ORDER BY created_at DESC`,
      [companyId]
    );
    res.json(result.rows);
  }));

  // Get single fixed asset
  app.get("/api/fixed-assets/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const result = await pool.query(`SELECT * FROM fixed_assets WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Fixed asset not found' });
    }

    const asset = result.rows[0];
    const hasAccess = await storage.hasCompanyAccess(userId, asset.company_id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(asset);
  }));

  // Create fixed asset
  app.post("/api/companies/:companyId/fixed-assets", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const {
      assetName, assetNameAr, assetNumber, category, purchaseDate,
      purchaseCost, salvageValue, usefulLifeYears, depreciationMethod,
      location, serialNumber, notes
    } = req.body;

    if (!assetName || !category || !purchaseDate || purchaseCost === undefined || !usefulLifeYears) {
      return res.status(400).json({ message: 'assetName, category, purchaseDate, purchaseCost, and usefulLifeYears are required' });
    }

    const cost = parseFloat(purchaseCost);
    const salvage = parseFloat(salvageValue || 0);
    const nbv = cost - 0; // Initial NBV = cost (no depreciation yet)

    const result = await pool.query(
      `INSERT INTO fixed_assets (company_id, asset_name, asset_name_ar, asset_number, category, purchase_date, purchase_cost, salvage_value, useful_life_years, depreciation_method, accumulated_depreciation, net_book_value, location, serial_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, $13, $14)
       RETURNING *`,
      [companyId, assetName, assetNameAr || null, assetNumber || null, category, purchaseDate, cost, salvage, usefulLifeYears, depreciationMethod || 'straight_line', nbv, location || null, serialNumber || null, notes || null]
    );

    log.info({ assetId: result.rows[0].id, companyId }, 'Fixed asset created');
    res.json(result.rows[0]);
  }));

  // Update fixed asset
  app.patch("/api/fixed-assets/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const existing = await pool.query(`SELECT * FROM fixed_assets WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Fixed asset not found' });
    }

    const asset = existing.rows[0];
    const hasAccess = await storage.hasCompanyAccess(userId, asset.company_id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const {
      assetName, assetNameAr, assetNumber, category, purchaseDate,
      purchaseCost, salvageValue, usefulLifeYears, depreciationMethod,
      location, serialNumber, notes, status
    } = req.body;

    // Build SET clause dynamically to allow setting nullable fields to null
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (assetName !== undefined) { setClauses.push(`asset_name = $${paramIndex++}`); values.push(assetName); }
    if (assetNameAr !== undefined) { setClauses.push(`asset_name_ar = $${paramIndex++}`); values.push(assetNameAr); }
    if (assetNumber !== undefined) { setClauses.push(`asset_number = $${paramIndex++}`); values.push(assetNumber); }
    if (category !== undefined) { setClauses.push(`category = $${paramIndex++}`); values.push(category); }
    if (purchaseDate !== undefined) { setClauses.push(`purchase_date = $${paramIndex++}`); values.push(purchaseDate); }
    if (purchaseCost !== undefined) { setClauses.push(`purchase_cost = $${paramIndex++}`); values.push(purchaseCost); }
    if (salvageValue !== undefined) { setClauses.push(`salvage_value = $${paramIndex++}`); values.push(salvageValue); }
    if (usefulLifeYears !== undefined) { setClauses.push(`useful_life_years = $${paramIndex++}`); values.push(usefulLifeYears); }
    if (depreciationMethod !== undefined) { setClauses.push(`depreciation_method = $${paramIndex++}`); values.push(depreciationMethod); }
    if (location !== undefined) { setClauses.push(`location = $${paramIndex++}`); values.push(location); }
    if (serialNumber !== undefined) { setClauses.push(`serial_number = $${paramIndex++}`); values.push(serialNumber); }
    if (notes !== undefined) { setClauses.push(`notes = $${paramIndex++}`); values.push(notes); }
    if (status !== undefined) { setClauses.push(`status = $${paramIndex++}`); values.push(status); }

    if (setClauses.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE fixed_assets SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    // Recalculate NBV after update
    const updated = result.rows[0];
    const nbv = parseFloat(updated.purchase_cost) - parseFloat(updated.accumulated_depreciation || 0);
    await pool.query(`UPDATE fixed_assets SET net_book_value = $1 WHERE id = $2`, [nbv, id]);

    const final = await pool.query(`SELECT * FROM fixed_assets WHERE id = $1`, [id]);
    log.info({ assetId: id }, 'Fixed asset updated');
    res.json(final.rows[0]);
  }));

  // Delete fixed asset
  app.delete("/api/fixed-assets/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const existing = await pool.query(`SELECT * FROM fixed_assets WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Fixed asset not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, existing.rows[0].company_id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await pool.query(`DELETE FROM fixed_assets WHERE id = $1`, [id]);
    log.info({ assetId: id }, 'Fixed asset deleted');
    res.json({ message: 'Fixed asset deleted successfully' });
  }));

  // =====================================
  // Depreciation
  // =====================================

  // Calculate and record monthly depreciation for a single asset
  app.post("/api/fixed-assets/:id/depreciate", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const existing = await pool.query(`SELECT * FROM fixed_assets WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Fixed asset not found' });
    }

    const asset = existing.rows[0];
    const hasAccess = await storage.hasCompanyAccess(userId, asset.company_id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (asset.status !== 'active') {
      return res.status(400).json({ message: 'Can only depreciate active assets' });
    }

    // Determine the depreciation date (default: today)
    const depreciationDate = new Date();

    const cost = parseFloat(asset.purchase_cost);
    const salvage = parseFloat(asset.salvage_value || 0);
    const usefulLifeYears = asset.useful_life_years;
    const currentAccDep = parseFloat(asset.accumulated_depreciation || 0);
    const method = asset.depreciation_method || 'straight_line';

    let monthlyDepreciation = 0;

    if (method === 'straight_line') {
      // Straight-line: (cost - salvage) / (useful_life * 12) per month
      monthlyDepreciation = (cost - salvage) / (usefulLifeYears * 12);
    } else if (method === 'declining_balance') {
      // Declining balance: 2 * (1/useful_life) * NBV per year / 12 per month
      const currentNBV = cost - currentAccDep;
      const annualRate = 2 / usefulLifeYears;
      monthlyDepreciation = (currentNBV * annualRate) / 12;
      // Don't depreciate below salvage value
      if (currentNBV - monthlyDepreciation < salvage) {
        monthlyDepreciation = Math.max(0, currentNBV - salvage);
      }
    }

    // Don't depreciate beyond (cost - salvage)
    const maxDepreciation = cost - salvage;
    if (currentAccDep + monthlyDepreciation > maxDepreciation) {
      monthlyDepreciation = Math.max(0, maxDepreciation - currentAccDep);
    }

    monthlyDepreciation = Math.round(monthlyDepreciation * 100) / 100;
    const newAccDep = Math.round((currentAccDep + monthlyDepreciation) * 100) / 100;
    const newNBV = Math.round((cost - newAccDep) * 100) / 100;

    // Use a pool transaction for asset update + journal entry creation
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fiscal year guard: ensure depreciation date is in an open fiscal year
      await assertFiscalYearOpenPool(client, asset.company_id, depreciationDate);

      // Idempotency: check if a depreciation JE already exists for this asset + month
      // MUST happen BEFORE updating accumulated_depreciation to prevent double-counting
      const monthKey = `${depreciationDate.getFullYear()}-${String(depreciationDate.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyDepreciation > 0) {
        const dupeCheck = await client.query(
          `SELECT id FROM journal_entries
           WHERE source = 'depreciation' AND source_id = $1
             AND to_char(date, 'YYYY-MM') = $2
           LIMIT 1`,
          [id, monthKey]
        );

        if (dupeCheck.rows.length > 0) {
          await client.query('COMMIT');
          const current = await pool.query(`SELECT * FROM fixed_assets WHERE id = $1`, [id]);
          log.info({ assetId: id, monthKey }, 'Depreciation JE already exists for this month — skipped');
          return res.json({
            asset: current.rows[0],
            monthlyDepreciation: 0,
            previousAccumulatedDepreciation: currentAccDep,
            newAccumulatedDepreciation: currentAccDep,
            newNetBookValue: cost - currentAccDep,
            skipped: true,
            reason: `Depreciation already recorded for ${monthKey}`,
          });
        }
      }

      // Update asset depreciation (only reached if no duplicate found)
      await client.query(
        `UPDATE fixed_assets SET accumulated_depreciation = $1, net_book_value = $2 WHERE id = $3`,
        [newAccDep, newNBV, id]
      );

      // Create depreciation journal entry (if amount > 0)
      if (monthlyDepreciation > 0) {
        // Resolve accounts
        const depExpenseAccount = await storage.getAccountByCode(asset.company_id, ACCOUNT_CODES.DEPRECIATION_EXPENSE);
        const accumDepAccount = await storage.getAccountByCode(asset.company_id, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);

        if (!depExpenseAccount || !accumDepAccount) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'Required accounts not found. Ensure your chart of accounts includes Depreciation Expense (5100) and Accumulated Depreciation (1240).'
          });
        }

        // Generate entry number inside the transaction (inline SQL to avoid Drizzle/pool mismatch)
        const depDateStr = new Date(depreciationDate).toISOString().slice(0, 10).replace(/-/g, '');
        const depEntryNumResult = await client.query(
          `SELECT COUNT(*) as count FROM journal_entries WHERE company_id = $1 AND entry_number LIKE $2 FOR UPDATE`,
          [asset.company_id, `JE-${depDateStr}%`]
        );
        const depEntryCount = Number(depEntryNumResult.rows[0]?.count || 0);
        const entryNumber = `JE-${depDateStr}-${String(depEntryCount + 1).padStart(3, '0')}`;

        // Create journal entry
        const jeResult = await client.query(
          `INSERT INTO journal_entries (company_id, date, memo, entry_number, status, source, source_id, created_by)
           VALUES ($1, $2, $3, $4, 'draft', 'depreciation', $5, $6)
           RETURNING id`,
          [asset.company_id, depreciationDate, `Depreciation - ${asset.asset_name} (${monthKey})`, entryNumber, id, userId]
        );
        const entryId = jeResult.rows[0].id;

        // Debit: Depreciation Expense
        await client.query(
          `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
           VALUES ($1, $2, $3, 0, $4)`,
          [entryId, depExpenseAccount.id, monthlyDepreciation, `Depreciation expense - ${asset.asset_name}`]
        );

        // Credit: Accumulated Depreciation
        await client.query(
          `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
           VALUES ($1, $2, 0, $3, $4)`,
          [entryId, accumDepAccount.id, monthlyDepreciation, `Accumulated depreciation - ${asset.asset_name}`]
        );

        log.info({ assetId: id, entryId, entryNumber, monthlyDepreciation }, 'Depreciation journal entry created');
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const updated = await pool.query(`SELECT * FROM fixed_assets WHERE id = $1`, [id]);
    log.info({ assetId: id, monthlyDepreciation, newAccDep, newNBV }, 'Depreciation recorded');
    res.json({
      asset: updated.rows[0],
      monthlyDepreciation,
      previousAccumulatedDepreciation: currentAccDep,
      newAccumulatedDepreciation: newAccDep,
      newNetBookValue: newNBV,
    });
  }));

  // Run depreciation for all active assets for a given month
  app.post("/api/companies/:companyId/fixed-assets/run-depreciation", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { month, year } = req.body;
    if (!month || !year) {
      return res.status(400).json({ message: 'month and year are required' });
    }

    // Depreciation date = last day of the requested month
    const depreciationDate = new Date(year, month - 1, 15); // mid-month as the JE date
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;

    // Resolve depreciation accounts once for the entire batch
    const depExpenseAccount = await storage.getAccountByCode(companyId, ACCOUNT_CODES.DEPRECIATION_EXPENSE);
    const accumDepAccount = await storage.getAccountByCode(companyId, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);

    if (!depExpenseAccount || !accumDepAccount) {
      return res.status(400).json({
        error: 'Required accounts not found. Ensure your chart of accounts includes Depreciation Expense (5100) and Accumulated Depreciation (1240).'
      });
    }

    const assetsResult = await pool.query(
      `SELECT * FROM fixed_assets WHERE company_id = $1 AND status = 'active'`,
      [companyId]
    );

    const results: any[] = [];

    // Use a single transaction for the entire batch
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fiscal year guard: ensure depreciation date is in an open fiscal year
      await assertFiscalYearOpenPool(client, companyId, depreciationDate);

      for (const asset of assetsResult.rows) {
        const cost = parseFloat(asset.purchase_cost);
        const salvage = parseFloat(asset.salvage_value || 0);
        const usefulLifeYears = asset.useful_life_years;
        const currentAccDep = parseFloat(asset.accumulated_depreciation || 0);
        const method = asset.depreciation_method || 'straight_line';
        const maxDepreciation = cost - salvage;

        let monthlyDepreciation = 0;

        if (method === 'straight_line') {
          monthlyDepreciation = (cost - salvage) / (usefulLifeYears * 12);
        } else if (method === 'declining_balance') {
          const currentNBV = cost - currentAccDep;
          const annualRate = 2 / usefulLifeYears;
          monthlyDepreciation = (currentNBV * annualRate) / 12;
          if (currentNBV - monthlyDepreciation < salvage) {
            monthlyDepreciation = Math.max(0, currentNBV - salvage);
          }
        }

        // Don't depreciate beyond max
        if (currentAccDep + monthlyDepreciation > maxDepreciation) {
          monthlyDepreciation = Math.max(0, maxDepreciation - currentAccDep);
        }

        if (monthlyDepreciation <= 0) {
          results.push({ assetId: asset.id, assetName: asset.asset_name, monthlyDepreciation: 0, skipped: true, reason: 'Fully depreciated' });
          continue;
        }

        monthlyDepreciation = Math.round(monthlyDepreciation * 100) / 100;
        const newAccDep = Math.round((currentAccDep + monthlyDepreciation) * 100) / 100;
        const newNBV = Math.round((cost - newAccDep) * 100) / 100;

        // Idempotency check BEFORE updating accumulated_depreciation to prevent double-counting
        const dupeCheck = await client.query(
          `SELECT id FROM journal_entries
           WHERE source = 'depreciation' AND source_id = $1
             AND to_char(date, 'YYYY-MM') = $2
           LIMIT 1`,
          [asset.id, monthKey]
        );

        if (dupeCheck.rows.length > 0) {
          log.info({ assetId: asset.id, monthKey }, 'Depreciation JE already exists — skipped');
          results.push({ assetId: asset.id, assetName: asset.asset_name, monthlyDepreciation: 0, skipped: true, reason: `Depreciation already recorded for ${monthKey}` });
          continue;
        }

        // Update asset depreciation (only reached if no duplicate found)
        await client.query(
          `UPDATE fixed_assets SET accumulated_depreciation = $1, net_book_value = $2 WHERE id = $3`,
          [newAccDep, newNBV, asset.id]
        );

        // Create depreciation journal entry
        {
          // Generate entry number inside the transaction (inline SQL to avoid Drizzle/pool mismatch)
          const batchDateStr = new Date(depreciationDate).toISOString().slice(0, 10).replace(/-/g, '');
          const batchEntryNumResult = await client.query(
            `SELECT COUNT(*) as count FROM journal_entries WHERE company_id = $1 AND entry_number LIKE $2 FOR UPDATE`,
            [companyId, `JE-${batchDateStr}%`]
          );
          const batchEntryCount = Number(batchEntryNumResult.rows[0]?.count || 0);
          const entryNumber = `JE-${batchDateStr}-${String(batchEntryCount + 1).padStart(3, '0')}`;

          const jeResult = await client.query(
            `INSERT INTO journal_entries (company_id, date, memo, entry_number, status, source, source_id, created_by)
             VALUES ($1, $2, $3, $4, 'draft', 'depreciation', $5, $6)
             RETURNING id`,
            [companyId, depreciationDate, `Depreciation - ${asset.asset_name} (${monthKey})`, entryNumber, asset.id, userId]
          );
          const entryId = jeResult.rows[0].id;

          // Debit: Depreciation Expense
          await client.query(
            `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
             VALUES ($1, $2, $3, 0, $4)`,
            [entryId, depExpenseAccount.id, monthlyDepreciation, `Depreciation expense - ${asset.asset_name}`]
          );

          // Credit: Accumulated Depreciation
          await client.query(
            `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
             VALUES ($1, $2, 0, $3, $4)`,
            [entryId, accumDepAccount.id, monthlyDepreciation, `Accumulated depreciation - ${asset.asset_name}`]
          );

          log.info({ assetId: asset.id, entryId, monthlyDepreciation, monthKey }, 'Batch depreciation JE created');
        }

        results.push({
          assetId: asset.id,
          assetName: asset.asset_name,
          monthlyDepreciation,
          newAccumulatedDepreciation: newAccDep,
          newNetBookValue: newNBV,
        });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    log.info({ companyId, month, year, assetsProcessed: results.length }, 'Batch depreciation completed');
    res.json({
      month,
      year,
      assetsProcessed: results.length,
      results,
    });
  }));

  // =====================================
  // Disposal
  // =====================================

  // Record disposal of an asset
  app.post("/api/fixed-assets/:id/dispose", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const existing = await pool.query(`SELECT * FROM fixed_assets WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Fixed asset not found' });
    }

    const asset = existing.rows[0];
    const hasAccess = await storage.hasCompanyAccess(userId, asset.company_id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (asset.status === 'disposed') {
      return res.status(400).json({ message: 'Asset is already disposed' });
    }

    const { disposalDate, disposalAmount, notes } = req.body;
    if (!disposalDate) {
      return res.status(400).json({ message: 'disposalDate is required' });
    }

    const dispAmount = parseFloat(disposalAmount || 0);
    const nbv = parseFloat(asset.net_book_value || 0);
    const purchaseCost = parseFloat(asset.purchase_cost || 0);
    const accumulatedDep = parseFloat(asset.accumulated_depreciation || 0);
    const gainLoss = Math.round((dispAmount - nbv) * 100) / 100;

    // Resolve disposal accounts
    const bankAccount = await storage.getAccountByCode(asset.company_id, ACCOUNT_CODES.BANK_ACCOUNTS);
    const accumDepAccount = await storage.getAccountByCode(asset.company_id, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);
    const fixedAssetsAccount = await storage.getAccountByCode(asset.company_id, ACCOUNT_CODES.FIXED_ASSETS);
    const gainOnDisposalAccount = await storage.getAccountByCode(asset.company_id, ACCOUNT_CODES.GAIN_ON_DISPOSAL);
    const lossOnDisposalAccount = await storage.getAccountByCode(asset.company_id, ACCOUNT_CODES.LOSS_ON_DISPOSAL);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fail-fast: required accounts must exist before creating any JE
      if (!fixedAssetsAccount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Fixed Assets account (1210) not found. Add it to your chart of accounts.' });
      }
      if (!accumDepAccount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Accumulated Depreciation account (1240) not found. Add it to your chart of accounts.' });
      }

      // Fiscal year guard
      await assertFiscalYearOpenPool(client, asset.company_id, new Date(disposalDate));

      // Fail-fast: validate disposal-specific accounts exist before creating JE
      if (dispAmount > 0 && !bankAccount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Bank account (1020) not found. Cannot record disposal proceeds.' });
      }
      if (gainLoss > 0 && !gainOnDisposalAccount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Gain on Disposal account (4080) not found.' });
      }
      if (gainLoss < 0 && !lossOnDisposalAccount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Loss on Disposal account (5140) not found.' });
      }

      // Update asset status
      await client.query(
        `UPDATE fixed_assets SET
          status = 'disposed',
          disposal_date = $1,
          disposal_amount = $2,
          notes = COALESCE($3, notes)
         WHERE id = $4`,
        [disposalDate, dispAmount, notes || null, id]
      );

      // Create disposal journal entry (accounts guaranteed non-null by fail-fast above)
      // Generate entry number inside the transaction (inline SQL to avoid Drizzle/pool mismatch)
      const disposalDateStr = new Date(disposalDate).toISOString().slice(0, 10).replace(/-/g, '');
      const disposalEntryNumResult = await client.query(
        `SELECT COUNT(*) as count FROM journal_entries WHERE company_id = $1 AND entry_number LIKE $2 FOR UPDATE`,
        [asset.company_id, `JE-${disposalDateStr}%`]
      );
      const disposalEntryCount = Number(disposalEntryNumResult.rows[0]?.count || 0);
      const entryNumber = `JE-${disposalDateStr}-${String(disposalEntryCount + 1).padStart(3, '0')}`;

      const jeResult = await client.query(
        `INSERT INTO journal_entries (company_id, entry_number, date, memo, status, source, source_id, created_by)
         VALUES ($1, $2, $3, $4, 'posted', 'disposal', $5, $6)
         RETURNING id`,
        [asset.company_id, entryNumber, disposalDate, `Asset disposal - ${asset.asset_name}`, asset.id, userId]
      );
      const jeId = jeResult.rows[0].id;

      // Debit: Bank for proceeds (if any)
      if (dispAmount > 0 && bankAccount) {
        await client.query(
          `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
           VALUES ($1, $2, $3, 0, $4)`,
          [jeId, bankAccount.id, dispAmount.toFixed(2), `Disposal proceeds - ${asset.asset_name}`]
        );
      }

      // Debit: Accumulated Depreciation (remove contra-asset)
      if (accumulatedDep > 0) {
        await client.query(
          `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
           VALUES ($1, $2, $3, 0, $4)`,
          [jeId, accumDepAccount.id, accumulatedDep.toFixed(2), `Remove accumulated depreciation - ${asset.asset_name}`]
        );
      }

      // Debit: Loss on Disposal (if loss)
      if (gainLoss < 0 && lossOnDisposalAccount) {
        await client.query(
          `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
           VALUES ($1, $2, $3, 0, $4)`,
          [jeId, lossOnDisposalAccount.id, Math.abs(gainLoss).toFixed(2), `Loss on disposal - ${asset.asset_name}`]
        );
      }

      // Credit: Fixed Assets (remove the asset at cost)
      await client.query(
        `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
         VALUES ($1, $2, 0, $3, $4)`,
        [jeId, fixedAssetsAccount.id, purchaseCost.toFixed(2), `Remove fixed asset - ${asset.asset_name}`]
      );

      // Credit: Gain on Disposal (if gain)
      if (gainLoss > 0 && gainOnDisposalAccount) {
        await client.query(
          `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
           VALUES ($1, $2, 0, $3, $4)`,
          [jeId, gainOnDisposalAccount.id, gainLoss.toFixed(2), `Gain on disposal - ${asset.asset_name}`]
        );
      }

      log.info({ assetId: id, journalEntryId: jeId, gainLoss }, 'Disposal journal entry created');

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.statusCode) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    } finally {
      client.release();
    }

    const updated = await pool.query(`SELECT * FROM fixed_assets WHERE id = $1`, [id]);
    log.info({ assetId: id, disposalAmount: dispAmount, gainLoss }, 'Asset disposed');
    res.json({
      asset: updated.rows[0],
      disposalAmount: dispAmount,
      netBookValueAtDisposal: nbv,
      gainLoss,
      gainLossType: gainLoss >= 0 ? 'gain' : 'loss',
    });
  }));

  // =====================================
  // Summary
  // =====================================

  // Get summary of fixed assets by category
  app.get("/api/companies/:companyId/fixed-assets/summary", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Overall totals
    const totalsResult = await pool.query(
      `SELECT
        COUNT(*) as total_assets,
        COALESCE(SUM(purchase_cost), 0) as total_cost,
        COALESCE(SUM(accumulated_depreciation), 0) as total_accumulated_depreciation,
        COALESCE(SUM(net_book_value), 0) as total_net_book_value
       FROM fixed_assets
       WHERE company_id = $1 AND status = 'active'`,
      [companyId]
    );

    // By category
    const categoryResult = await pool.query(
      `SELECT
        category,
        COUNT(*) as count,
        COALESCE(SUM(purchase_cost), 0) as total_cost,
        COALESCE(SUM(accumulated_depreciation), 0) as total_accumulated_depreciation,
        COALESCE(SUM(net_book_value), 0) as total_net_book_value
       FROM fixed_assets
       WHERE company_id = $1 AND status = 'active'
       GROUP BY category
       ORDER BY total_cost DESC`,
      [companyId]
    );

    const totals = totalsResult.rows[0];
    res.json({
      totalAssets: parseInt(totals.total_assets),
      totalCost: parseFloat(totals.total_cost),
      totalAccumulatedDepreciation: parseFloat(totals.total_accumulated_depreciation),
      totalNetBookValue: parseFloat(totals.total_net_book_value),
      byCategory: categoryResult.rows.map((row: any) => ({
        category: row.category,
        count: parseInt(row.count),
        totalCost: parseFloat(row.total_cost),
        totalAccumulatedDepreciation: parseFloat(row.total_accumulated_depreciation),
        totalNetBookValue: parseFloat(row.total_net_book_value),
      })),
    });
  }));
}
