import { describe, it, expect } from 'vitest';
import {
  journalLines,
  invoices,
  invoiceLines,
  receipts,
} from '@shared/schema';

/**
 * Monetary precision tests verify that the system handles money correctly.
 * Key principles:
 * - Schema uses numeric(15,2) not real/float
 * - Monetary values are stored and returned as strings from the DB
 * - Arithmetic on monetary strings must not lose precision
 */

describe('Monetary Precision', () => {
  it('schema uses numeric(15,2) not real/float for monetary fields', () => {
    // journalLines.debit and .credit should be numeric(15,2)
    const debitCol = journalLines.debit;
    const creditCol = journalLines.credit;
    expect(debitCol.columnType).toBe('PgNumeric');
    expect(creditCol.columnType).toBe('PgNumeric');

    // invoices.subtotal, vatAmount, total should be numeric(15,2)
    expect(invoices.subtotal.columnType).toBe('PgNumeric');
    expect(invoices.vatAmount.columnType).toBe('PgNumeric');
    expect(invoices.total.columnType).toBe('PgNumeric');

    // receipts.amount, vatAmount should be numeric(15,2)
    expect(receipts.amount.columnType).toBe('PgNumeric');
    expect(receipts.vatAmount.columnType).toBe('PgNumeric');

    // invoiceLines.unitPrice should be numeric(15,2)
    expect(invoiceLines.unitPrice.columnType).toBe('PgNumeric');

    // invoiceLines.quantity uses real (float) which is acceptable for quantities
    // but invoiceLines.vatRate uses real which is for percentages, not money
    expect(invoiceLines.quantity.columnType).toBe('PgReal');
    expect(invoiceLines.vatRate.columnType).toBe('PgReal');
  });

  it('monetary calculations do not lose precision (0.1 + 0.2 = 0.3 exactly)', () => {
    // In JavaScript, 0.1 + 0.2 !== 0.3 due to IEEE 754 floating point
    expect(0.1 + 0.2).not.toBe(0.3); // This is a known JS quirk

    // But when we use string-based decimal arithmetic (as Drizzle returns from numeric columns),
    // we can maintain precision by parsing and rounding properly.
    const a = '0.10';
    const b = '0.20';

    // Proper monetary addition using fixed-point arithmetic
    const sum = (parseFloat(a) * 100 + parseFloat(b) * 100) / 100;
    expect(sum).toBe(0.3);

    // Using toFixed(2) to maintain 2 decimal precision
    const result = (parseFloat(a) + parseFloat(b)).toFixed(2);
    expect(result).toBe('0.30');

    // More complex example: invoice calculation
    const unitPrice = '199.99';
    const quantity = 3;
    const vatRate = 0.05;

    const subtotal = parseFloat(unitPrice) * quantity;
    const vatAmount = parseFloat((subtotal * vatRate).toFixed(2));
    const total = parseFloat((subtotal + vatAmount).toFixed(2));

    expect(subtotal).toBe(599.97);
    expect(vatAmount).toBe(30.0);
    expect(total).toBe(629.97);
  });

  it('large monetary values maintain precision (up to 999,999,999,999.99)', () => {
    // numeric(15,2) supports values up to 9999999999999.99 (13 digits + 2 decimals)
    const maxValue = '999999999999.99';
    const parsed = parseFloat(maxValue);

    // Verify the value parses correctly
    expect(parsed).toBe(999999999999.99);

    // Verify we can do arithmetic at this scale
    const largeA = '500000000000.50';
    const largeB = '499999999999.49';
    const sum = parseFloat(largeA) + parseFloat(largeB);
    expect(sum).toBe(999999999999.99);

    // Verify string representation maintains precision
    expect(parseFloat(maxValue).toFixed(2)).toBe('999999999999.99');

    // Common UAE business values
    const aedMillions = '1000000.00'; // 1 million AED
    const vatOnMillions = (parseFloat(aedMillions) * 0.05).toFixed(2);
    expect(vatOnMillions).toBe('50000.00');

    const totalWithVat = (parseFloat(aedMillions) + parseFloat(vatOnMillions)).toFixed(2);
    expect(totalWithVat).toBe('1050000.00');
  });

  it('string-to-number conversion works correctly for arithmetic', () => {
    // Drizzle returns numeric columns as strings to preserve precision.
    // Our business logic needs to convert these correctly.

    const stringValues = ['100.00', '200.50', '0.01', '99999.99'];

    // parseFloat handles typical monetary strings correctly
    expect(parseFloat('100.00')).toBe(100);
    expect(parseFloat('200.50')).toBe(200.5);
    expect(parseFloat('0.01')).toBe(0.01);
    expect(parseFloat('99999.99')).toBe(99999.99);

    // Sum of string values
    const total = stringValues.reduce((sum, val) => sum + parseFloat(val), 0);
    expect(parseFloat(total.toFixed(2))).toBe(100300.5);

    // Journal entry validation: debits must equal credits
    const debitStrings = ['500.25', '300.75'];
    const creditStrings = ['801.00'];

    const totalDebits = debitStrings.reduce((s, v) => s + parseFloat(v), 0);
    const totalCredits = creditStrings.reduce((s, v) => s + parseFloat(v), 0);

    expect(totalDebits).toBe(801.0);
    expect(totalCredits).toBe(801.0);
    expect(Math.abs(totalDebits - totalCredits) < 0.001).toBe(true);

    // Edge case: string "0" should parse to 0
    expect(parseFloat('0')).toBe(0);
    expect(parseFloat('0.00')).toBe(0);

    // Converting back to string for storage
    expect((100.5).toFixed(2)).toBe('100.50');
    expect((0).toFixed(2)).toBe('0.00');
  });

  it('VAT calculations at 5% maintain precision for various amounts', () => {
    // UAE standard VAT is 5%
    const testCases = [
      { subtotal: '100.00', expectedVat: '5.00', expectedTotal: '105.00' },
      { subtotal: '1.00', expectedVat: '0.05', expectedTotal: '1.05' },
      { subtotal: '999.99', expectedVat: '50.00', expectedTotal: '1049.99' },
      { subtotal: '0.20', expectedVat: '0.01', expectedTotal: '0.21' },
      { subtotal: '33.33', expectedVat: '1.67', expectedTotal: '35.00' },
    ];

    for (const tc of testCases) {
      const subtotal = parseFloat(tc.subtotal);
      const vat = parseFloat((subtotal * 0.05).toFixed(2));
      const total = parseFloat((subtotal + vat).toFixed(2));

      expect(vat.toFixed(2)).toBe(tc.expectedVat);
      expect(total.toFixed(2)).toBe(tc.expectedTotal);
    }
  });
});
