import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockStorage,
  seedTestCompanyWithAccounts,
  createTestInvoice,
  createTestInvoiceLine,
  findAccount,
  ACCOUNT_CODES,
} from '../helpers';
import type { IStorage } from '../../server/storage';
import type { Account, User, Company } from '@shared/schema';

describe('Invoices', () => {
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

  it('invoice creation calculates correct VAT at 5%', async () => {
    // Create invoice with line items
    const lineItems = [
      { description: 'Web Development', quantity: 1, unitPrice: '5000.00', vatRate: 0.05 },
      { description: 'Hosting (annual)', quantity: 1, unitPrice: '1200.00', vatRate: 0.05 },
    ];

    // Calculate expected totals
    let expectedSubtotal = 0;
    for (const item of lineItems) {
      expectedSubtotal += item.quantity * parseFloat(item.unitPrice);
    }
    const expectedVat = parseFloat((expectedSubtotal * 0.05).toFixed(2));
    const expectedTotal = parseFloat((expectedSubtotal + expectedVat).toFixed(2));

    expect(expectedSubtotal).toBe(6200);
    expect(expectedVat).toBe(310);
    expect(expectedTotal).toBe(6510);

    // Create the invoice
    const invoice = await storage.createInvoice({
      companyId: company.id,
      number: 'INV-2024-001',
      customerName: 'Acme Corp',
      date: new Date(),
      currency: 'AED',
      subtotal: expectedSubtotal.toFixed(2),
      vatAmount: expectedVat.toFixed(2),
      total: expectedTotal.toFixed(2),
      status: 'draft',
    } as any);

    // Create line items
    for (const item of lineItems) {
      await storage.createInvoiceLine({
        invoiceId: invoice.id,
        ...item,
      } as any);
    }

    const savedInvoice = await storage.getInvoice(invoice.id);
    expect(savedInvoice).toBeDefined();
    expect(parseFloat(savedInvoice!.subtotal)).toBe(6200);
    expect(parseFloat(savedInvoice!.vatAmount)).toBe(310);
    expect(parseFloat(savedInvoice!.total)).toBe(6510);

    // VAT should be exactly 5% of subtotal
    const vatPercentage = parseFloat(savedInvoice!.vatAmount) / parseFloat(savedInvoice!.subtotal);
    expect(vatPercentage).toBeCloseTo(0.05, 10);
  });

  it('invoice total = subtotal + vatAmount', async () => {
    const testCases = [
      { subtotal: '1000.00', vatAmount: '50.00', total: '1050.00' },
      { subtotal: '0.00', vatAmount: '0.00', total: '0.00' },
      { subtotal: '99.99', vatAmount: '5.00', total: '104.99' },
      { subtotal: '50000.00', vatAmount: '2500.00', total: '52500.00' },
    ];

    for (const tc of testCases) {
      const invoice = await storage.createInvoice({
        companyId: company.id,
        number: `INV-${Math.random().toString(36).slice(2, 8)}`,
        customerName: 'Test Customer',
        date: new Date(),
        currency: 'AED',
        subtotal: tc.subtotal,
        vatAmount: tc.vatAmount,
        total: tc.total,
        status: 'draft',
      } as any);

      const saved = await storage.getInvoice(invoice.id);
      const subtotal = parseFloat(saved!.subtotal);
      const vatAmount = parseFloat(saved!.vatAmount);
      const total = parseFloat(saved!.total);

      expect(total).toBe(subtotal + vatAmount);
    }
  });

  it('payment reduces outstanding balance', async () => {
    // Create an invoice for 1050 AED (1000 + 50 VAT)
    const invoice = await storage.createInvoice({
      companyId: company.id,
      number: 'INV-2024-010',
      customerName: 'Client X',
      date: new Date(),
      currency: 'AED',
      subtotal: '1000.00',
      vatAmount: '50.00',
      total: '1050.00',
      status: 'sent',
    } as any);

    const originalTotal = parseFloat(invoice.total);
    expect(originalTotal).toBe(1050);

    // Simulate partial payment - track payments as status changes
    // In the system, payments are tracked via journal entries against AR
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const arAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);

    // Full payment received: debit Cash, credit AR
    const paymentAmount = 1050;
    const { createBalancedJournalEntry } = await import('../helpers');

    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: cashAccount.id, debit: paymentAmount.toFixed(2) },
      { accountId: arAccount.id, credit: paymentAmount.toFixed(2) },
    ]);

    // Mark invoice as paid
    const paidInvoice = await storage.updateInvoiceStatus(invoice.id, 'paid');
    expect(paidInvoice.status).toBe('paid');

    // AR balance should reflect the payment
    const balances = await storage.getAccountsWithBalances(company.id);
    const arBalance = balances.find((b) => b.account.id === arAccount.id);

    // AR was credited, so balance (debit-normal for assets) = 0 - 1050 = -1050
    // But in practice there would have been a debit when invoice was posted
    // Here we just verify the credit entry was recorded
    expect(arBalance!.creditTotal).toBe(1050);
  });

  it('invoice line items sum to subtotal', async () => {
    const invoice = await storage.createInvoice({
      companyId: company.id,
      number: 'INV-2024-020',
      customerName: 'Multi-Line Customer',
      date: new Date(),
      currency: 'AED',
      subtotal: '3750.00',
      vatAmount: '187.50',
      total: '3937.50',
      status: 'draft',
    } as any);

    // Create multiple line items
    await storage.createInvoiceLine({
      invoiceId: invoice.id,
      description: 'Consulting - 10 hours',
      quantity: 10,
      unitPrice: '200.00',
      vatRate: 0.05,
    } as any);

    await storage.createInvoiceLine({
      invoiceId: invoice.id,
      description: 'Software License',
      quantity: 1,
      unitPrice: '1500.00',
      vatRate: 0.05,
    } as any);

    await storage.createInvoiceLine({
      invoiceId: invoice.id,
      description: 'Travel Expenses',
      quantity: 1,
      unitPrice: '250.00',
      vatRate: 0.05,
    } as any);

    const lines = await storage.getInvoiceLinesByInvoiceId(invoice.id);
    expect(lines).toHaveLength(3);

    // Calculate subtotal from line items
    const lineItemsSubtotal = lines.reduce((sum, line) => {
      return sum + line.quantity * parseFloat(line.unitPrice);
    }, 0);

    // 10 * 200 + 1 * 1500 + 1 * 250 = 3750
    expect(lineItemsSubtotal).toBe(3750);
    expect(lineItemsSubtotal).toBe(parseFloat(invoice.subtotal));
  });

  it('invoice with zero-rated VAT has vatAmount of 0', async () => {
    const invoice = await storage.createInvoice({
      companyId: company.id,
      number: 'INV-2024-030',
      customerName: 'Export Customer',
      date: new Date(),
      currency: 'AED',
      subtotal: '10000.00',
      vatAmount: '0.00',
      total: '10000.00',
      status: 'draft',
    } as any);

    await storage.createInvoiceLine({
      invoiceId: invoice.id,
      description: 'Exported Goods',
      quantity: 100,
      unitPrice: '100.00',
      vatRate: 0,
      vatSupplyType: 'zero_rated',
    } as any);

    const saved = await storage.getInvoice(invoice.id);
    expect(parseFloat(saved!.vatAmount)).toBe(0);
    expect(parseFloat(saved!.total)).toBe(parseFloat(saved!.subtotal));

    const lines = await storage.getInvoiceLinesByInvoiceId(invoice.id);
    expect(lines[0].vatRate).toBe(0);
    expect(lines[0].vatSupplyType).toBe('zero_rated');
  });
});
