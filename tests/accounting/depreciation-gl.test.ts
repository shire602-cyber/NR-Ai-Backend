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
// Pure helper functions mirroring depreciation-GL business logic
// from fixed-assets.routes.ts
// ---------------------------------------------------------------------------

interface FixedAsset {
  id: string;
  assetName: string;
  purchaseCost: string;      // Drizzle numeric -> string
  salvageValue: string;       // Drizzle numeric -> string
  usefulLifeYears: number;
  accumulatedDepreciation: string;
}

interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

/** Monthly depreciation = (cost - salvage) / (usefulLifeYears * 12) */
function calculateMonthlyDepreciation(asset: FixedAsset): number {
  const cost = Number(asset.purchaseCost);
  const salvage = Number(asset.salvageValue);
  const depreciableBase = cost - salvage;
  const totalMonths = asset.usefulLifeYears * 12;
  const monthly = depreciableBase / totalMonths;
  return Math.round(monthly * 100) / 100;
}

/**
 * Build the depreciation journal entry lines.
 * Mirrors fixed-assets.routes.ts depreciation endpoint:
 *   - Debit: Depreciation Expense
 *   - Credit: Accumulated Depreciation
 */
function buildDepreciationJournalLines(
  monthlyDepreciation: number,
  assetName: string,
  depExpenseAccountId: string,
  accumDepAccountId: string,
): JournalLine[] {
  if (monthlyDepreciation <= 0) return [];

  return [
    {
      accountId: depExpenseAccountId,
      debit: monthlyDepreciation,
      credit: 0,
      description: `Depreciation expense - ${assetName}`,
    },
    {
      accountId: accumDepAccountId,
      debit: 0,
      credit: monthlyDepreciation,
      description: `Accumulated depreciation - ${assetName}`,
    },
  ];
}

/**
 * Idempotency check: determine if a depreciation JE already exists
 * for a given asset in a given month.
 */
