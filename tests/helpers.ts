/**
 * Test helpers for Muhasib.ai accounting backend.
 * Provides in-memory mock storage and factory functions for test data.
 */
import { randomUUID } from 'crypto';
import type {
  User, Company, CompanyUser, Account, JournalEntry, JournalLine,
  Invoice, InvoiceLine, Receipt,
} from '@shared/schema';
import type { IStorage } from '../server/storage';
import { defaultChartOfAccounts, type DefaultAccountTemplate } from '../server/defaultChartOfAccounts';
import { ACCOUNT_CODES } from '../server/lib/account-codes';

// ─── ID Generator ────────────────────────────────────────────────────────────
let _seq = 0;
export function nextId(): string {
  return randomUUID();
}

// ─── Timestamp Helpers ───────────────────────────────────────────────────────
export function isoNow(): Date {
  return new Date();
}

// ─── Type-safe factory defaults ──────────────────────────────────────────────

export function createTestUser(overrides: Partial<User> = {}): User {
  const id = overrides.id ?? nextId();
  return {
    id,
    email: overrides.email ?? `user-${id.slice(0, 8)}@test.com`,
    name: overrides.name ?? 'Test User',
    passwordHash: overrides.passwordHash ?? 'hashed_password',
    isAdmin: overrides.isAdmin ?? false,
    userType: overrides.userType ?? 'customer',
    phone: overrides.phone ?? null,
    avatarUrl: overrides.avatarUrl ?? null,
    lastLoginAt: overrides.lastLoginAt ?? null,
    createdAt: overrides.createdAt ?? isoNow(),
  };
}

export function createTestCompany(overrides: Partial<Company> = {}): Company {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: overrides.name ?? `Test Company ${id.slice(0, 8)}`,
    baseCurrency: overrides.baseCurrency ?? 'AED',
    locale: overrides.locale ?? 'en',
    companyType: overrides.companyType ?? 'customer',
    legalStructure: overrides.legalStructure ?? null,
    industry: overrides.industry ?? null,
    registrationNumber: overrides.registrationNumber ?? null,
    businessAddress: overrides.businessAddress ?? null,
    contactPhone: overrides.contactPhone ?? null,
    contactEmail: overrides.contactEmail ?? null,
    websiteUrl: overrides.websiteUrl ?? null,
    logoUrl: overrides.logoUrl ?? null,
    trnVatNumber: overrides.trnVatNumber ?? null,
    taxRegistrationType: overrides.taxRegistrationType ?? null,
    vatFilingFrequency: overrides.vatFilingFrequency ?? null,
    taxRegistrationDate: overrides.taxRegistrationDate ?? null,
    corporateTaxId: overrides.corporateTaxId ?? null,
    emirate: overrides.emirate ?? 'dubai',
    invoiceShowLogo: overrides.invoiceShowLogo ?? true,
    invoiceShowAddress: overrides.invoiceShowAddress ?? true,
    invoiceShowPhone: overrides.invoiceShowPhone ?? true,
    invoiceShowEmail: overrides.invoiceShowEmail ?? true,
    invoiceShowWebsite: overrides.invoiceShowWebsite ?? false,
    invoiceCustomTitle: overrides.invoiceCustomTitle ?? null,
    invoiceFooterNote: overrides.invoiceFooterNote ?? null,
    createdAt: overrides.createdAt ?? isoNow(),
  };
}

export function createTestAccount(
  companyId: string,
  overrides: Partial<Account> = {},
): Account {
  const id = overrides.id ?? nextId();
  return {
    id,
    companyId,
    code: overrides.code ?? '1010',
    nameEn: overrides.nameEn ?? 'Test Account',
    nameAr: overrides.nameAr ?? null,
    description: overrides.description ?? null,
    type: overrides.type ?? 'asset',
    subType: overrides.subType ?? null,
    isVatAccount: overrides.isVatAccount ?? false,
    vatType: overrides.vatType ?? null,
    isSystemAccount: overrides.isSystemAccount ?? false,
    isActive: overrides.isActive ?? true,
    isArchived: overrides.isArchived ?? false,
    createdAt: overrides.createdAt ?? isoNow(),
    updatedAt: overrides.updatedAt ?? null,
  };
}

