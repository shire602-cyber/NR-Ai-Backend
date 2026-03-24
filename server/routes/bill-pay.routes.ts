import type { Express, Request, Response } from 'express';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { storage } from '../storage';
import { pool } from '../db';
import { createLogger } from '../config/logger';
import { ACCOUNT_CODES } from '../lib/account-codes';
import { assertFiscalYearOpenPool } from '../lib/fiscal-year-guard';

const log = createLogger('bill-pay');

export function registerBillPayRoutes(app: Express) {
  // =====================================
  // Vendor Bill Routes
  // =====================================

  // List all bills for a company (with filters)
  app.get("/api/companies/:companyId/bills", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { status, vendor, dateFrom, dateTo } = req.query;

    let query = `
      SELECT * FROM vendor_bills
      WHERE company_id = $1
    `;
    const params: any[] = [companyId];
    let paramIndex = 2;

    if (status && status !== 'all') {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (vendor) {
      query += ` AND vendor_name ILIKE $${paramIndex}`;
      params.push(`%${vendor}%`);
      paramIndex++;
    }

    if (dateFrom) {
      query += ` AND bill_date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      query += ` AND bill_date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    query += ` ORDER BY bill_date DESC`;

    const result = await pool.query(query, params);

    // Mark overdue bills
    const now = new Date();
    const bills = result.rows.map((bill: any) => {
      if (
        bill.due_date &&
        new Date(bill.due_date) < now &&
        bill.status !== 'paid' &&
        bill.status !== 'overdue'
      ) {
        return { ...bill, status: 'overdue' };
      }
      return bill;
    });

    res.json(bills);
  }));

  // Get single bill with line items and payments
  app.get("/api/bills/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    const billResult = await pool.query(
      'SELECT * FROM vendor_bills WHERE id = $1',
      [id]
    );

    if (billResult.rows.length === 0) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    const bill = billResult.rows[0];

    const hasAccess = await storage.hasCompanyAccess(userId, bill.company_id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const linesResult = await pool.query(
      'SELECT * FROM bill_line_items WHERE bill_id = $1 ORDER BY created_at ASC',
      [id]
    );

    const paymentsResult = await pool.query(
      'SELECT * FROM bill_payments WHERE bill_id = $1 ORDER BY payment_date DESC',
      [id]
    );

    res.json({
      ...bill,
      line_items: linesResult.rows,
      payments: paymentsResult.rows,
    });
  }));

  // Create bill with line items
  app.post("/api/companies/:companyId/bills", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const {
      vendor_name,
      vendor_trn,
      bill_number,
      bill_date,
      due_date,
      currency,
      category,
      notes,
      attachment_url,
      line_items,
    } = req.body;

    if (!vendor_name || !bill_date) {
      return res.status(400).json({ message: 'Vendor name and bill date are required' });
    }

    if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
      return res.status(400).json({ message: 'At least one line item is required' });
    }

    // Calculate totals from line items
    let subtotal = 0;
    let vatAmount = 0;

    for (const line of line_items) {
      const lineAmount = (Number(line.quantity) || 1) * Number(line.unit_price);
      const lineVat = lineAmount * ((Number(line.vat_rate) || 5) / 100);
      subtotal += lineAmount;
      vatAmount += lineVat;
    }

    const totalAmount = subtotal + vatAmount;

    const billResult = await pool.query(
      `INSERT INTO vendor_bills (
        company_id, vendor_name, vendor_trn, bill_number, bill_date, due_date,
        currency, subtotal, vat_amount, total_amount, amount_paid, status,
        category, notes, attachment_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        companyId,
        vendor_name,
        vendor_trn || null,
        bill_number || null,
        bill_date,
        due_date || null,
        currency || 'AED',
        subtotal.toFixed(2),
        vatAmount.toFixed(2),
        totalAmount.toFixed(2),
        '0.00',
        'pending',
        category || null,
        notes || null,
        attachment_url || null,
      ]
    );

    const bill = billResult.rows[0];

    // Create line items
    for (const line of line_items) {
      const lineAmount = (Number(line.quantity) || 1) * Number(line.unit_price);
      await pool.query(
        `INSERT INTO bill_line_items (bill_id, description, quantity, unit_price, vat_rate, amount, account_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          bill.id,
          line.description,
          Number(line.quantity) || 1,
          Number(line.unit_price),
          Number(line.vat_rate) ?? 5,
          lineAmount.toFixed(2),
          line.account_id || null,
        ]
      );
    }

    log.info({ billId: bill.id, companyId }, 'Vendor bill created');
    res.json(bill);
  }));

  // Update bill
  app.patch("/api/bills/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    const billResult = await pool.query(
      'SELECT * FROM vendor_bills WHERE id = $1',
      [id]
    );

    if (billResult.rows.length === 0) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    const bill = billResult.rows[0];

    const hasAccess = await storage.hasCompanyAccess(userId, bill.company_id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const {
      vendor_name,
      vendor_trn,
      bill_number,
      bill_date,
      due_date,
      currency,
      category,
      notes,
      attachment_url,
      line_items,
    } = req.body;

    // Build dynamic update
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    const addUpdate = (field: string, value: any) => {
      if (value !== undefined) {
        updates.push(`${field} = $${paramIdx}`);
        values.push(value);
        paramIdx++;
      }
    };

    addUpdate('vendor_name', vendor_name);
    addUpdate('vendor_trn', vendor_trn);
    addUpdate('bill_number', bill_number);
    addUpdate('bill_date', bill_date);
    addUpdate('due_date', due_date);
    addUpdate('currency', currency);
    addUpdate('category', category);
    addUpdate('notes', notes);
    addUpdate('attachment_url', attachment_url);

    // If line_items provided, recalculate totals
    if (line_items && Array.isArray(line_items) && line_items.length > 0) {
      let subtotal = 0;
      let vatAmount = 0;

      for (const line of line_items) {
        const lineAmount = (Number(line.quantity) || 1) * Number(line.unit_price);
        const lineVat = lineAmount * ((Number(line.vat_rate) || 5) / 100);
        subtotal += lineAmount;
        vatAmount += lineVat;
      }

      const totalAmount = subtotal + vatAmount;

      addUpdate('subtotal', subtotal.toFixed(2));
      addUpdate('vat_amount', vatAmount.toFixed(2));
      addUpdate('total_amount', totalAmount.toFixed(2));
    }

    if (updates.length === 0 && !line_items) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    let updatedBill = bill;
    if (updates.length > 0) {
      values.push(id);
      const updateResult = await pool.query(
        `UPDATE vendor_bills SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
        values
      );
      updatedBill = updateResult.rows[0];
    }

    // Replace line items if provided
    if (line_items && Array.isArray(line_items) && line_items.length > 0) {
      await pool.query('DELETE FROM bill_line_items WHERE bill_id = $1', [id]);

      for (const line of line_items) {
        const lineAmount = (Number(line.quantity) || 1) * Number(line.unit_price);
        await pool.query(
          `INSERT INTO bill_line_items (bill_id, description, quantity, unit_price, vat_rate, amount, account_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id,
            line.description,
            Number(line.quantity) || 1,
            Number(line.unit_price),
            Number(line.vat_rate) ?? 5,
            lineAmount.toFixed(2),
            line.account_id || null,
          ]
        );
      }
    }

    log.info({ billId: id }, 'Vendor bill updated');
    res.json(updatedBill);
  }));

  // Delete bill
  app.delete("/api/bills/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    const billResult = await pool.query(
      'SELECT * FROM vendor_bills WHERE id = $1',
      [id]
    );

    if (billResult.rows.length === 0) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    const bill = billResult.rows[0];

    const hasAccess = await storage.hasCompanyAccess(userId, bill.company_id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Cascade delete will handle line_items and payments
    await pool.query('DELETE FROM vendor_bills WHERE id = $1', [id]);

    log.info({ billId: id }, 'Vendor bill deleted');
    res.json({ message: 'Bill deleted successfully' });
  }));

  // Approve bill
  app.post("/api/bills/:id/approve", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    const billResult = await pool.query(
      'SELECT * FROM vendor_bills WHERE id = $1',
      [id]
    );

    if (billResult.rows.length === 0) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    const bill = billResult.rows[0];

    const hasAccess = await storage.hasCompanyAccess(userId, bill.company_id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (bill.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending bills can be approved' });
    }

    const billDate = new Date(bill.bill_date);

    // Use pool transaction for JE creation (matches existing pattern)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fiscal year guard
      await assertFiscalYearOpenPool(client, bill.company_id, billDate);

      // Update bill status to approved
      const updateResult = await client.query(
        `UPDATE vendor_bills
         SET status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE id = $2 RETURNING *`,
        [userId, id]
      );

      // Generate entry number for the journal entry
      const entryNumber = await storage.generateEntryNumber(bill.company_id, billDate);

      // Look up required accounts
      const apAccount = await storage.getAccountByCode(bill.company_id, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
      const vatReceivableAccount = await storage.getAccountByCode(bill.company_id, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);

      if (!apAccount) {
        throw Object.assign(
          new Error(`Accounts Payable account (${ACCOUNT_CODES.ACCOUNTS_PAYABLE}) not found for company ${bill.company_id}`),
          { statusCode: 500 }
        );
      }

      // Create journal entry: source "bill", sourceId = bill.id
      const jeResult = await client.query(
        `INSERT INTO journal_entries (company_id, entry_number, date, memo, status, source, source_id, created_by)
         VALUES ($1, $2, $3, $4, 'draft', 'bill', $5, $6)
         RETURNING id`,
        [bill.company_id, entryNumber, billDate, `Vendor Bill ${bill.bill_number || ''} - ${bill.vendor_name}`, id, userId]
      );
      const jeId = jeResult.rows[0].id;

      // Fetch bill line items for individual expense debits
      const linesResult = await client.query(
        'SELECT * FROM bill_line_items WHERE bill_id = $1',
        [id]
      );

      const billLines = linesResult.rows;

      const missingAccounts = billLines.filter((l: any) => !l.account_id);
      if (missingAccounts.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `${missingAccounts.length} line item(s) have no account assigned. All lines must have an account before approval.`
        });
      }

      const subtotal = Number(bill.subtotal) || 0;
      const vatAmount = Number(bill.vat_amount) || 0;
      const totalAmount = Number(bill.total_amount) || 0;

      // Debit each expense account from bill line items
      for (const line of billLines) {
        const lineAmount = Number(line.amount) || 0;
        if (lineAmount <= 0) continue;

        // Use the line's account_id if provided, otherwise skip (no default expense account)
        if (line.account_id) {
          await client.query(
            `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
             VALUES ($1, $2, $3, 0, $4)`,
            [jeId, line.account_id, lineAmount.toFixed(2), line.description || `Bill expense - ${bill.vendor_name}`]
          );
        }
      }

      // Debit VAT Receivable (Input) if VAT > 0
      if (vatAmount > 0 && vatReceivableAccount) {
        await client.query(
          `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
           VALUES ($1, $2, $3, 0, $4)`,
          [jeId, vatReceivableAccount.id, vatAmount.toFixed(2), `VAT input - Bill ${bill.bill_number || bill.vendor_name}`]
        );
      }

      // Credit Accounts Payable for the total
      await client.query(
        `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
         VALUES ($1, $2, 0, $3, $4)`,
        [jeId, apAccount.id, totalAmount.toFixed(2), `A/P - Bill ${bill.bill_number || bill.vendor_name}`]
      );

      await client.query('COMMIT');

      log.info({ billId: id, approvedBy: userId, journalEntryId: jeId }, 'Vendor bill approved with GL entry');
      res.json(updateResult.rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.statusCode) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    } finally {
      client.release();
    }
  }));

  // Record payment against bill
  app.post("/api/bills/:id/payments", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    const billResult = await pool.query(
      'SELECT * FROM vendor_bills WHERE id = $1',
      [id]
    );

    if (billResult.rows.length === 0) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    const bill = billResult.rows[0];

    const hasAccess = await storage.hasCompanyAccess(userId, bill.company_id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { payment_date, amount, payment_method, reference, notes } = req.body;

    if (!payment_date || !amount) {
      return res.status(400).json({ message: 'Payment date and amount are required' });
    }

    const paymentAmount = Number(amount);
    if (paymentAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be positive' });
    }

    const currentPaid = Number(bill.amount_paid) || 0;
    const totalAmount = Number(bill.total_amount) || 0;
    const remainingBalance = totalAmount - currentPaid;

    if (paymentAmount > remainingBalance + 0.01) {
      return res.status(400).json({
        message: `Payment amount (${paymentAmount.toFixed(2)}) exceeds remaining balance (${remainingBalance.toFixed(2)})`,
      });
    }

    const paymentDateObj = new Date(payment_date);

    // Use pool transaction for payment + JE creation
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fiscal year guard
      await assertFiscalYearOpenPool(client, bill.company_id, paymentDateObj);

      // Record the payment
      const paymentResult = await client.query(
        `INSERT INTO bill_payments (bill_id, payment_date, amount, payment_method, reference, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          id,
          payment_date,
          paymentAmount.toFixed(2),
          payment_method || 'bank_transfer',
          reference || null,
          notes || null,
        ]
      );

      // Update bill amount_paid and status
      const newAmountPaid = currentPaid + paymentAmount;
      let newStatus: string;

      if (newAmountPaid >= totalAmount - 0.01) {
        newStatus = 'paid';
      } else {
        newStatus = 'partial';
      }

      await client.query(
        `UPDATE vendor_bills
         SET amount_paid = $1, status = $2, paid_at = ${newStatus === 'paid' ? 'NOW()' : 'paid_at'}
         WHERE id = $3`,
        [newAmountPaid.toFixed(2), newStatus, id]
      );

      // Create payment journal entry: Debit AP, Credit Bank
      const apAccount = await storage.getAccountByCode(bill.company_id, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
      const bankAccount = await storage.getAccountByCode(bill.company_id, ACCOUNT_CODES.BANK_ACCOUNTS);

      if (!apAccount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Accounts Payable account (2010) not found. Add it to your chart of accounts.' });
      }
      if (!bankAccount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Bank account (1020) not found. Add it to your chart of accounts.' });
      }

      const entryNumber = await storage.generateEntryNumber(bill.company_id, paymentDateObj);

      const jeResult = await client.query(
        `INSERT INTO journal_entries (company_id, entry_number, date, memo, status, source, source_id, created_by)
           VALUES ($1, $2, $3, $4, 'draft', 'payment', $5, $6)
           RETURNING id`,
        [bill.company_id, entryNumber, paymentDateObj, `Bill payment - ${bill.vendor_name} (${bill.bill_number || id})`, id, userId]
      );
      const jeId = jeResult.rows[0].id;

      // Debit: Accounts Payable
      await client.query(
        `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
           VALUES ($1, $2, $3, 0, $4)`,
        [jeId, apAccount.id, paymentAmount.toFixed(2), `Bill payment - ${bill.vendor_name}`]
      );

      // Credit: Bank Account
      await client.query(
        `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
           VALUES ($1, $2, 0, $3, $4)`,
        [jeId, bankAccount.id, paymentAmount.toFixed(2), `Bill payment - ${bill.vendor_name}`]
      );

      log.info({ billId: id, paymentId: paymentResult.rows[0].id, journalEntryId: jeId, amount: paymentAmount, newStatus }, 'Bill payment recorded with GL entry');

      await client.query('COMMIT');

      res.json({
        payment: paymentResult.rows[0],
        bill_status: newStatus,
        amount_paid: newAmountPaid,
        remaining: totalAmount - newAmountPaid,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.statusCode) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    } finally {
      client.release();
    }
  }));

  // =====================================
  // Summary & Reports
  // =====================================

  // Bills summary (totals by status)
  app.get("/api/companies/:companyId/bills/summary", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0) AS pending_total,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'approved'), 0) AS approved_total,
        COUNT(*) FILTER (WHERE status = 'partial') AS partial_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'partial'), 0) AS partial_total,
        COALESCE(SUM(amount_paid) FILTER (WHERE status = 'partial'), 0) AS partial_paid,
        COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0) AS paid_total,
        COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('paid')) AS overdue_count,
        COALESCE(SUM(total_amount - amount_paid) FILTER (WHERE due_date < NOW() AND status NOT IN ('paid')), 0) AS overdue_total
      FROM vendor_bills
      WHERE company_id = $1`,
      [companyId]
    );

    const summary = result.rows[0];

    res.json({
      pending: { count: Number(summary.pending_count), total: Number(summary.pending_total) },
      approved: { count: Number(summary.approved_count), total: Number(summary.approved_total) },
      partial: { count: Number(summary.partial_count), total: Number(summary.partial_total), paid: Number(summary.partial_paid) },
      paid: { count: Number(summary.paid_count), total: Number(summary.paid_total) },
      overdue: { count: Number(summary.overdue_count), total: Number(summary.overdue_total) },
    });
  }));

  // Aging report
  app.get("/api/companies/:companyId/bills/aging", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT
        COALESCE(SUM(total_amount - amount_paid) FILTER (
          WHERE due_date >= NOW() OR due_date IS NULL
        ), 0) AS current_amount,
        COUNT(*) FILTER (
          WHERE due_date >= NOW() OR due_date IS NULL
        ) AS current_count,
        COALESCE(SUM(total_amount - amount_paid) FILTER (
          WHERE due_date < NOW() AND due_date >= NOW() - INTERVAL '30 days'
        ), 0) AS days_1_30_amount,
        COUNT(*) FILTER (
          WHERE due_date < NOW() AND due_date >= NOW() - INTERVAL '30 days'
        ) AS days_1_30_count,
        COALESCE(SUM(total_amount - amount_paid) FILTER (
          WHERE due_date < NOW() - INTERVAL '30 days' AND due_date >= NOW() - INTERVAL '60 days'
        ), 0) AS days_31_60_amount,
        COUNT(*) FILTER (
          WHERE due_date < NOW() - INTERVAL '30 days' AND due_date >= NOW() - INTERVAL '60 days'
        ) AS days_31_60_count,
        COALESCE(SUM(total_amount - amount_paid) FILTER (
          WHERE due_date < NOW() - INTERVAL '60 days' AND due_date >= NOW() - INTERVAL '90 days'
        ), 0) AS days_61_90_amount,
        COUNT(*) FILTER (
          WHERE due_date < NOW() - INTERVAL '60 days' AND due_date >= NOW() - INTERVAL '90 days'
        ) AS days_61_90_count,
        COALESCE(SUM(total_amount - amount_paid) FILTER (
          WHERE due_date < NOW() - INTERVAL '90 days'
        ), 0) AS days_90_plus_amount,
        COUNT(*) FILTER (
          WHERE due_date < NOW() - INTERVAL '90 days'
        ) AS days_90_plus_count
      FROM vendor_bills
      WHERE company_id = $1 AND status NOT IN ('paid')`,
      [companyId]
    );

    const aging = result.rows[0];

    res.json({
      current: { amount: Number(aging.current_amount), count: Number(aging.current_count) },
      days_1_30: { amount: Number(aging.days_1_30_amount), count: Number(aging.days_1_30_count) },
      days_31_60: { amount: Number(aging.days_31_60_amount), count: Number(aging.days_31_60_count) },
      days_61_90: { amount: Number(aging.days_61_90_amount), count: Number(aging.days_61_90_count) },
      days_90_plus: { amount: Number(aging.days_90_plus_amount), count: Number(aging.days_90_plus_count) },
    });
  }));
}
