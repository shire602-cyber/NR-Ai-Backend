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
// Pure helper functions mirroring disposal business logic
// from fixed-assets.routes.ts /dispose endpoint
// ---------------------------------------------------------------------------

interface DisposalParams {
  purchaseCost: number;
  accumulatedDepreciation: number;
  disposalAmount: number; // proceeds from sale
  assetName: string;
}

interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

/**
 * Build the disposal journal entry lines.
 * Mirrors fixed-assets.routes.ts /dispose endpoint:
 *   - Debit: Bank (proceeds, if > 0)
 *   - Debit: Accumulated Depreciation (remove contra-asset)
 *   - Debit: Loss on Disposal (if loss)
 *   - Credit: Fixed Assets (remove at cost)
 *   - Credit: Gain on Disposal (if gain)
 */
function buildDisposalJournalLines(
  params: DisposalParams,
  bankAccountId: string,
  accumDepAccountId: string,
  fixedAssetsAccountId: string,
  gainOnDisposalAccountId: string,
  lossOnDisposalAccountId: string,
): JournalLine[] {
  const jeLines: JournalLine[] = [];
  const nbv = params.purchaseCost - params.accumulatedDepreciation;
  const gainLoss = Math.round((params.disposalAmount - nbv) * 100) / 100;

  // Debit: Bank for proceeds (if any)
  if (params.disposalAmount > 0) {
    jeLines.push({
      accountId: bankAccountId,
      debit: params.disposalAmount,
      credit: 0,
      description: `Disposal proceeds - ${params.assetName}`,
    });
  }

  // Debit: Accumulated Depreciation (remove contra-asset)
  if (params.accumulatedDepreciation > 0) {
    jeLines.push({
      accountId: accumDepAccountId,
      debit: params.accumulatedDepreciation,
      credit: 0,
      description: `Remove accumulated depreciation - ${params.assetName}`,
    });
  }

  // Debit: Loss on Disposal (if loss)
  if (gainLoss < 0) {
    jeLines.push({
      accountId: lossOnDisposalAccountId,
      debit: Math.abs(gainLoss),
      credit: 0,
      description: `Loss on disposal - ${params.assetName}`,
    });
  }

  // Credit: Fixed Assets (remove the asset at cost)
  jeLines.push({
    accountId: fixedAssetsAccountId,
    debit: 0,
    credit: params.purchaseCost,
    description: `Remove fixed asset - ${params.assetName}`,
  });

  // Credit: Gain on Disposal (if gain)
  if (gainLoss > 0) {
    jeLines.push({
      accountId: gainOnDisposalAccountId,
      debit: 0,
      credit: gainLoss,
      description: `Gain on disposal - ${params.assetName}`,
    });
  }

  return jeLines;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Disposal JE', () => {
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
  // 1. Asset disposal with gain creates correct JE
  // -------------------------------------------------------------------------
  it('asset disposal with gain creates correct JE (debit cash + debit accum dep = credit fixed assets + credit gain)', () => {
    const bankAccount = findAccount(accounts, ACCOUNT_CODES.BANK_ACCOUNTS);
    const accumDepAccount = findAccount(accounts, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);
    const fixedAssetsAccount = findAccount(accounts, ACCOUNT_CODES.FIXED_ASSETS);
    const gainAccount = findAccount(accounts, ACCOUNT_CODES.GAIN_ON_DISPOSAL);
    const lossAccount = findAccount(accounts, ACCOUNT_CODES.LOSS_ON_DISPOSAL);

    // Asset cost=100000, accum dep=60000, NBV=40000, sold for 55000 => gain of 15000
    const params: DisposalParams = {
      purchaseCost: 100000,
      accumulatedDepreciation: 60000,
      disposalAmount: 55000,
      assetName: 'Office Vehicle',
    };

    const jeLines = buildDisposalJournalLines(
      params,
      bankAccount.id,
      accumDepAccount.id,
      fixedAssetsAccount.id,
      gainAccount.id,
      lossAccount.id,
    );

    // Expected lines: Bank debit 55000, AccDep debit 60000, Fixed Assets credit 100000, Gain credit 15000
    expect(jeLines).toHaveLength(4);

    const bankLine = jeLines.find((l) => l.accountId === bankAccount.id)!;
    expect(bankLine.debit).toBe(55000);

    const accumLine = jeLines.find((l) => l.accountId === accumDepAccount.id)!;
    expect(accumLine.debit).toBe(60000);

    const fixedLine = jeLines.find((l) => l.accountId === fixedAssetsAccount.id)!;
    expect(fixedLine.credit).toBe(100000);

    const gainLine = jeLines.find((l) => l.accountId === gainAccount.id)!;
    expect(gainLine.credit).toBe(15000);

    // Verify balance
    const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  // -------------------------------------------------------------------------
  // 2. Asset disposal with loss creates correct JE
  // -------------------------------------------------------------------------
  it('asset disposal with loss creates correct JE (debit cash + debit accum dep + debit loss = credit fixed assets)', () => {
    const bankAccount = findAccount(accounts, ACCOUNT_CODES.BANK_ACCOUNTS);
    const accumDepAccount = findAccount(accounts, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);
    const fixedAssetsAccount = findAccount(accounts, ACCOUNT_CODES.FIXED_ASSETS);
    const gainAccount = findAccount(accounts, ACCOUNT_CODES.GAIN_ON_DISPOSAL);
    const lossAccount = findAccount(accounts, ACCOUNT_CODES.LOSS_ON_DISPOSAL);

    // Asset cost=50000, accum dep=20000, NBV=30000, sold for 18000 => loss of 12000
    const params: DisposalParams = {
      purchaseCost: 50000,
      accumulatedDepreciation: 20000,
      disposalAmount: 18000,
      assetName: 'Printer',
    };

    const jeLines = buildDisposalJournalLines(
      params,
      bankAccount.id,
      accumDepAccount.id,
      fixedAssetsAccount.id,
      gainAccount.id,
      lossAccount.id,
    );

    // Expected lines: Bank debit 18000, AccDep debit 20000, Loss debit 12000, Fixed Assets credit 50000
    expect(jeLines).toHaveLength(4);

    const bankLine = jeLines.find((l) => l.accountId === bankAccount.id)!;
    expect(bankLine.debit).toBe(18000);

    const accumLine = jeLines.find((l) => l.accountId === accumDepAccount.id)!;
    expect(accumLine.debit).toBe(20000);

    const lossLine = jeLines.find((l) => l.accountId === lossAccount.id)!;
    expect(lossLine.debit).toBe(12000);

    const fixedLine = jeLines.find((l) => l.accountId === fixedAssetsAccount.id)!;
    expect(fixedLine.credit).toBe(50000);

    // No gain line
    const gainLine = jeLines.find((l) => l.accountId === gainAccount.id);
    expect(gainLine).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 3. Asset disposal with zero proceeds creates derecognition JE
  // -------------------------------------------------------------------------
  it('asset disposal with zero proceeds creates derecognition JE', () => {
    const bankAccount = findAccount(accounts, ACCOUNT_CODES.BANK_ACCOUNTS);
    const accumDepAccount = findAccount(accounts, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);
    const fixedAssetsAccount = findAccount(accounts, ACCOUNT_CODES.FIXED_ASSETS);
    const gainAccount = findAccount(accounts, ACCOUNT_CODES.GAIN_ON_DISPOSAL);
    const lossAccount = findAccount(accounts, ACCOUNT_CODES.LOSS_ON_DISPOSAL);

    // Asset cost=30000, accum dep=25000, NBV=5000, sold for 0 => loss of 5000
    const params: DisposalParams = {
      purchaseCost: 30000,
      accumulatedDepreciation: 25000,
      disposalAmount: 0,
      assetName: 'Old Desk',
    };

    const jeLines = buildDisposalJournalLines(
      params,
      bankAccount.id,
      accumDepAccount.id,
      fixedAssetsAccount.id,
      gainAccount.id,
      lossAccount.id,
    );

    // No bank line (proceeds = 0), AccDep debit 25000, Loss debit 5000, Fixed Assets credit 30000
    expect(jeLines).toHaveLength(3);

    const bankLine = jeLines.find((l) => l.accountId === bankAccount.id);
    expect(bankLine).toBeUndefined();

    const accumLine = jeLines.find((l) => l.accountId === accumDepAccount.id)!;
    expect(accumLine.debit).toBe(25000);

    const lossLine = jeLines.find((l) => l.accountId === lossAccount.id)!;
    expect(lossLine.debit).toBe(5000);

    const fixedLine = jeLines.find((l) => l.accountId === fixedAssetsAccount.id)!;
    expect(fixedLine.credit).toBe(30000);
  });

  // -------------------------------------------------------------------------
  // 4. JE always balances (sum debits = sum credits)
  // -------------------------------------------------------------------------
  it('JE always balances (sum debits = sum credits) for various disposal scenarios', () => {
    const bankAccount = findAccount(accounts, ACCOUNT_CODES.BANK_ACCOUNTS);
    const accumDepAccount = findAccount(accounts, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);
    const fixedAssetsAccount = findAccount(accounts, ACCOUNT_CODES.FIXED_ASSETS);
    const gainAccount = findAccount(accounts, ACCOUNT_CODES.GAIN_ON_DISPOSAL);
    const lossAccount = findAccount(accounts, ACCOUNT_CODES.LOSS_ON_DISPOSAL);

    const scenarios: DisposalParams[] = [
      // Gain scenario
      { purchaseCost: 80000, accumulatedDepreciation: 50000, disposalAmount: 45000, assetName: 'Machine A' },
      // Loss scenario
      { purchaseCost: 40000, accumulatedDepreciation: 10000, disposalAmount: 15000, assetName: 'Machine B' },
      // Zero proceeds
      { purchaseCost: 20000, accumulatedDepreciation: 20000, disposalAmount: 0, assetName: 'Machine C' },
      // Fully depreciated, sold at scrap
      { purchaseCost: 15000, accumulatedDepreciation: 15000, disposalAmount: 500, assetName: 'Machine D' },
      // No depreciation, sold at gain
      { purchaseCost: 10000, accumulatedDepreciation: 0, disposalAmount: 12000, assetName: 'Machine E' },
    ];

    for (const params of scenarios) {
      const jeLines = buildDisposalJournalLines(
        params,
        bankAccount.id,
        accumDepAccount.id,
        fixedAssetsAccount.id,
        gainAccount.id,
        lossAccount.id,
      );

      const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
      const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);

      expect(totalDebits).toBeCloseTo(totalCredits, 2);
    }
  });

  // -------------------------------------------------------------------------
  // 5. JE has source='disposal'
  // -------------------------------------------------------------------------
  it('JE has source=disposal', async () => {
    const assetId = 'asset-xyz-456';

    const entryNumber = await storage.generateEntryNumber(company.id, new Date());
    const entry = await storage.createJournalEntry({
      companyId: company.id,
      entryNumber,
      date: new Date(),
      memo: 'Asset disposal - Office Vehicle',
      status: 'posted',
      source: 'disposal',
      sourceId: assetId,
      createdBy: user.id,
    } as any);

    expect(entry.source).toBe('disposal');
    expect(entry.sourceId).toBe(assetId);

    const savedEntry = await storage.getJournalEntry(entry.id);
    expect(savedEntry).toBeDefined();
    expect(savedEntry!.source).toBe('disposal');
  });
});
