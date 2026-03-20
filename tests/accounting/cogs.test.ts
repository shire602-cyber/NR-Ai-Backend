import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockStorage,
  seedTestCompanyWithAccounts,
  findAccount,
  ACCOUNT_CODES,
} from '../helpers';
import type { IStorage } from '../../server/storage';
import type { Account, User, Company } from '@shared/schema';

// ---------------------------------------------------------------------------
// Pure helper functions mirroring COGS business logic
// from invoices.routes.ts
// ---------------------------------------------------------------------------

interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  /** Product reference; null for service-only lines */
  productId: string | null;
}

interface Product {
  id: string;
  name: string;
  costPrice: string; // Drizzle numeric -> string
}

interface COGSDetail {
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  cogsAmount: number;
}

interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

/**
 * Calculate COGS details from invoice lines that reference products.
 * Mirrors the COGS logic in invoices.routes.ts:
 *   - Filter lines that have a productId
 *   - Look up each product to get costPrice
 *   - cogsAmount = quantity * costPrice per product line
 */
function calculateCOGSDetails(
  lines: InvoiceLine[],
  products: Map<string, Product>,
): { details: COGSDetail[]; totalCOGS: number } {
  const details: COGSDetail[] = [];
  let totalCOGS = 0;

  const productLines = lines.filter((line) => line.productId);

  for (const line of productLines) {
    const product = products.get(line.productId!);
    if (product && product.costPrice) {
      const costPrice = parseFloat(String(product.costPrice));
      const cogsAmount = Math.round(line.quantity * costPrice * 100) / 100;
      if (cogsAmount > 0) {
        totalCOGS += cogsAmount;
        details.push({
          productId: product.id,
          productName: product.name,
          quantity: line.quantity,
          costPrice,
          cogsAmount,
        });
      }
    }
  }

  totalCOGS = Math.round(totalCOGS * 100) / 100;

  return { details, totalCOGS };
}

/**
 * Build the COGS journal entry lines.
 * Mirrors invoices.routes.ts:
 *   - Debit COGS account (totalCOGS)
 *   - Credit Inventory account (totalCOGS)
 */