function hasExistingDepreciationEntry(
  existingEntries: Array<{ source: string; sourceId: string; monthKey: string }>,
  assetId: string,
  monthKey: string,
): boolean {
  return existingEntries.some(
    (e) => e.source === 'depreciation' && e.sourceId === assetId && e.monthKey === monthKey,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Depreciation GL', () => {
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
  // 1. Depreciation creates JE (Debit Depreciation Expense, Credit Accumulated)
  // -------------------------------------------------------------------------
  it('depreciation creates JE (Debit Depreciation Expense, Credit Accumulated Depreciation)', () => {
    const depExpenseAccount = findAccount(accounts, ACCOUNT_CODES.DEPRECIATION_EXPENSE);
    const accumDepAccount = findAccount(accounts, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);

    const asset: FixedAsset = {
      id: 'asset-1',
      assetName: 'Office Laptop',
      purchaseCost: '6000.00',
      salvageValue: '600.00',
      usefulLifeYears: 3,
      accumulatedDepreciation: '0.00',
    };

    const monthly = calculateMonthlyDepreciation(asset);
    const jeLines = buildDepreciationJournalLines(monthly, asset.assetName, depExpenseAccount.id, accumDepAccount.id);

    expect(jeLines).toHaveLength(2);

    // Debit: Depreciation Expense
    const expLine = jeLines.find((l) => l.accountId === depExpenseAccount.id)!;
    expect(expLine.debit).toBe(monthly);
    expect(expLine.credit).toBe(0);

    // Credit: Accumulated Depreciation
    const accumLine = jeLines.find((l) => l.accountId === accumDepAccount.id)!;
    expect(accumLine.credit).toBe(monthly);
    expect(accumLine.debit).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. Monthly depreciation amount is correct
  // -------------------------------------------------------------------------
  it('monthly depreciation amount is correct', () => {
    // Case 1: (120000 - 12000) / (5 * 12) = 108000 / 60 = 1800
    const asset1: FixedAsset = {
      id: 'asset-1',
      assetName: 'Machine A',
      purchaseCost: '120000.00',
      salvageValue: '12000.00',
      usefulLifeYears: 5,
      accumulatedDepreciation: '0.00',
    };
    expect(calculateMonthlyDepreciation(asset1)).toBe(1800);

    // Case 2: (6000 - 600) / (3 * 12) = 5400 / 36 = 150
    const asset2: FixedAsset = {
      id: 'asset-2',
      assetName: 'Laptop',
      purchaseCost: '6000.00',
      salvageValue: '600.00',
      usefulLifeYears: 3,
      accumulatedDepreciation: '0.00',
    };
    expect(calculateMonthlyDepreciation(asset2)).toBe(150);

    // Case 3: zero salvage: (60000 - 0) / (3 * 12) = 60000 / 36 = 1666.67
    const asset3: FixedAsset = {
      id: 'asset-3',
      assetName: 'Furniture',
      purchaseCost: '60000.00',
      salvageValue: '0',
      usefulLifeYears: 3,
      accumulatedDepreciation: '0.00',
    };
    expect(calculateMonthlyDepreciation(asset3)).toBeCloseTo(1666.67, 2);
  });

  // -------------------------------------------------------------------------
  // 3. Idempotency: duplicate month run doesn't create second JE
  // -------------------------------------------------------------------------
  it('idempotency: duplicate month run does not create second JE', () => {
    const existingEntries = [
      { source: 'depreciation', sourceId: 'asset-1', monthKey: '2025-01' },
      { source: 'depreciation', sourceId: 'asset-1', monthKey: '2025-02' },
      { source: 'depreciation', sourceId: 'asset-2', monthKey: '2025-01' },
    ];

    // Already exists for asset-1 in 2025-01
    expect(hasExistingDepreciationEntry(existingEntries, 'asset-1', '2025-01')).toBe(true);

    // Does not exist for asset-1 in 2025-03
    expect(hasExistingDepreciationEntry(existingEntries, 'asset-1', '2025-03')).toBe(false);

    // Does not exist for asset-2 in 2025-02
    expect(hasExistingDepreciationEntry(existingEntries, 'asset-2', '2025-02')).toBe(false);

    // Already exists for asset-2 in 2025-01
    expect(hasExistingDepreciationEntry(existingEntries, 'asset-2', '2025-01')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4. JE debits = credits
  // -------------------------------------------------------------------------
  it('JE debits = credits for all depreciation entries', () => {
    const depExpenseAccount = findAccount(accounts, ACCOUNT_CODES.DEPRECIATION_EXPENSE);
    const accumDepAccount = findAccount(accounts, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);

    const assets: FixedAsset[] = [
      { id: 'a1', assetName: 'Server', purchaseCost: '50000.00', salvageValue: '5000.00', usefulLifeYears: 5, accumulatedDepreciation: '0.00' },
      { id: 'a2', assetName: 'Desk', purchaseCost: '3000.00', salvageValue: '300.00', usefulLifeYears: 7, accumulatedDepreciation: '0.00' },
      { id: 'a3', assetName: 'Vehicle', purchaseCost: '80000.00', salvageValue: '15000.00', usefulLifeYears: 4, accumulatedDepreciation: '0.00' },
    ];

    for (const asset of assets) {
      const monthly = calculateMonthlyDepreciation(asset);
      const jeLines = buildDepreciationJournalLines(monthly, asset.assetName, depExpenseAccount.id, accumDepAccount.id);

      const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
      const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);

      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(monthly);
    }
  });

  // -------------------------------------------------------------------------
  // 5. Fully depreciated asset produces no JE lines
  // -------------------------------------------------------------------------
  it('fully depreciated asset with zero monthly amount produces no JE lines', () => {
    const depExpenseAccount = findAccount(accounts, ACCOUNT_CODES.DEPRECIATION_EXPENSE);
    const accumDepAccount = findAccount(accounts, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);

    // Asset where cost = salvage => depreciable base = 0 => monthly = 0
    const fullyDepreciated: FixedAsset = {
      id: 'asset-done',
      assetName: 'Old Machine',
      purchaseCost: '10000.00',
      salvageValue: '10000.00',
      usefulLifeYears: 5,
      accumulatedDepreciation: '0.00',
    };

    const monthly = calculateMonthlyDepreciation(fullyDepreciated);
    expect(monthly).toBe(0);

    const jeLines = buildDepreciationJournalLines(monthly, fullyDepreciated.assetName, depExpenseAccount.id, accumDepAccount.id);
    expect(jeLines).toHaveLength(0);
  });
});