export function createTestJournalEntry(
  companyId: string,
  createdBy: string,
  overrides: Partial<JournalEntry> = {},
): JournalEntry {
  const id = overrides.id ?? nextId();
  const now = isoNow();
  return {
    id,
    companyId,
    entryNumber: overrides.entryNumber ?? `JE-${formatDateForEntry(now)}-001`,
    date: overrides.date ?? now,
    memo: overrides.memo ?? null,
    status: overrides.status ?? 'posted',
    source: overrides.source ?? 'manual',
    sourceId: overrides.sourceId ?? null,
    reversedEntryId: overrides.reversedEntryId ?? null,
    reversalReason: overrides.reversalReason ?? null,
    createdBy,
    createdAt: overrides.createdAt ?? now,
    postedBy: overrides.postedBy ?? null,
    postedAt: overrides.postedAt ?? null,
    updatedBy: overrides.updatedBy ?? null,
    updatedAt: overrides.updatedAt ?? null,
  };
}

export function createTestJournalLine(
  entryId: string,
  accountId: string,
  overrides: Partial<JournalLine> = {},
): JournalLine {
  const id = overrides.id ?? nextId();
  return {
    id,
    entryId,
    accountId,
    debit: overrides.debit ?? '0',
    credit: overrides.credit ?? '0',
    description: overrides.description ?? null,
    isReconciled: overrides.isReconciled ?? false,
    reconciledAt: overrides.reconciledAt ?? null,
    reconciledBy: overrides.reconciledBy ?? null,
    bankTransactionId: overrides.bankTransactionId ?? null,
  };
}

export function createTestInvoice(
  companyId: string,
  overrides: Partial<Invoice> = {},
): Invoice {
  const id = overrides.id ?? nextId();
  return {
    id,
    companyId,
    number: overrides.number ?? `INV-001`,
    customerName: overrides.customerName ?? 'Test Customer',
    customerTrn: overrides.customerTrn ?? null,
    date: overrides.date ?? isoNow(),
    currency: overrides.currency ?? 'AED',
    subtotal: overrides.subtotal ?? '0',
    vatAmount: overrides.vatAmount ?? '0',
    total: overrides.total ?? '0',
    status: overrides.status ?? 'draft',
    shareToken: overrides.shareToken ?? null,
    shareTokenExpiresAt: overrides.shareTokenExpiresAt ?? null,
    einvoiceUuid: overrides.einvoiceUuid ?? null,
    einvoiceXml: overrides.einvoiceXml ?? null,
    einvoiceHash: overrides.einvoiceHash ?? null,
    einvoiceStatus: overrides.einvoiceStatus ?? null,
    createdAt: overrides.createdAt ?? isoNow(),
  };
}

export function createTestInvoiceLine(
  invoiceId: string,
  overrides: Partial<InvoiceLine> = {},
): InvoiceLine {
  const id = overrides.id ?? nextId();
  return {
    id,
    invoiceId,
    description: overrides.description ?? 'Test line item',
    quantity: overrides.quantity ?? 1,
    unitPrice: overrides.unitPrice ?? '100.00',
    vatRate: overrides.vatRate ?? 0.05,
    vatSupplyType: overrides.vatSupplyType ?? 'standard_rated',
  };
}

export function createTestReceipt(
  companyId: string,
  uploadedBy: string,
  overrides: Partial<Receipt> = {},
): Receipt {
  const id = overrides.id ?? nextId();
  return {
    id,
    companyId,
    merchant: overrides.merchant ?? 'Test Merchant',
    date: overrides.date ?? new Date().toISOString().slice(0, 10),
    amount: overrides.amount ?? '100.00',
    vatAmount: overrides.vatAmount ?? '5.00',
    currency: overrides.currency ?? 'AED',
    category: overrides.category ?? 'office_supplies',
    accountId: overrides.accountId ?? null,
    paymentAccountId: overrides.paymentAccountId ?? null,
    posted: overrides.posted ?? false,
    journalEntryId: overrides.journalEntryId ?? null,
    imageData: overrides.imageData ?? null,
    rawText: overrides.rawText ?? null,
    uploadedBy,
    createdAt: overrides.createdAt ?? isoNow(),
  };
}

// ─── Date helpers ────────────────────────────────────────────────────────────