function buildCOGSJournalLines(
  totalCOGS: number,
  invoiceNumber: string,
  cogsAccountId: string,
  inventoryAccountId: string,
): JournalLine[] {
  if (totalCOGS <= 0) return [];

  return [
    {
      accountId: cogsAccountId,
      debit: totalCOGS,
      credit: 0,
      description: `Cost of goods sold - Invoice ${invoiceNumber}`,
    },
    {
      accountId: inventoryAccountId,
      debit: 0,
      credit: totalCOGS,
      description: `Inventory reduction - Invoice ${invoiceNumber}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('COGS (Cost of Goods Sold)', () => {
  let storage: IStorage;
  let user: User;
  let company: Company;
  let accounts: Account[];

  beforeEach(async () => {
    storage = createMockStorage();
    const seed = await seedTestCompanyWithAccounts(storage);
    user = seed.user;
    company = seed.company;
    accounts = seed.accounts;
  });

  // -------------------------------------------------------------------------
  // 1. Product invoice creates COGS journal entry
  // -------------------------------------------------------------------------
  it('product invoice creates COGS journal entry', () => {
    const cogsAccount = findAccount(accounts, ACCOUNT_CODES.COGS);
    const inventoryAccount = findAccount(accounts, ACCOUNT_CODES.INVENTORY);

    const products = new Map<string, Product>([
      ['prod-1', { id: 'prod-1', name: 'Widget A', costPrice: '25.00' }],
    ]);

    const lines: InvoiceLine[] = [
      { description: 'Widget A', quantity: 10, unitPrice: 50, vatRate: 0.05, productId: 'prod-1' },
    ];

    const { details, totalCOGS } = calculateCOGSDetails(lines, products);
    expect(details).toHaveLength(1);
    expect(totalCOGS).toBe(250); // 10 * 25

    const jeLines = buildCOGSJournalLines(totalCOGS, 'INV-001', cogsAccount.id, inventoryAccount.id);
    expect(jeLines).toHaveLength(2);

    // COGS debit
    const cogsLine = jeLines.find((l) => l.accountId === cogsAccount.id)!;
    expect(cogsLine.debit).toBe(250);
    expect(cogsLine.credit).toBe(0);

    // Inventory credit
    const invLine = jeLines.find((l) => l.accountId === inventoryAccount.id)!;
    expect(invLine.credit).toBe(250);
    expect(invLine.debit).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. COGS amount = sum(quantity * costPrice) per product line
  // -------------------------------------------------------------------------
  it('COGS amount = sum(quantity * costPrice) per product line', () => {
    const products = new Map<string, Product>([
      ['prod-1', { id: 'prod-1', name: 'Widget A', costPrice: '25.00' }],
      ['prod-2', { id: 'prod-2', name: 'Widget B', costPrice: '40.50' }],
      ['prod-3', { id: 'prod-3', name: 'Widget C', costPrice: '12.75' }],
    ]);

    const lines: InvoiceLine[] = [
      { description: 'Widget A x10', quantity: 10, unitPrice: 50, vatRate: 0.05, productId: 'prod-1' },
      { description: 'Widget B x5', quantity: 5, unitPrice: 80, vatRate: 0.05, productId: 'prod-2' },
      { description: 'Widget C x20', quantity: 20, unitPrice: 30, vatRate: 0.05, productId: 'prod-3' },
    ];

    const { details, totalCOGS } = calculateCOGSDetails(lines, products);

    expect(details).toHaveLength(3);

    // Individual COGS amounts
    expect(details[0].cogsAmount).toBe(250);    // 10 * 25.00
    expect(details[1].cogsAmount).toBe(202.5);  // 5 * 40.50
    expect(details[2].cogsAmount).toBe(255);     // 20 * 12.75

    // Total COGS = 250 + 202.5 + 255 = 707.5
    expect(totalCOGS).toBe(707.5);
  });

  // -------------------------------------------------------------------------
  // 3. Non-product invoice lines don't generate COGS
  // -------------------------------------------------------------------------
  it('non-product invoice lines do not generate COGS', () => {
    const products = new Map<string, Product>([
      ['prod-1', { id: 'prod-1', name: 'Widget A', costPrice: '25.00' }],
    ]);

    const lines: InvoiceLine[] = [
      // Service line (no productId)
      { description: 'Consulting services', quantity: 10, unitPrice: 200, vatRate: 0.05, productId: null },
      // Another service line
      { description: 'Implementation', quantity: 1, unitPrice: 5000, vatRate: 0.05, productId: null },
    ];

    const { details, totalCOGS } = calculateCOGSDetails(lines, products);

    expect(details).toHaveLength(0);
    expect(totalCOGS).toBe(0);

    // No JE lines should be created
    const cogsAccount = findAccount(accounts, ACCOUNT_CODES.COGS);
    const inventoryAccount = findAccount(accounts, ACCOUNT_CODES.INVENTORY);
    const jeLines = buildCOGSJournalLines(totalCOGS, 'INV-002', cogsAccount.id, inventoryAccount.id);
    expect(jeLines).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 4. COGS JE debits = credits (COGS debit, Inventory credit)
  // -------------------------------------------------------------------------
  it('COGS JE debits = credits (COGS debit, Inventory credit)', () => {
    const cogsAccount = findAccount(accounts, ACCOUNT_CODES.COGS);
    const inventoryAccount = findAccount(accounts, ACCOUNT_CODES.INVENTORY);

    const products = new Map<string, Product>([
      ['prod-1', { id: 'prod-1', name: 'Widget A', costPrice: '25.00' }],
      ['prod-2', { id: 'prod-2', name: 'Widget B', costPrice: '40.50' }],
    ]);

    const lines: InvoiceLine[] = [
      { description: 'Widget A', quantity: 10, unitPrice: 50, vatRate: 0.05, productId: 'prod-1' },
      { description: 'Widget B', quantity: 5, unitPrice: 80, vatRate: 0.05, productId: 'prod-2' },
      { description: 'Setup service', quantity: 1, unitPrice: 500, vatRate: 0.05, productId: null },
    ];

    const { totalCOGS } = calculateCOGSDetails(lines, products);
    const jeLines = buildCOGSJournalLines(totalCOGS, 'INV-003', cogsAccount.id, inventoryAccount.id);

    const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);

    expect(totalDebits).toBe(totalCredits);
    expect(totalDebits).toBe(452.5); // 250 + 202.5
  });

  // -------------------------------------------------------------------------
  // 5. Product with zero costPrice does not create COGS
  // -------------------------------------------------------------------------
  it('product with zero costPrice does not create COGS entry', () => {
    const products = new Map<string, Product>([
      ['prod-1', { id: 'prod-1', name: 'Free Sample', costPrice: '0' }],
    ]);

    const lines: InvoiceLine[] = [
      { description: 'Free Sample', quantity: 5, unitPrice: 100, vatRate: 0.05, productId: 'prod-1' },
    ];

    const { details, totalCOGS } = calculateCOGSDetails(lines, products);

    // costPrice=0 means cogsAmount=0, which is skipped (cogsAmount > 0 check)
    expect(details).toHaveLength(0);
    expect(totalCOGS).toBe(0);
  });
});
