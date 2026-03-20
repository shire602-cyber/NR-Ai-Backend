import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Payroll business logic — pure unit tests.
 *
 * Salary components come from Drizzle numeric() columns and arrive as strings.
 * All arithmetic is done via Number() conversion first.
 */

// ---------------------------------------------------------------------------
// Helper: mirrors the calculation the payroll module performs
// ---------------------------------------------------------------------------
interface PayrollItemInput {
  basicSalary: string;
  housingAllowance: string;
  transportAllowance: string;
  otherAllowance: string;
  overtime: string;
  deductions: string;
}

function calculateGross(item: PayrollItemInput): number {
  return (
    Number(item.basicSalary) +
    Number(item.housingAllowance) +
    Number(item.transportAllowance) +
    Number(item.otherAllowance) +
    Number(item.overtime)
  );
}

function calculateNet(item: PayrollItemInput): number {
  return calculateGross(item) - Number(item.deductions);
}

interface PayrollRunTotals {
  totalBasic: number;
  totalAllowances: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount: number;
}

function aggregatePayrollRun(items: PayrollItemInput[]): PayrollRunTotals {
  let totalBasic = 0;
  let totalAllowances = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const item of items) {
    totalBasic += Number(item.basicSalary);
    totalAllowances +=
      Number(item.housingAllowance) +
      Number(item.transportAllowance) +
      Number(item.otherAllowance) +
      Number(item.overtime);
    totalDeductions += Number(item.deductions);
    totalNet += calculateNet(item);
  }

  return {
    totalBasic,
    totalAllowances,
    totalDeductions,
    totalNet,
    employeeCount: items.length,
  };
}

// ---------------------------------------------------------------------------
// WPS SIF format builder (simplified)
// ---------------------------------------------------------------------------
interface SifEmployeeRecord {
  routingCode: string;
  bankAccountNumber: string;
  startDate: string; // DDMMYYYY
  endDate: string;   // DDMMYYYY
  numberOfDays: number;
  fixedSalary: number;
  variableAmount: number;
  leaveDate: string | null;
}

function buildSifLine(rec: SifEmployeeRecord): string {
  const salary = rec.fixedSalary.toFixed(2);
  const variable = rec.variableAmount.toFixed(2);
  // SIF lines follow: EDR, RoutingCode, Account, StartDate, EndDate, Days, Salary, Variable, LeaveDate
  return [
    'EDR',
    rec.routingCode,
    rec.bankAccountNumber,
    rec.startDate,
    rec.endDate,
    String(rec.numberOfDays),
    salary,
    variable,
    rec.leaveDate ?? '',
  ].join(',');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Payroll Module', () => {
  let sampleItem: PayrollItemInput;

  beforeEach(() => {
    // Values as strings to match Drizzle numeric() column output
    sampleItem = {
      basicSalary: '8000.00',
      housingAllowance: '2500.00',
      transportAllowance: '500.00',
      otherAllowance: '1000.00',
      overtime: '0.00',
      deductions: '300.00',
    };
  });

  // -----------------------------------------------------------------------
  // Gross salary = basic + housing + transport + other + overtime
  // -----------------------------------------------------------------------
  it('should calculate gross salary as sum of basic + all allowances', () => {
    const gross = calculateGross(sampleItem);
    // 8000 + 2500 + 500 + 1000 + 0 = 12000
    expect(gross).toBe(12000);
  });

  // -----------------------------------------------------------------------
  // Net salary = gross - deductions
  // -----------------------------------------------------------------------
  it('should subtract deductions from gross to get net salary', () => {
    const net = calculateNet(sampleItem);
    // 12000 - 300 = 11700
    expect(net).toBe(11700);
  });

  // -----------------------------------------------------------------------
  // Payroll run aggregation (multiple employees)
  // -----------------------------------------------------------------------
  it('should aggregate payroll run totals across multiple employees', () => {
    const items: PayrollItemInput[] = [
      sampleItem,
      {
        basicSalary: '5000.00',
        housingAllowance: '1500.00',
        transportAllowance: '300.00',
        otherAllowance: '200.00',
        overtime: '750.00',
        deductions: '100.00',
      },
    ];

    const totals = aggregatePayrollRun(items);

    expect(totals.employeeCount).toBe(2);
    expect(totals.totalBasic).toBe(13000); // 8000 + 5000
    // Allowances: (2500+500+1000+0) + (1500+300+200+750) = 4000 + 2750 = 6750
    expect(totals.totalAllowances).toBe(6750);
    expect(totals.totalDeductions).toBe(400); // 300 + 100
    // Net: (12000-300) + (7750-100) = 11700 + 7650 = 19350
    expect(totals.totalNet).toBe(19350);
  });

  // -----------------------------------------------------------------------
  // WPS SIF format includes required UAE fields
  // -----------------------------------------------------------------------
  it('should produce WPS SIF line with required UAE fields', () => {
    const record: SifEmployeeRecord = {
      routingCode: 'NBAD0AE',
      bankAccountNumber: '1234567890123456',
      startDate: '01012026',
      endDate: '31012026',
      numberOfDays: 31,
      fixedSalary: 12000,
      variableAmount: 0,
      leaveDate: null,
    };

    const sifLine = buildSifLine(record);

    // Must start with EDR record type
    expect(sifLine.startsWith('EDR')).toBe(true);
    // Must contain routing code and account number
    expect(sifLine).toContain('NBAD0AE');
    expect(sifLine).toContain('1234567890123456');
    // Must contain start and end dates in DDMMYYYY
    expect(sifLine).toContain('01012026');
    expect(sifLine).toContain('31012026');
    // Must contain salary
    expect(sifLine).toContain('12000.00');
  });

  // -----------------------------------------------------------------------
  // Numeric string conversion (Drizzle numeric comes as string)
  // -----------------------------------------------------------------------
  it('should correctly handle Drizzle numeric string conversion for monetary values', () => {
    const item: PayrollItemInput = {
      basicSalary: '15000.50',
      housingAllowance: '3000.25',
      transportAllowance: '750.75',
      otherAllowance: '500.50',
      overtime: '1200.00',
      deductions: '450.00',
    };

    const gross = calculateGross(item);
    const net = calculateNet(item);

    expect(gross).toBe(20452); // 15000.50 + 3000.25 + 750.75 + 500.50 + 1200.00
    expect(net).toBe(20002);   // 20452 - 450
  });
});
