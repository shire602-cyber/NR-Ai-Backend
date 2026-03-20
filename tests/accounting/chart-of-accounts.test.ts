import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockStorage,
  seedTestCompanyWithAccounts,
  defaultChartOfAccounts,
  ACCOUNT_CODES,
} from '../helpers';
import type { IStorage } from '../../server/storage';
import type { Account, User, Company } from '@shared/schema';

describe('Chart of Accounts', () => {
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

  it('default chart has all required account types', () => {
    const types = new Set(accounts.map((a) => a.type));

    expect(types.has('asset')).toBe(true);
    expect(types.has('liability')).toBe(true);
    expect(types.has('equity')).toBe(true);
    expect(types.has('income')).toBe(true);
    expect(types.has('expense')).toBe(true);

    // Count of each type from the default chart
    const assetCount = accounts.filter((a) => a.type === 'asset').length;
    const liabilityCount = accounts.filter((a) => a.type === 'liability').length;
    const equityCount = accounts.filter((a) => a.type === 'equity').length;
    const incomeCount = accounts.filter((a) => a.type === 'income').length;
    const expenseCount = accounts.filter((a) => a.type === 'expense').length;

    // Default chart should have a reasonable number of each
    expect(assetCount).toBeGreaterThanOrEqual(5); // Cash, Bank, Petty Cash, AR, VAT Recv, etc.
    expect(liabilityCount).toBeGreaterThanOrEqual(3); // AP, VAT Pay, Salaries Pay, etc.
    expect(equityCount).toBeGreaterThanOrEqual(2); // Capital, Retained Earnings
    expect(incomeCount).toBeGreaterThanOrEqual(3); // Product Sales, Service Rev, Other Income
    expect(expenseCount).toBeGreaterThanOrEqual(5); // Rent, Salaries, Utilities, etc.

    // Total should match the default template count
    expect(accounts.length).toBe(defaultChartOfAccounts.length);
  });

  it('account codes are immutable constants', () => {
    // The ACCOUNT_CODES object should have specific fixed values
    expect(ACCOUNT_CODES.CASH).toBe('1010');
    expect(ACCOUNT_CODES.BANK_ACCOUNTS).toBe('1020');
    expect(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE).toBe('1040');
    expect(ACCOUNT_CODES.VAT_RECEIVABLE_INPUT).toBe('1050');
    expect(ACCOUNT_CODES.ACCOUNTS_PAYABLE).toBe('2010');
    expect(ACCOUNT_CODES.VAT_PAYABLE_OUTPUT).toBe('2020');
    expect(ACCOUNT_CODES.PRODUCT_SALES).toBe('4010');
    expect(ACCOUNT_CODES.SERVICE_REVENUE).toBe('4020');

    // The ACCOUNT_CODES object should be declared "as const" (frozen at compile time)
    // At runtime we verify it has the expected shape
    const keys = Object.keys(ACCOUNT_CODES);
    expect(keys.length).toBeGreaterThanOrEqual(8);

    // Each code should match an account in the default chart
    for (const code of Object.values(ACCOUNT_CODES)) {
      const found = defaultChartOfAccounts.find((a) => a.code === code);
      expect(found).toBeDefined();
    }
  });

  it('getAccountByCode resolves correctly', async () => {
    // Look up each well-known account by code
    const cashAccount = await storage.getAccountByCode(company.id, ACCOUNT_CODES.CASH);
    expect(cashAccount).toBeDefined();
    expect(cashAccount!.code).toBe('1010');
    expect(cashAccount!.nameEn).toBe('Cash on Hand');
    expect(cashAccount!.type).toBe('asset');

    const apAccount = await storage.getAccountByCode(company.id, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    expect(apAccount).toBeDefined();
    expect(apAccount!.code).toBe('2010');
    expect(apAccount!.nameEn).toBe('Accounts Payable');
    expect(apAccount!.type).toBe('liability');

    const revenueAccount = await storage.getAccountByCode(company.id, ACCOUNT_CODES.SERVICE_REVENUE);
    expect(revenueAccount).toBeDefined();
    expect(revenueAccount!.code).toBe('4020');
    expect(revenueAccount!.type).toBe('income');

    // Non-existent code should return undefined
    const nonExistent = await storage.getAccountByCode(company.id, '9999');
    expect(nonExistent).toBeUndefined();

    // Code from different company should return undefined
    const wrongCompany = await storage.getAccountByCode('non-existent-company-id', ACCOUNT_CODES.CASH);
    expect(wrongCompany).toBeUndefined();
  });

  it('VAT accounts are properly configured', async () => {
    const vatInput = await storage.getAccountByCode(company.id, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);
    expect(vatInput).toBeDefined();
    expect(vatInput!.isVatAccount).toBe(true);
    expect(vatInput!.vatType).toBe('input');
    expect(vatInput!.isSystemAccount).toBe(true);

    const vatOutput = await storage.getAccountByCode(company.id, ACCOUNT_CODES.VAT_PAYABLE_OUTPUT);
    expect(vatOutput).toBeDefined();
    expect(vatOutput!.isVatAccount).toBe(true);
    expect(vatOutput!.vatType).toBe('output');
    expect(vatOutput!.isSystemAccount).toBe(true);

    // Non-VAT accounts should have isVatAccount=false and vatType=null
    const cashAccount = await storage.getAccountByCode(company.id, ACCOUNT_CODES.CASH);
    expect(cashAccount!.isVatAccount).toBe(false);
    expect(cashAccount!.vatType).toBeNull();
  });
});
