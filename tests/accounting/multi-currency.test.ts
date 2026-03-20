import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Pure helper functions mirroring multi-currency business logic
// from invoices.routes.ts and the journal entry schema
// ---------------------------------------------------------------------------

interface MultiCurrencyEntry {
  currency: string;
  exchangeRate: number;
  /** Amount in the original (foreign) currency */
  originalAmount: number;
}

/**
 * Determine exchange rate for a transaction.
 * AED (base currency) always uses 1.0.
 * Missing/undefined rate defaults to 1.0 (safe fallback).
 */
function resolveExchangeRate(
  currency: string,
  baseCurrency: string,
  providedRate: number | undefined | null,
): number {
  if (currency === baseCurrency) {
    return 1.0;
  }
  return providedRate ?? 1.0;
}

/**
 * Convert a foreign-currency amount to the base currency.
 * baseAmount = originalAmount * exchangeRate
 */
function convertToBaseCurrency(originalAmount: number, exchangeRate: number): number {
  return originalAmount * exchangeRate;
}

/**
 * Build journal line amounts for a multi-currency transaction.
 * The GL always records in base currency; original amounts are preserved as metadata.
 */
function buildMultiCurrencyJournalLine(
  amount: number,
  currency: string,
  baseCurrency: string,
  exchangeRate: number,
): {
  glAmount: number;
  originalAmount: number | null;
  originalCurrency: string | null;
} {
  const glAmount = currency !== baseCurrency
    ? convertToBaseCurrency(amount, exchangeRate)
    : amount;

  return {
    glAmount,
    originalAmount: currency !== baseCurrency ? amount : null,
    originalCurrency: currency !== baseCurrency ? currency : null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Multi-Currency', () => {
  const BASE_CURRENCY = 'AED';

  // -------------------------------------------------------------------------
  // 1. AED transactions use exchangeRate of 1.0 (no conversion)
  // -------------------------------------------------------------------------
  it('AED transactions use exchangeRate of 1.0 (no conversion)', () => {
    const rate = resolveExchangeRate('AED', BASE_CURRENCY, undefined);
    expect(rate).toBe(1.0);

    // GL amount should equal original amount when currency is AED
    const amount = 5000;
    const glAmount = convertToBaseCurrency(amount, rate);
    expect(glAmount).toBe(amount);
  });

  // -------------------------------------------------------------------------
  // 2. Foreign currency converts to base currency: amount * exchangeRate
  // -------------------------------------------------------------------------
  it('foreign currency converts to base currency: amount * exchangeRate', () => {
    const usdToAed = 3.6725; // 1 USD = 3.6725 AED
    const usdAmount = 1000;

    const aedAmount = convertToBaseCurrency(usdAmount, usdToAed);
    expect(aedAmount).toBeCloseTo(3672.5, 2);

    // EUR example
    const eurToAed = 4.02;
    const eurAmount = 2500;

    const aedFromEur = convertToBaseCurrency(eurAmount, eurToAed);
    expect(aedFromEur).toBeCloseTo(10050, 2);
  });

  // -------------------------------------------------------------------------
  // 3. Original amounts preserved on journal lines
  // -------------------------------------------------------------------------
  it('original amounts preserved on journal lines for foreign currency', () => {
    const usdToAed = 3.6725;
    const invoiceTotal = 2000; // USD

    // Foreign currency: original amounts should be preserved
    const foreignLine = buildMultiCurrencyJournalLine(invoiceTotal, 'USD', BASE_CURRENCY, usdToAed);
    expect(foreignLine.glAmount).toBeCloseTo(7345, 2); // 2000 * 3.6725
    expect(foreignLine.originalAmount).toBe(2000);
    expect(foreignLine.originalCurrency).toBe('USD');

    // AED transaction: no original amount metadata
    const aedLine = buildMultiCurrencyJournalLine(invoiceTotal, 'AED', BASE_CURRENCY, 1.0);
    expect(aedLine.glAmount).toBe(2000);
    expect(aedLine.originalAmount).toBeNull();
    expect(aedLine.originalCurrency).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 4. Missing exchange rate defaults to 1.0
  // -------------------------------------------------------------------------
  it('missing exchange rate defaults to 1.0', () => {
    // Undefined rate
    const rate1 = resolveExchangeRate('USD', BASE_CURRENCY, undefined);
    expect(rate1).toBe(1.0);

    // Null rate
    const rate2 = resolveExchangeRate('EUR', BASE_CURRENCY, null);
    expect(rate2).toBe(1.0);

    // With the default 1.0 rate, amount passes through unchanged
    const amount = 750;
    const glAmount = convertToBaseCurrency(amount, rate1);
    expect(glAmount).toBe(750);
  });

  // -------------------------------------------------------------------------
  // 5. Full invoice JE in foreign currency has balanced debits and credits
  // -------------------------------------------------------------------------
  it('full multi-currency invoice JE has balanced debits and credits', () => {
    const usdToAed = 3.6725;
    const subtotal = 10000; // USD
    const vatAmount = 500;  // USD
    const total = 10500;    // USD

    // Convert all amounts to AED for the GL
    const baseTotal = convertToBaseCurrency(total, usdToAed);
    const baseSubtotal = convertToBaseCurrency(subtotal, usdToAed);
    const baseVat = convertToBaseCurrency(vatAmount, usdToAed);

    // Build JE lines (same structure as invoices.routes.ts)
    const jeLines = [
      { debit: baseTotal, credit: 0 },       // Debit AR
      { debit: 0, credit: baseSubtotal },     // Credit Revenue
      { debit: 0, credit: baseVat },          // Credit VAT
    ];

    const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);

    // Debits must equal credits
    expect(totalDebits).toBeCloseTo(totalCredits, 2);
  });
});
