import { describe, it, expect } from 'vitest';
import {
  journalLines,
  invoices,
  vendorBills,
  billLineItems,
  payrollItems,
  fixedAssets,
  expenseClaimItems,
  employees,
  receipts,
  budgets,
  users,
  journalEntries,
} from '@shared/schema';

/**
 * Schema validation — verifies that Drizzle table definitions
 * enforce correct types, required constraints, and field formats.
 *
 * These tests inspect the column config objects exposed by Drizzle
 * to validate the schema at the structural level, without a database.
 */

// ---------------------------------------------------------------------------
// Helper: extract column config from a Drizzle table
// ---------------------------------------------------------------------------
function getColumnConfig(table: any, columnName: string) {
  const columns = table[Symbol.for('drizzle:Columns')] ?? table;
  // Drizzle stores columns as properties on the table object
  for (const key of Object.keys(table)) {
    const col = table[key];
    if (col?.name === columnName) {
      return col;
    }
  }
  return undefined;
}

function getColumnByProperty(table: any, propName: string) {
  return table[propName];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Schema Validation — Monetary Fields Use Numeric Type', () => {
  // -----------------------------------------------------------------------
  // All monetary fields must use numeric (not real/float)
  // -----------------------------------------------------------------------
  it('should use numeric type for journal line debit/credit fields', () => {
    const debitCol = getColumnByProperty(journalLines, 'debit');
    const creditCol = getColumnByProperty(journalLines, 'credit');

    // Drizzle numeric columns have columnType = 'PgNumeric'
    expect(debitCol.columnType).toBe('PgNumeric');
    expect(creditCol.columnType).toBe('PgNumeric');
  });

  it('should use numeric type for invoice monetary fields', () => {
    const subtotalCol = getColumnByProperty(invoices, 'subtotal');
    const vatCol = getColumnByProperty(invoices, 'vatAmount');
    const totalCol = getColumnByProperty(invoices, 'total');

    expect(subtotalCol.columnType).toBe('PgNumeric');
    expect(vatCol.columnType).toBe('PgNumeric');
    expect(totalCol.columnType).toBe('PgNumeric');
  });

  it('should use numeric type for vendor bill monetary fields', () => {
    const subtotalCol = getColumnByProperty(vendorBills, 'subtotal');
    const vatCol = getColumnByProperty(vendorBills, 'vatAmount');
    const totalCol = getColumnByProperty(vendorBills, 'totalAmount');
    const paidCol = getColumnByProperty(vendorBills, 'amountPaid');

    expect(subtotalCol.columnType).toBe('PgNumeric');
    expect(vatCol.columnType).toBe('PgNumeric');
    expect(totalCol.columnType).toBe('PgNumeric');
    expect(paidCol.columnType).toBe('PgNumeric');
  });

  it('should use numeric type for payroll item salary fields', () => {
    const basic = getColumnByProperty(payrollItems, 'basicSalary');
    const housing = getColumnByProperty(payrollItems, 'housingAllowance');
    const transport = getColumnByProperty(payrollItems, 'transportAllowance');
    const net = getColumnByProperty(payrollItems, 'netSalary');
    const deductions = getColumnByProperty(payrollItems, 'deductions');

    expect(basic.columnType).toBe('PgNumeric');
    expect(housing.columnType).toBe('PgNumeric');
    expect(transport.columnType).toBe('PgNumeric');
    expect(net.columnType).toBe('PgNumeric');
    expect(deductions.columnType).toBe('PgNumeric');
  });

  it('should use numeric type for fixed asset monetary fields', () => {
    const cost = getColumnByProperty(fixedAssets, 'purchaseCost');
    const salvage = getColumnByProperty(fixedAssets, 'salvageValue');
    const accumulated = getColumnByProperty(fixedAssets, 'accumulatedDepreciation');

    expect(cost.columnType).toBe('PgNumeric');
    expect(salvage.columnType).toBe('PgNumeric');
    expect(accumulated.columnType).toBe('PgNumeric');
  });

  it('should use numeric type for expense claim item amounts', () => {
    const amount = getColumnByProperty(expenseClaimItems, 'amount');
    const vat = getColumnByProperty(expenseClaimItems, 'vatAmount');

    expect(amount.columnType).toBe('PgNumeric');
    expect(vat.columnType).toBe('PgNumeric');
  });
});

describe('Schema Validation — Required Fields Reject Null', () => {
  // -----------------------------------------------------------------------
  // Required fields have notNull constraint
  // -----------------------------------------------------------------------
  it('should mark user email as not-null', () => {
    const emailCol = getColumnByProperty(users, 'email');
    expect(emailCol.notNull).toBe(true);
  });

  it('should mark user name as not-null', () => {
    const nameCol = getColumnByProperty(users, 'name');
    expect(nameCol.notNull).toBe(true);
  });

  it('should mark journal entry companyId as not-null', () => {
    const companyIdCol = getColumnByProperty(journalEntries, 'companyId');
    expect(companyIdCol.notNull).toBe(true);
  });

  it('should mark employee fullName as not-null', () => {
    const nameCol = getColumnByProperty(employees, 'fullName');
    expect(nameCol.notNull).toBe(true);
  });

  it('should mark journal line accountId as not-null', () => {
    const accountCol = getColumnByProperty(journalLines, 'accountId');
    expect(accountCol.notNull).toBe(true);
  });
});

describe('Schema Validation — UUID Fields Have Correct Format', () => {
  // -----------------------------------------------------------------------
  // UUID primary key fields use the uuid type
  // -----------------------------------------------------------------------
  it('should use uuid type for user id field', () => {
    const idCol = getColumnByProperty(users, 'id');
    expect(idCol.columnType).toBe('PgUUID');
  });

  it('should use uuid type for journal entry id field', () => {
    const idCol = getColumnByProperty(journalEntries, 'id');
    expect(idCol.columnType).toBe('PgUUID');
  });

  it('should use uuid type for journal entry companyId reference', () => {
    const companyIdCol = getColumnByProperty(journalEntries, 'companyId');
    expect(companyIdCol.columnType).toBe('PgUUID');
  });

  it('should use uuid type for invoice id field', () => {
    const idCol = getColumnByProperty(invoices, 'id');
    expect(idCol.columnType).toBe('PgUUID');
  });

  it('should use uuid type for receipt uploadedBy reference', () => {
    const uploadedByCol = getColumnByProperty(receipts, 'uploadedBy');
    expect(uploadedByCol.columnType).toBe('PgUUID');
  });
});
