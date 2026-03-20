import { describe, it, expect } from 'vitest';

/**
 * Bill-pay / Accounts Payable — pure unit tests.
 *
 * Schema tables: vendorBills, billLineItems, billPayments
 * All monetary fields are Drizzle numeric() → strings.
 */

// ---------------------------------------------------------------------------
// Helper types matching schema shape
// ---------------------------------------------------------------------------
interface BillLineItem {
  description: string;
  quantity: string;   // numeric
  unitPrice: string;  // numeric
  vatRate: string;    // numeric (percent, e.g. "5")
}

interface VendorBill {
  totalAmount: string;
  amountPaid: string;
}

// ---------------------------------------------------------------------------
// Business logic helpers
// ---------------------------------------------------------------------------

/** Line amount = quantity * unitPrice */
function lineAmount(line: BillLineItem): number {
  return Number(line.quantity) * Number(line.unitPrice);
}

/** Line VAT = amount * (vatRate / 100) */
function lineVat(line: BillLineItem): number {
  return lineAmount(line) * (Number(line.vatRate) / 100);
}

/** Bill subtotal = sum of all line amounts */
function billSubtotal(lines: BillLineItem[]): number {
  return lines.reduce((sum, l) => sum + lineAmount(l), 0);
}

/** Bill total = subtotal + total VAT */
function billTotal(lines: BillLineItem[]): number {
  const sub = billSubtotal(lines);
  const vat = lines.reduce((sum, l) => sum + lineVat(l), 0);
  return sub + vat;
}

/** Outstanding balance after payments */
function outstandingBalance(bill: VendorBill): number {
  return Number(bill.totalAmount) - Number(bill.amountPaid);
}

/** Apply a payment and return updated amountPaid & remaining */
function applyPayment(bill: VendorBill, paymentAmount: number): { amountPaid: number; remaining: number } {
  const newPaid = Number(bill.amountPaid) + paymentAmount;
  const remaining = Number(bill.totalAmount) - newPaid;
  return { amountPaid: newPaid, remaining: Math.max(remaining, 0) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Bill Pay Module', () => {
  const sampleLines: BillLineItem[] = [
    { description: 'Office supplies', quantity: '10', unitPrice: '150.00', vatRate: '5' },
    { description: 'Printer ink', quantity: '5', unitPrice: '200.00', vatRate: '5' },
    { description: 'Cleaning service', quantity: '1', unitPrice: '3000.00', vatRate: '5' },
  ];

  // -----------------------------------------------------------------------
  // Bill total = sum of line items (including VAT)
  // -----------------------------------------------------------------------
  it('should calculate bill total as sum of line items plus VAT', () => {
    // Line 1: 10 * 150 = 1500, VAT = 75
    // Line 2: 5 * 200 = 1000, VAT = 50
    // Line 3: 1 * 3000 = 3000, VAT = 150
    // Subtotal = 5500, Total VAT = 275, Total = 5775
    expect(billSubtotal(sampleLines)).toBe(5500);
    expect(billTotal(sampleLines)).toBe(5775);
  });

  // -----------------------------------------------------------------------
  // Full payment reduces outstanding to zero
  // -----------------------------------------------------------------------
  it('should reduce outstanding balance to zero after full payment', () => {
    const bill: VendorBill = { totalAmount: '5775.00', amountPaid: '0.00' };

    expect(outstandingBalance(bill)).toBe(5775);

    const result = applyPayment(bill, 5775);
    expect(result.amountPaid).toBe(5775);
    expect(result.remaining).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Partial payment calculates remaining correctly
  // -----------------------------------------------------------------------
  it('should calculate remaining balance after partial payment', () => {
    const bill: VendorBill = { totalAmount: '5775.00', amountPaid: '0.00' };

    // First partial payment
    const after1 = applyPayment(bill, 2000);
    expect(after1.amountPaid).toBe(2000);
    expect(after1.remaining).toBe(3775);

    // Second partial payment (continuing from after1)
    const updatedBill: VendorBill = {
      totalAmount: bill.totalAmount,
      amountPaid: String(after1.amountPaid),
    };
    const after2 = applyPayment(updatedBill, 1775);
    expect(after2.amountPaid).toBe(3775);
    expect(after2.remaining).toBe(2000);
  });

  // -----------------------------------------------------------------------
  // Over-payment clamped to zero remaining
  // -----------------------------------------------------------------------
  it('should clamp remaining to zero if payment exceeds total', () => {
    const bill: VendorBill = { totalAmount: '1000.00', amountPaid: '800.00' };

    const result = applyPayment(bill, 500); // pays 500 on top of 800, total exceeds 1000
    expect(result.remaining).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Single line item bill total
  // -----------------------------------------------------------------------
  it('should handle a single line item bill correctly', () => {
    const single: BillLineItem[] = [
      { description: 'Consulting', quantity: '1', unitPrice: '10000.00', vatRate: '0' },
    ];

    expect(billSubtotal(single)).toBe(10000);
    expect(billTotal(single)).toBe(10000); // zero VAT
  });
});