export function formatDateForEntry(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// ─── Mock Storage ────────────────────────────────────────────────────────────

/**
 * Creates an in-memory mock of IStorage that covers the core accounting methods.
 * Uses Maps and arrays to simulate database operations without a real DB.
 */
export function createMockStorage() {
  const usersMap = new Map<string, User>();
  const companiesMap = new Map<string, Company>();
  const companyUsersArr: CompanyUser[] = [];
  const accountsMap = new Map<string, Account>();
  const journalEntriesMap = new Map<string, JournalEntry>();
  const journalLinesArr: JournalLine[] = [];
  const invoicesMap = new Map<string, Invoice>();
  const invoiceLinesArr: InvoiceLine[] = [];
  const receiptsMap = new Map<string, Receipt>();

  // Track entry number sequences per company+date
  const entryNumberCounters = new Map<string, number>();

  const storage: Partial<IStorage> = {
    // ── Users ──────────────────────────────────────────────────
    async getUser(id: string) {
      return usersMap.get(id);
    },
    async getUserByEmail(email: string) {
      return [...usersMap.values()].find((u) => u.email === email);
    },
    async createUser(data: any) {
      const user = createTestUser({
        email: data.email,
        name: data.name,
        passwordHash: 'hashed_' + (data.password ?? 'password'),
        isAdmin: data.isAdmin ?? false,
        userType: data.userType ?? 'customer',
        phone: data.phone ?? null,
        avatarUrl: data.avatarUrl ?? null,
      });
      usersMap.set(user.id, user);
      return user;
    },

    // ── Companies ──────────────────────────────────────────────
    async getCompany(id: string) {
      return companiesMap.get(id);
    },
    async getCompanyByName(name: string) {
      return [...companiesMap.values()].find((c) => c.name === name);
    },
    async getCompaniesByUserId(userId: string) {
      const companyIds = companyUsersArr
        .filter((cu) => cu.userId === userId)
        .map((cu) => cu.companyId);
      return [...companiesMap.values()].filter((c) => companyIds.includes(c.id));
    },
    async createCompany(data: any) {
      const company = createTestCompany({ ...data });
      companiesMap.set(company.id, company);
      return company;
    },
    async updateCompany(id: string, data: any) {
      const company = companiesMap.get(id);
      if (!company) throw new Error('Company not found');
      const updated = { ...company, ...data };
      companiesMap.set(id, updated);
      return updated;
    },

    // ── Company Users ──────────────────────────────────────────
    async createCompanyUser(data: any) {
      const cu: CompanyUser = {
        id: nextId(),
        companyId: data.companyId,
        userId: data.userId,
        role: data.role ?? 'owner',
        createdAt: isoNow(),
      };
      companyUsersArr.push(cu);
      return cu;
    },
    async hasCompanyAccess(userId: string, companyId: string) {
      return companyUsersArr.some(
        (cu) => cu.userId === userId && cu.companyId === companyId,
      );
    },

    // ── Accounts ───────────────────────────────────────────────
    async getAccount(id: string) {
      return accountsMap.get(id);
    },
    async getAccountsByCompanyId(companyId: string) {
      return [...accountsMap.values()].filter((a) => a.companyId === companyId);
    },
    async getAccountByCode(companyId: string, code: string) {
      return [...accountsMap.values()].find(
        (a) => a.companyId === companyId && a.code === code,
      );
    },
    async createAccount(data: any) {
      const account = createTestAccount(data.companyId, { ...data });
      accountsMap.set(account.id, account);
      return account;
    },
    async updateAccount(id: string, data: any) {
      const account = accountsMap.get(id);
      if (!account) throw new Error('Account not found');
      const updated = { ...account, ...data, updatedAt: isoNow() };
      accountsMap.set(id, updated);
      return updated;
    },
    async deleteAccount(id: string) {
      accountsMap.delete(id);
    },
    async accountHasTransactions(accountId: string) {
      return journalLinesArr.some((jl) => jl.accountId === accountId);
    },

    // ── Accounts with Balances ─────────────────────────────────
    async getAccountsWithBalances(companyId: string, dateRange?: { start: Date; end: Date }) {
      const companyAccounts = [...accountsMap.values()].filter(
        (a) => a.companyId === companyId,
      );

      return companyAccounts.map((account) => {
        // Find all posted journal entries for this company
        const postedEntries = [...journalEntriesMap.values()].filter((je) => {
          if (je.companyId !== companyId) return false;
          if (je.status !== 'posted') return false;
          if (dateRange) {
            const entryDate = je.date instanceof Date ? je.date : new Date(je.date);
            if (entryDate < dateRange.start || entryDate > dateRange.end) return false;
          }
          return true;
        });

        const postedEntryIds = new Set(postedEntries.map((je) => je.id));

        // Sum debits and credits for this account across posted entries
        const relevantLines = journalLinesArr.filter(
          (jl) => jl.accountId === account.id && postedEntryIds.has(jl.entryId),
        );

        const debitTotal = relevantLines.reduce(
          (sum, jl) => sum + parseFloat(jl.debit || '0'),
          0,
        );
        const creditTotal = relevantLines.reduce(
          (sum, jl) => sum + parseFloat(jl.credit || '0'),
          0,
        );

        // Balance depends on account type:
        // Assets & Expenses: debit-normal (balance = debits - credits)
        // Liabilities, Equity, Income: credit-normal (balance = credits - debits)
        let balance: number;
        if (account.type === 'asset' || account.type === 'expense') {
          balance = debitTotal - creditTotal;
        } else {
          balance = creditTotal - debitTotal;
        }

        return { account, balance, debitTotal, creditTotal };
      });
    },

    // ── Journal Entries ────────────────────────────────────────
    async getJournalEntry(id: string) {
      return journalEntriesMap.get(id);
    },
    async getJournalEntriesByCompanyId(companyId: string) {
      return [...journalEntriesMap.values()].filter(
        (je) => je.companyId === companyId,
      );
    },
    async createJournalEntry(data: any) {
      const entry = createTestJournalEntry(data.companyId, data.createdBy, {
        ...data,
      });
      journalEntriesMap.set(entry.id, entry);
      return entry;
    },
    async updateJournalEntry(id: string, data: any) {
      const entry = journalEntriesMap.get(id);
      if (!entry) throw new Error('Journal entry not found');
      const updated = { ...entry, ...data, updatedAt: isoNow() };
      journalEntriesMap.set(id, updated);
      return updated;
    },
    async deleteJournalEntry(id: string) {
      journalEntriesMap.delete(id);
      // Also delete associated lines
      const toRemove = journalLinesArr.filter((jl) => jl.entryId === id);
      toRemove.forEach((jl) => {
        const idx = journalLinesArr.indexOf(jl);
        if (idx !== -1) journalLinesArr.splice(idx, 1);
      });
    },
    async generateEntryNumber(companyId: string, date: Date) {
      const dateStr = formatDateForEntry(date);
      const key = `${companyId}-${dateStr}`;
      const current = entryNumberCounters.get(key) ?? 0;
      const next = current + 1;
      entryNumberCounters.set(key, next);
      return `JE-${dateStr}-${String(next).padStart(3, '0')}`;
    },

    // ── Journal Lines ──────────────────────────────────────────
    async createJournalLine(data: any) {
      const line = createTestJournalLine(data.entryId, data.accountId, {
        ...data,
      });
      journalLinesArr.push(line);
      return line;
    },
    async getJournalLinesByEntryId(entryId: string) {
      return journalLinesArr.filter((jl) => jl.entryId === entryId);
    },
    async deleteJournalLinesByEntryId(entryId: string) {
      let i = journalLinesArr.length;
      while (i--) {
        if (journalLinesArr[i].entryId === entryId) {
          journalLinesArr.splice(i, 1);
        }
      }
    },

    // ── Invoices ───────────────────────────────────────────────
    async getInvoice(id: string) {
      return invoicesMap.get(id);
    },
    async getInvoicesByCompanyId(companyId: string) {
      return [...invoicesMap.values()].filter((inv) => inv.companyId === companyId);
    },
    async createInvoice(data: any) {
      const invoice = createTestInvoice(data.companyId, { ...data });
      invoicesMap.set(invoice.id, invoice);
      return invoice;
    },
    async updateInvoice(id: string, data: any) {
      const invoice = invoicesMap.get(id);
      if (!invoice) throw new Error('Invoice not found');
      const updated = { ...invoice, ...data };
      invoicesMap.set(id, updated);
      return updated;
    },
    async updateInvoiceStatus(id: string, status: string) {
      const invoice = invoicesMap.get(id);
      if (!invoice) throw new Error('Invoice not found');
      const updated = { ...invoice, status };
      invoicesMap.set(id, updated);
      return updated;
    },
    async deleteInvoice(id: string) {
      invoicesMap.delete(id);
      // Also delete lines
      let i = invoiceLinesArr.length;
      while (i--) {
        if (invoiceLinesArr[i].invoiceId === id) {
          invoiceLinesArr.splice(i, 1);
        }
      }
    },

    // ── Invoice Lines ──────────────────────────────────────────
    async createInvoiceLine(data: any) {
      const line = createTestInvoiceLine(data.invoiceId, { ...data });
      invoiceLinesArr.push(line);
      return line;
    },
    async getInvoiceLinesByInvoiceId(invoiceId: string) {
      return invoiceLinesArr.filter((il) => il.invoiceId === invoiceId);
    },
    async deleteInvoiceLinesByInvoiceId(invoiceId: string) {
      let i = invoiceLinesArr.length;
      while (i--) {
        if (invoiceLinesArr[i].invoiceId === invoiceId) {
          invoiceLinesArr.splice(i, 1);
        }
      }
    },

    // ── Receipts ───────────────────────────────────────────────
    async getReceipt(id: string) {
      return receiptsMap.get(id);
    },
    async getReceiptsByCompanyId(companyId: string) {
      return [...receiptsMap.values()].filter((r) => r.companyId === companyId);
    },
    async createReceipt(data: any) {
      const receipt = createTestReceipt(data.companyId, data.uploadedBy, {
        ...data,
      });
      receiptsMap.set(receipt.id, receipt);
      return receipt;
    },
    async updateReceipt(id: string, data: any) {
      const receipt = receiptsMap.get(id);
      if (!receipt) throw new Error('Receipt not found');
      const updated = { ...receipt, ...data };
      receiptsMap.set(id, updated);
      return updated;
    },
    async deleteReceipt(id: string) {
      receiptsMap.delete(id);
    },
  };

  return storage as IStorage;
}

// ─── Seed helpers ────────────────────────────────────────────────────────────

/**
 * Seeds a mock storage with a company, user, and full default chart of accounts.
 * Returns { user, company, accounts, storage } for convenient test setup.
 */
export async function seedTestCompanyWithAccounts(storage: IStorage) {
  const user = await storage.createUser({
    email: 'owner@test.com',
    name: 'Owner',
    password: 'password123',
    isAdmin: false,
    userType: 'customer',
  } as any);

  const company = await storage.createCompany({
    name: 'Test LLC',
    baseCurrency: 'AED',
    locale: 'en',
    companyType: 'customer',
  } as any);

  await storage.createCompanyUser({
    companyId: company.id,
    userId: user.id,
    role: 'owner',
  } as any);

  // Create all default chart of accounts
  const accounts: Account[] = [];
  for (const tpl of defaultChartOfAccounts) {
    const acct = await storage.createAccount({
      companyId: company.id,
      code: tpl.code,
      nameEn: tpl.nameEn,
      nameAr: tpl.nameAr,
      description: tpl.description,
      type: tpl.type,
      subType: tpl.subType,
      isVatAccount: tpl.isVatAccount,
      vatType: tpl.vatType,
      isSystemAccount: tpl.isSystemAccount,
      isActive: true,
      isArchived: false,
    } as any);
    accounts.push(acct);
  }

  return { user, company, accounts, storage };
}

/**
 * Creates a balanced journal entry with the given lines.
 * Each line should specify { accountId, debit?, credit? }.
 * Returns { entry, lines }.
 */
export async function createBalancedJournalEntry(
  storage: IStorage,
  companyId: string,
  createdBy: string,
  lines: Array<{ accountId: string; debit?: string; credit?: string; description?: string }>,
  overrides: Partial<JournalEntry> = {},
) {
  const date = overrides.date ?? new Date();
  const entryNumber = await storage.generateEntryNumber(companyId, date);

  const entry = await storage.createJournalEntry({
    companyId,
    entryNumber,
    date,
    memo: overrides.memo ?? 'Test entry',
    status: overrides.status ?? 'posted',
    source: overrides.source ?? 'manual',
    sourceId: overrides.sourceId ?? null,
    reversedEntryId: overrides.reversedEntryId ?? null,
    reversalReason: overrides.reversalReason ?? null,
    createdBy,
  } as any);

  const createdLines: JournalLine[] = [];
  for (const line of lines) {
    const jl = await storage.createJournalLine({
      entryId: entry.id,
      accountId: line.accountId,
      debit: line.debit ?? '0',
      credit: line.credit ?? '0',
      description: line.description ?? null,
      isReconciled: false,
    } as any);
    createdLines.push(jl);
  }

  return { entry, lines: createdLines };
}

/**
 * Finds an account by code in the given accounts array.
 */
export function findAccount(accounts: Account[], code: string): Account {
  const found = accounts.find((a) => a.code === code);
  if (!found) throw new Error(`Account with code ${code} not found in test data`);
  return found;
}

// Re-export for convenience
export { defaultChartOfAccounts, ACCOUNT_CODES };
