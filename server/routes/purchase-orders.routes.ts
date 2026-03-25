import type { Express, Request, Response } from 'express';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { storage } from '../storage';
import { pool } from '../db';
import { createLogger } from '../config/logger';

const log = createLogger('purchase-orders');

/**
 * Generate a PO number: PO-YYYYMMDD-NNN
 */
async function generatePONumber(client: any, companyId: string): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PO-${dateStr}`;
  const countResult = await client.query(
    `SELECT COUNT(*) as count FROM purchase_orders WHERE company_id = $1 AND po_number LIKE $2`,
    [companyId, `${prefix}%`]
  );
  const count = Number(countResult.rows[0]?.count || 0);
  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}

/**
 * Calculate line totals: subtotal, vatAmount, total
 */
function calculateTotals(lines: any[]): { subtotal: number; vatAmount: number; total: number } {
  let subtotal = 0;
  let vatAmount = 0;

  for (const line of lines) {
    const qty = Number(line.quantity) || 1;
    const price = Number(line.unit_price) || 0;
    const lineAmount = qty * price;
    const lineVat = lineAmount * (Number(line.vat_rate) || 0.05);
    subtotal += lineAmount;
    vatAmount += lineVat;
  }

  return { subtotal, vatAmount, total: subtotal + vatAmount };
}

export function registerPurchaseOrderRoutes(app: Express) {
  // =====================================
  // Purchase Order CRUD
  // =====================================

  // List all POs for a company (with filters)
  app.get("/api/companies/:companyId/purchase-orders", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { status, vendor, dateFrom, dateTo } = req.query;

    let query = `SELECT * FROM purchase_orders WHERE company_id = $1`;
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
      query += ` AND date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      query += ` AND date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    query += ` ORDER BY date DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  }));

  // Get single PO with lines
  app.get("/api/companies/:companyId/purchase-orders/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const poResult = await pool.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );

    if (poResult.rows.length === 0) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    const linesResult = await pool.query(
      'SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1 ORDER BY id ASC',
      [id]
    );

    res.json({
      ...poResult.rows[0],
      lines: linesResult.rows,
    });
  }));

  // Create PO with lines
  app.post("/api/companies/:companyId/purchase-orders", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const {
      vendor_name,
      vendor_name_ar,
      vendor_email,
      vendor_trn,
      date,
      expected_delivery,
      currency,
      notes,
      lines,
    } = req.body;

    if (!vendor_name) {
      return res.status(400).json({ message: 'Vendor name is required' });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: 'At least one line item is required' });
    }

    const totals = calculateTotals(lines);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const poNumber = await generatePONumber(client, companyId);

      const poResult = await client.query(
        `INSERT INTO purchase_orders (
          company_id, po_number, vendor_name, vendor_name_ar, vendor_email, vendor_trn,
          date, expected_delivery, status, subtotal, vat_amount, total, currency, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          companyId,
          poNumber,
          vendor_name,
          vendor_name_ar || null,
          vendor_email || null,
          vendor_trn || null,
          date || new Date(),
          expected_delivery || null,
          totals.subtotal.toFixed(2),
          totals.vatAmount.toFixed(2),
          totals.total.toFixed(2),
          currency || 'AED',
          notes || null,
          userId,
        ]
      );

      const po = poResult.rows[0];

      // Insert line items
      const insertedLines = [];
      for (const line of lines) {
        const qty = Number(line.quantity) || 1;
        const price = Number(line.unit_price) || 0;
        const lineAmount = qty * price;

        const lineResult = await client.query(
          `INSERT INTO purchase_order_lines (
            purchase_order_id, product_id, description, quantity, unit_price, vat_rate, amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            po.id,
            line.product_id || null,
            line.description,
            qty,
            price.toFixed(2),
            Number(line.vat_rate) || 0.05,
            lineAmount.toFixed(2),
          ]
        );
        insertedLines.push(lineResult.rows[0]);
      }

      await client.query('COMMIT');

      log.info({ poId: po.id, companyId, poNumber }, 'Purchase order created');
      res.json({ ...po, lines: insertedLines });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  // Update PO (draft only)
  app.put("/api/companies/:companyId/purchase-orders/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const poResult = await pool.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );

    if (poResult.rows.length === 0) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    const po = poResult.rows[0];

    if (po.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft purchase orders can be edited' });
    }

    const {
      vendor_name,
      vendor_name_ar,
      vendor_email,
      vendor_trn,
      date,
      expected_delivery,
      currency,
      notes,
      lines,
    } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

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
      addUpdate('vendor_name_ar', vendor_name_ar);
      addUpdate('vendor_email', vendor_email);
      addUpdate('vendor_trn', vendor_trn);
      addUpdate('date', date);
      addUpdate('expected_delivery', expected_delivery);
      addUpdate('currency', currency);
      addUpdate('notes', notes);

      // If lines provided, recalculate totals and replace lines
      if (lines && Array.isArray(lines) && lines.length > 0) {
        const totals = calculateTotals(lines);
        addUpdate('subtotal', totals.subtotal.toFixed(2));
        addUpdate('vat_amount', totals.vatAmount.toFixed(2));
        addUpdate('total', totals.total.toFixed(2));
      }

      addUpdate('updated_at', new Date());

      let updatedPo = po;
      if (updates.length > 0) {
        values.push(id);
        const updateResult = await client.query(
          `UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
          values
        );
        updatedPo = updateResult.rows[0];
      }

      // Replace lines if provided
      if (lines && Array.isArray(lines) && lines.length > 0) {
        await client.query('DELETE FROM purchase_order_lines WHERE purchase_order_id = $1', [id]);

        for (const line of lines) {
          const qty = Number(line.quantity) || 1;
          const price = Number(line.unit_price) || 0;
          const lineAmount = qty * price;

          await client.query(
            `INSERT INTO purchase_order_lines (
              purchase_order_id, product_id, description, quantity, unit_price, vat_rate, amount
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
              line.product_id || null,
              line.description,
              qty,
              price.toFixed(2),
              Number(line.vat_rate) || 0.05,
              lineAmount.toFixed(2),
            ]
          );
        }
      }

      await client.query('COMMIT');

      // Fetch updated lines
      const linesResult = await pool.query(
        'SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1 ORDER BY id ASC',
        [id]
      );

      log.info({ poId: id }, 'Purchase order updated');
      res.json({ ...updatedPo, lines: linesResult.rows });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  // Delete PO (draft only)
  app.delete("/api/companies/:companyId/purchase-orders/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const poResult = await pool.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );

    if (poResult.rows.length === 0) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    if (poResult.rows[0].status !== 'draft') {
      return res.status(400).json({ message: 'Only draft purchase orders can be deleted' });
    }

    // Cascade delete handles purchase_order_lines
    await pool.query('DELETE FROM purchase_orders WHERE id = $1', [id]);

    log.info({ poId: id }, 'Purchase order deleted');
    res.json({ message: 'Purchase order deleted successfully' });
  }));

  // =====================================
  // Status Transitions
  // =====================================

  // Send PO (draft -> sent)
  app.post("/api/companies/:companyId/purchase-orders/:id/send", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const poResult = await pool.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );

    if (poResult.rows.length === 0) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    if (poResult.rows[0].status !== 'draft') {
      return res.status(400).json({ message: 'Only draft purchase orders can be sent' });
    }

    const updateResult = await pool.query(
      `UPDATE purchase_orders SET status = 'sent', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    log.info({ poId: id }, 'Purchase order sent');
    res.json(updateResult.rows[0]);
  }));

  // Receive goods
  app.post("/api/companies/:companyId/purchase-orders/:id/receive", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const poResult = await pool.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );

    if (poResult.rows.length === 0) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    const po = poResult.rows[0];

    if (!['sent', 'partial'].includes(po.status)) {
      return res.status(400).json({ message: 'Only sent or partially received purchase orders can receive goods' });
    }

    const { lines: receiveLines } = req.body;

    if (!receiveLines || !Array.isArray(receiveLines) || receiveLines.length === 0) {
      return res.status(400).json({ message: 'Receive lines are required: [{ lineId, receivedQuantity }]' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update each line's received quantity
      for (const rl of receiveLines) {
        if (!rl.lineId || rl.receivedQuantity === undefined) continue;

        const receivedQty = Number(rl.receivedQuantity);
        if (receivedQty < 0) continue;

        // Get current line
        const lineResult = await client.query(
          'SELECT * FROM purchase_order_lines WHERE id = $1 AND purchase_order_id = $2',
          [rl.lineId, id]
        );

        if (lineResult.rows.length === 0) continue;

        const line = lineResult.rows[0];
        const newReceivedQty = Number(line.received_quantity || 0) + receivedQty;
        const orderedQty = Number(line.quantity);

        // Don't exceed ordered quantity
        const clampedQty = Math.min(newReceivedQty, orderedQty);

        await client.query(
          'UPDATE purchase_order_lines SET received_quantity = $1 WHERE id = $2',
          [clampedQty, rl.lineId]
        );

        // Create inventory movement if product is linked
        if (line.product_id && receivedQty > 0) {
          await client.query(
            `INSERT INTO inventory_movements (product_id, company_id, type, quantity, unit_cost, reference)
             VALUES ($1, $2, 'purchase', $3, $4, $5)`,
            [
              line.product_id,
              companyId,
              Math.round(receivedQty),
              Number(line.unit_price) || 0,
              `PO ${po.po_number}`,
            ]
          );

          // Update product currentStock
          await client.query(
            `UPDATE products SET current_stock = current_stock + $1 WHERE id = $2`,
            [Math.round(receivedQty), line.product_id]
          );
        }
      }

      // Determine new PO status: check all lines
      const allLinesResult = await client.query(
        'SELECT quantity, received_quantity FROM purchase_order_lines WHERE purchase_order_id = $1',
        [id]
      );

      let allFullyReceived = true;
      let anyReceived = false;

      for (const line of allLinesResult.rows) {
        const ordered = Number(line.quantity);
        const received = Number(line.received_quantity || 0);
        if (received > 0) anyReceived = true;
        if (received < ordered) allFullyReceived = false;
      }

      let newStatus: string;
      if (allFullyReceived) {
        newStatus = 'received';
      } else if (anyReceived) {
        newStatus = 'partial';
      } else {
        newStatus = po.status; // no change
      }

      const updateResult = await client.query(
        `UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [newStatus, id]
      );

      await client.query('COMMIT');

      // Fetch updated lines
      const linesResult = await pool.query(
        'SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1 ORDER BY id ASC',
        [id]
      );

      log.info({ poId: id, newStatus }, 'Goods received against purchase order');
      res.json({ ...updateResult.rows[0], lines: linesResult.rows });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  // Convert PO to vendor bill
  app.post("/api/companies/:companyId/purchase-orders/:id/convert-to-bill", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const poResult = await pool.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );

    if (poResult.rows.length === 0) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    const po = poResult.rows[0];

    if (po.status === 'draft' || po.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot convert draft or cancelled purchase orders to a bill' });
    }

    // Get PO lines
    const linesResult = await pool.query(
      'SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1 ORDER BY id ASC',
      [id]
    );

    const poLines = linesResult.rows;

    if (poLines.length === 0) {
      return res.status(400).json({ message: 'Purchase order has no line items' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create vendor bill
      const billResult = await client.query(
        `INSERT INTO vendor_bills (
          company_id, vendor_name, vendor_trn, bill_number, bill_date, due_date,
          currency, subtotal, vat_amount, total_amount, amount_paid, status,
          notes
        ) VALUES ($1, $2, $3, $4, NOW(), NULL, $5, $6, $7, $8, '0.00', 'pending', $9)
        RETURNING *`,
        [
          companyId,
          po.vendor_name,
          po.vendor_trn || null,
          `From ${po.po_number}`,
          po.currency || 'AED',
          Number(po.subtotal).toFixed(2),
          Number(po.vat_amount).toFixed(2),
          Number(po.total).toFixed(2),
          `Converted from Purchase Order ${po.po_number}`,
        ]
      );

      const bill = billResult.rows[0];

      // Create bill line items from PO lines
      for (const line of poLines) {
        const lineAmount = (Number(line.quantity) || 1) * (Number(line.unit_price) || 0);
        // Convert vat_rate from decimal (0.05) to percentage (5) for bill_line_items
        const vatRatePercent = (Number(line.vat_rate) || 0.05) * 100;

        await client.query(
          `INSERT INTO bill_line_items (bill_id, description, quantity, unit_price, vat_rate, amount)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            bill.id,
            line.description,
            Number(line.quantity) || 1,
            Number(line.unit_price) || 0,
            vatRatePercent,
            lineAmount.toFixed(2),
          ]
        );
      }

      await client.query('COMMIT');

      log.info({ poId: id, billId: bill.id, poNumber: po.po_number }, 'Purchase order converted to vendor bill');
      res.json({ bill, source_po: po.po_number });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  // Cancel PO
  app.post("/api/companies/:companyId/purchase-orders/:id/cancel", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId, id } = req.params;
    const userId = (req as any).user?.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const poResult = await pool.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );

    if (poResult.rows.length === 0) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    if (poResult.rows[0].status === 'received') {
      return res.status(400).json({ message: 'Cannot cancel a fully received purchase order' });
    }

    if (poResult.rows[0].status === 'cancelled') {
      return res.status(400).json({ message: 'Purchase order is already cancelled' });
    }

    const updateResult = await pool.query(
      `UPDATE purchase_orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    log.info({ poId: id }, 'Purchase order cancelled');
    res.json(updateResult.rows[0]);
  }));
}
