import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { pool } from "../db";
import { authMiddleware } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

/**
 * Register advanced report routes (trial balance, cash flow, aging, period comparison, GL, equity changes).
 */
export function registerReportRoutes(app: Express) {
  // =====================================
  // TRIAL BALANCE
  // =====================================

  app.get("/api/reports/:companyId/trial-balance", authMiddleware, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { companyId } = req.params;
    const { startDate, endDate } = req.query;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const accounts = await storage.getAccountsByCompanyId(companyId);
    let entries = await storage.getJournalEntriesByCompanyId(companyId);

    // Only include posted entries
    entries = entries.filter(e => e.status === 'posted');

    // Filter by date range if provided
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate as string) : null;
      const end = endDate ? new Date(endDate as string) : null;
      entries = entries.filter(entry => {
        const entryDate = new Date(entry.date);
        if (start && entryDate < start) return false;
        if (end && entryDate > end) return false;
        return true;
      });
    }

    // Accumulate per-account debit and credit totals
    const debitTotals = new Map<string, number>();
    const creditTotals = new Map<string, number>();

    for (const entry of entries) {
      const lines = await storage.getJournalLinesByEntryId(entry.id);
      for (const line of lines) {
        debitTotals.set(line.accountId, (debitTotals.get(line.accountId) || 0) + Number(line.debit));
        creditTotals.set(line.accountId, (creditTotals.get(line.accountId) || 0) + Number(line.credit));
      }
    }

    const trialBalanceAccounts = accounts
      .map(a => ({
        accountId: a.id,
        accountName: a.nameEn,
        accountCode: a.code,
        debitTotal: debitTotals.get(a.id) || 0,
        creditTotal: creditTotals.get(a.id) || 0,
      }))
      .filter(a => a.debitTotal > 0 || a.creditTotal > 0);

    const grandTotalDebits = trialBalanceAccounts.reduce((sum, a) => sum + a.debitTotal, 0);
    const grandTotalCredits = trialBalanceAccounts.reduce((sum, a) => sum + a.creditTotal, 0);

    res.json({
      accounts: trialBalanceAccounts,
      grandTotalDebits,
      grandTotalCredits,
    });
  }));

  // =====================================
  // ADVANCED REPORTS
  // =====================================

  // Cash flow report - properly separated into operating, investing, and financing activities
  app.get("/api/reports/:companyId/cash-flow/:period?", authMiddleware, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { companyId, period: pathPeriod } = req.params;
    const period = pathPeriod || req.query.period || 'quarter'; // Support path segment, query param, or default
    const { startDate: qStart, endDate: qEnd } = req.query;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const allEntries = await storage.getJournalEntriesByCompanyId(companyId);
    const accounts = await storage.getAccountsByCompanyId(companyId);

    // Build account lookup for fast access
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    /**
     * Classify an account into a cash-flow activity section.
     *
     * Operating: income, expense, current assets (receivable, inventory, VAT), current liabilities
     * Investing: fixed assets (subType 'fixed_asset' or code starting with '15'/'16'), investment accounts
     * Financing: equity accounts, long-term liabilities (loans, debt)
     *
     * Returns 'operating' | 'investing' | 'financing' | null (null = cash/bank account itself, skip)
     */
    function classifyAccount(account: { type: string; subType: string | null; code: string; isVatAccount: boolean }): 'operating' | 'investing' | 'financing' | null {
      const { type, subType, code } = account;

      // Skip cash/bank accounts themselves (they are the "cash" being reported on)
      // Typically codes starting with '10' (cash & cash equivalents)
      if (type === 'asset' && (code.startsWith('10') || code.startsWith('11'))) {
        return null;
      }

      // --- INVESTING ---
      // Fixed assets (property, equipment, vehicles, etc.)
      if (subType === 'fixed_asset') return 'investing';
      if (type === 'asset' && (code.startsWith('15') || code.startsWith('16'))) return 'investing';

      // --- FINANCING ---
      // Equity accounts (share capital, retained earnings, owner draws)
      if (type === 'equity') return 'financing';
      // Long-term liabilities (loans, bonds, long-term debt)
      if (subType === 'long_term_liability') return 'financing';
      if (type === 'liability' && (code.startsWith('25') || code.startsWith('26') || code.startsWith('27'))) return 'financing';

      // --- OPERATING ---
      // Income accounts
      if (type === 'income') return 'operating';
      // Expense accounts
      if (type === 'expense') return 'operating';
      // Current assets (accounts receivable, inventory, prepayments, VAT input)
      if (type === 'asset' && (subType === 'current_asset' || !subType)) return 'operating';
      // Current liabilities (accounts payable, VAT payable, accrued expenses)
      if (type === 'liability' && (subType === 'current_liability' || !subType)) return 'operating';

      // Fallback to operating for anything else
      return 'operating';
    }

    // Determine date range from query params or period-based default
    const now = new Date();
    let rangeStart: Date;
    let rangeEnd: Date;

    if (qStart || qEnd) {
      rangeStart = qStart ? new Date(qStart as string) : new Date(0);
      rangeEnd = qEnd ? new Date(qEnd as string) : now;
    } else {
      rangeEnd = now;
      switch (period) {
        case 'month':
          rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          rangeStart = new Date(now.getFullYear(), 0, 1);
          break;
        default: // quarter
          rangeStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      }
    }

    // Filter to posted entries within the date range
    const periodEntries = allEntries.filter(e => {
      if (e.status !== 'posted') return false;
      const d = new Date(e.date);
      return d >= rangeStart && d <= rangeEnd;
    });

    // Accumulators for each section
    const operating = { inflow: 0, outflow: 0, items: [] as { accountId: string; accountName: string; accountCode: string; amount: number }[] };
    const investing = { inflow: 0, outflow: 0, items: [] as { accountId: string; accountName: string; accountCode: string; amount: number }[] };
    const financing = { inflow: 0, outflow: 0, items: [] as { accountId: string; accountName: string; accountCode: string; amount: number }[] };

    // Per-account net amounts (to build itemized breakdown)
    const accountNets = new Map<string, number>();

    for (const entry of periodEntries) {
      const lines = await storage.getJournalLinesByEntryId(entry.id);
      for (const line of lines) {
        const account = accountMap.get(line.accountId);
        if (!account) continue;

        const section = classifyAccount(account);
        if (section === null) continue; // skip cash/bank accounts

        const debit = Number(line.debit);
        const credit = Number(line.credit);

        // For the cash flow statement, we care about the net cash effect.
        // A credit to income = cash inflow; a debit to expense = cash outflow.
        // For balance sheet accounts (assets, liabilities, equity), the direction
        // depends on whether cash went in or out:
        //   - Debit to an asset (non-cash) = cash outflow (we spent cash to get the asset)
        //   - Credit to a liability = cash inflow (we received cash via a loan)
        //   - Debit to a liability = cash outflow (we paid down the liability)
        //   - Credit to equity = cash inflow (capital contribution)
        //   - Debit to equity = cash outflow (owner withdrawal/dividend)
        let cashEffect = 0;
        switch (account.type) {
          case 'income':
            // Income credited = cash inflow
            cashEffect = credit - debit;
            break;
          case 'expense':
            // Expense debited = cash outflow (negative cash effect)
            cashEffect = credit - debit;
            break;
          case 'asset':
            // Non-cash asset increase (debit) = we spent cash => negative
            // Non-cash asset decrease (credit) = we received cash => positive
            cashEffect = credit - debit;
            break;
          case 'liability':
            // Liability increase (credit) = cash inflow
            // Liability decrease (debit) = cash outflow
            cashEffect = credit - debit;
            break;
          case 'equity':
            // Equity increase (credit) = cash inflow (capital contribution)
            // Equity decrease (debit) = cash outflow (withdrawal)
            cashEffect = credit - debit;
            break;
        }

        // Accumulate per-account net
        accountNets.set(account.id, (accountNets.get(account.id) || 0) + cashEffect);

        // Accumulate section totals
        const sectionData = section === 'operating' ? operating : section === 'investing' ? investing : financing;
        if (cashEffect > 0) {
          sectionData.inflow += cashEffect;
        } else {
          sectionData.outflow += Math.abs(cashEffect);
        }
      }
    }

    // Build itemized breakdown per section
    for (const [accountId, net] of accountNets) {
      const account = accountMap.get(accountId);
      if (!account) continue;
      const section = classifyAccount(account);
      if (section === null) continue;

      const sectionData = section === 'operating' ? operating : section === 'investing' ? investing : financing;
      sectionData.items.push({
        accountId: account.id,
        accountName: account.nameEn,
        accountCode: account.code,
        amount: net,
      });
    }

    // Sort items by account code within each section
    operating.items.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    investing.items.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    financing.items.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const netOperating = operating.inflow - operating.outflow;
    const netInvesting = investing.inflow - investing.outflow;
    const netFinancing = financing.inflow - financing.outflow;
    const netChangeInCash = netOperating + netInvesting + netFinancing;

    res.json({
      period: {
        startDate: rangeStart.toISOString().split('T')[0],
        endDate: rangeEnd.toISOString().split('T')[0],
        type: qStart || qEnd ? 'custom' : period,
      },
      operating: {
        inflow: operating.inflow,
        outflow: operating.outflow,
        net: netOperating,
        items: operating.items,
      },
      investing: {
        inflow: investing.inflow,
        outflow: investing.outflow,
        net: netInvesting,
        items: investing.items,
      },
      financing: {
        inflow: financing.inflow,
        outflow: financing.outflow,
        net: netFinancing,
        items: financing.items,
      },
      netChangeInCash,
    });
  }));

  // Aging report — returns both receivables (from invoices) and payables (from vendor bills)
  app.get("/api/reports/:companyId/aging", authMiddleware, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { companyId } = req.params;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const now = new Date();

    // ---- RECEIVABLES (from invoices) ----
    const invoices = await storage.getInvoicesByCompanyId(companyId);
    const unpaidInvoices = invoices.filter(inv => inv.status !== 'paid' && inv.status !== 'void');
    const customerTotals: Record<string, any> = {};

    for (const inv of unpaidInvoices) {
      const invDate = new Date(inv.date);
      const daysOld = Math.floor((now.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));

      if (!customerTotals[inv.customerName]) {
        customerTotals[inv.customerName] = {
          id: inv.id,
          name: inv.customerName,
          type: 'receivable',
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          over90: 0,
          total: 0,
        };
      }

      const customer = customerTotals[inv.customerName];
      const invTotal = Number(inv.total);
      customer.total += invTotal;

      if (daysOld <= 0) {
        customer.current += invTotal;
      } else if (daysOld <= 30) {
        customer.days30 += invTotal;
      } else if (daysOld <= 60) {
        customer.days60 += invTotal;
      } else if (daysOld <= 90) {
        customer.days90 += invTotal;
      } else {
        customer.over90 += invTotal;
      }
    }

    const receivables = Object.values(customerTotals);

    // ---- PAYABLES (from vendor bills) ----
    const billsResult = await pool.query(
      `SELECT id, vendor_name, total_amount, amount_paid, due_date, bill_date
       FROM vendor_bills
       WHERE company_id = $1 AND status NOT IN ('paid')`,
      [companyId]
    );

    const vendorTotals: Record<string, any> = {};

    for (const bill of billsResult.rows) {
      const outstanding = Number(bill.total_amount) - Number(bill.amount_paid);
      if (outstanding <= 0) continue;

      const referenceDate = bill.due_date ? new Date(bill.due_date) : new Date(bill.bill_date);
      const daysOld = Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));

      if (!vendorTotals[bill.vendor_name]) {
        vendorTotals[bill.vendor_name] = {
          id: bill.id,
          name: bill.vendor_name,
          type: 'payable',
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          over90: 0,
          total: 0,
        };
      }

      const vendor = vendorTotals[bill.vendor_name];
      vendor.total += outstanding;

      if (daysOld <= 0) {
        vendor.current += outstanding;
      } else if (daysOld <= 30) {
        vendor.days30 += outstanding;
      } else if (daysOld <= 60) {
        vendor.days60 += outstanding;
      } else if (daysOld <= 90) {
        vendor.days90 += outstanding;
      } else {
        vendor.over90 += outstanding;
      }
    }

    const payables = Object.values(vendorTotals);

    res.json({ receivables, payables });
  }));

  // Period comparison report - supports both path segment and query param for period
  app.get("/api/reports/:companyId/comparison/:period?", authMiddleware, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { companyId, period: pathPeriod } = req.params;
    const period = pathPeriod || req.query.period || 'quarter';

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const invoices = await storage.getInvoicesByCompanyId(companyId);
    const receipts = await storage.getReceiptsByCompanyId(companyId);

    const now = new Date();
    let currentStart: Date, currentEnd: Date, previousStart: Date, previousEnd: Date;

    if (period === 'month') {
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      previousEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (period === 'year') {
      currentStart = new Date(now.getFullYear(), 0, 1);
      currentEnd = new Date(now.getFullYear(), 11, 31);
      previousStart = new Date(now.getFullYear() - 1, 0, 1);
      previousEnd = new Date(now.getFullYear() - 1, 11, 31);
    } else { // quarter
      const currentQ = Math.floor(now.getMonth() / 3);
      currentStart = new Date(now.getFullYear(), currentQ * 3, 1);
      currentEnd = new Date(now.getFullYear(), (currentQ + 1) * 3, 0);
      previousStart = new Date(now.getFullYear(), (currentQ - 1) * 3, 1);
      previousEnd = new Date(now.getFullYear(), currentQ * 3, 0);
    }

    const currentInvoices = invoices.filter(inv => {
      const d = new Date(inv.date);
      return d >= currentStart && d <= currentEnd;
    });
    const previousInvoices = invoices.filter(inv => {
      const d = new Date(inv.date);
      return d >= previousStart && d <= previousEnd;
    });

    const currentReceipts = receipts.filter(rec => {
      const d = new Date(rec.date || rec.createdAt);
      return d >= currentStart && d <= currentEnd;
    });
    const previousReceipts = receipts.filter(rec => {
      const d = new Date(rec.date || rec.createdAt);
      return d >= previousStart && d <= previousEnd;
    });

    const currentRevenue = currentInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    const previousRevenue = previousInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    const currentExpenses = currentReceipts.reduce((sum, rec) => sum + (Number(rec.amount) || 0), 0);
    const previousExpenses = previousReceipts.reduce((sum, rec) => sum + (Number(rec.amount) || 0), 0);

    const comparison = [
      {
        metric: 'Total Revenue',
        current: currentRevenue,
        previous: previousRevenue,
        change: currentRevenue - previousRevenue,
        changePercent: previousRevenue ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0,
      },
      {
        metric: 'Total Expenses',
        current: currentExpenses,
        previous: previousExpenses,
        change: currentExpenses - previousExpenses,
        changePercent: previousExpenses ? ((currentExpenses - previousExpenses) / previousExpenses) * 100 : 0,
      },
      {
        metric: 'Net Profit',
        current: currentRevenue - currentExpenses,
        previous: previousRevenue - previousExpenses,
        change: (currentRevenue - currentExpenses) - (previousRevenue - previousExpenses),
        changePercent: (previousRevenue - previousExpenses) ? (((currentRevenue - currentExpenses) - (previousRevenue - previousExpenses)) / Math.abs(previousRevenue - previousExpenses)) * 100 : 0,
      },
      {
        metric: 'Invoice Count',
        current: currentInvoices.length,
        previous: previousInvoices.length,
        change: currentInvoices.length - previousInvoices.length,
        changePercent: previousInvoices.length ? ((currentInvoices.length - previousInvoices.length) / previousInvoices.length) * 100 : 0,
      },
      {
        metric: 'Avg Invoice Value',
        current: currentInvoices.length ? currentRevenue / currentInvoices.length : 0,
        previous: previousInvoices.length ? previousRevenue / previousInvoices.length : 0,
        change: (currentInvoices.length ? currentRevenue / currentInvoices.length : 0) - (previousInvoices.length ? previousRevenue / previousInvoices.length : 0),
        changePercent: (previousInvoices.length && previousRevenue / previousInvoices.length) ? (((currentInvoices.length ? currentRevenue / currentInvoices.length : 0) - (previousRevenue / previousInvoices.length)) / (previousRevenue / previousInvoices.length)) * 100 : 0,
      },
    ];

    res.json(comparison);
  }));

  // =====================================
  // GENERAL LEDGER
  // =====================================

  app.get("/api/reports/:companyId/general-ledger", authMiddleware, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { companyId } = req.params;
    const { startDate, endDate } = req.query;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const accounts = await storage.getAccountsByCompanyId(companyId);
    let entries = await storage.getJournalEntriesByCompanyId(companyId);

    entries = entries.filter(e => e.status === 'posted');

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate as string) : null;
      const end = endDate ? new Date(endDate as string) : null;
      entries = entries.filter(entry => {
        const entryDate = new Date(entry.date);
        if (start && entryDate < start) return false;
        if (end && entryDate > end) return false;
        return true;
      });
    }

    // Build per-account ledger with running balance
    const ledger = [];
    for (const account of accounts) {
      const accountEntries = [];
      let runningBalance = 0;

      for (const entry of entries) {
        const lines = await storage.getJournalLinesByEntryId(entry.id);
        for (const line of lines) {
          if (line.accountId === account.id) {
            const debit = Number(line.debit);
            const credit = Number(line.credit);
            if (['asset', 'expense'].includes(account.type)) {
              runningBalance += debit - credit;
            } else {
              runningBalance += credit - debit;
            }
            accountEntries.push({
              date: entry.date,
              entryNumber: entry.entryNumber,
              memo: entry.memo,
              debit,
              credit,
              runningBalance,
            });
          }
        }
      }

      if (accountEntries.length > 0) {
        ledger.push({
          accountId: account.id,
          accountName: account.nameEn,
          accountCode: account.code,
          accountType: account.type,
          entries: accountEntries,
          closingBalance: runningBalance,
        });
      }
    }

    res.json({ ledger });
  }));

  // =====================================
  // STATEMENT OF CHANGES IN EQUITY
  // =====================================

  app.get("/api/reports/:companyId/equity-changes", authMiddleware, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { companyId } = req.params;
    const { startDate, endDate } = req.query;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const accounts = await storage.getAccountsByCompanyId(companyId);
    const allEntries = await storage.getJournalEntriesByCompanyId(companyId);
    const postedEntries = allEntries.filter(e => e.status === 'posted');

    const start = startDate ? new Date(startDate as string) : new Date(0);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Opening equity: sum of equity accounts from entries BEFORE start date
    let openingEquity = 0;
    const beforeStartEntries = postedEntries.filter(e => new Date(e.date) < start);
    for (const entry of beforeStartEntries) {
      const lines = await storage.getJournalLinesByEntryId(entry.id);
      for (const line of lines) {
        const account = accounts.find(a => a.id === line.accountId);
        if (account?.type === 'equity') {
          openingEquity += Number(line.credit) - Number(line.debit);
        }
      }
    }

    // Period entries
    const periodEntries = postedEntries.filter(e => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    });

    let periodIncome = 0;
    let periodExpenses = 0;
    let periodEquityChanges = 0;

    for (const entry of periodEntries) {
      const lines = await storage.getJournalLinesByEntryId(entry.id);
      for (const line of lines) {
        const account = accounts.find(a => a.id === line.accountId);
        if (!account) continue;
        if (account.type === 'income') {
          periodIncome += Number(line.credit) - Number(line.debit);
        } else if (account.type === 'expense') {
          periodExpenses += Number(line.debit) - Number(line.credit);
        } else if (account.type === 'equity') {
          periodEquityChanges += Number(line.credit) - Number(line.debit);
        }
      }
    }

    const netIncome = periodIncome - periodExpenses;
    const closingEquity = openingEquity + periodEquityChanges + netIncome;

    res.json({
      openingEquity,
      periodEquityChanges,
      netIncome,
      closingEquity,
    });
  }));
}
