import { describe, it, expect } from 'vitest';

/**
 * Recurring Invoices — pure unit tests.
 *
 * Schema: recurringInvoices table
 *   frequency: weekly | monthly | quarterly | yearly
 *   startDate, nextRunDate, endDate (nullable), isActive
 */

// ---------------------------------------------------------------------------
// Business logic helpers
// ---------------------------------------------------------------------------

type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

interface RecurringInvoice {
  frequency: Frequency;
  nextRunDate: Date;
  endDate: Date | null;
  isActive: boolean;
  totalGenerated: number;
}

/** Calculate the next generation date after the current nextRunDate */
function calculateNextRunDate(current: Date, frequency: Frequency): Date {
  const next = new Date(current);
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

/** Check if the template should be deactivated (end date has passed) */
function shouldDeactivate(invoice: RecurringInvoice, now: Date): boolean {
  if (!invoice.endDate) return false;
  return now > invoice.endDate;
}

/** Process a recurring invoice: generate and advance the schedule */
function processRecurringInvoice(
  invoice: RecurringInvoice,
  now: Date
): RecurringInvoice {
  if (!invoice.isActive) return invoice;
  if (shouldDeactivate(invoice, now)) {
    return { ...invoice, isActive: false };
  }

  // Only generate if nextRunDate is at or before now
  if (invoice.nextRunDate > now) return invoice;

  const nextDate = calculateNextRunDate(invoice.nextRunDate, invoice.frequency);

  const updated: RecurringInvoice = {
    ...invoice,
    nextRunDate: nextDate,
    totalGenerated: invoice.totalGenerated + 1,
  };

  // Deactivate if the new next run date exceeds end date
  if (updated.endDate && nextDate > updated.endDate) {
    updated.isActive = false;
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Recurring Invoices Module', () => {
  // -----------------------------------------------------------------------
  // Monthly: next generation date advances by one month
  // -----------------------------------------------------------------------
  it('should calculate next run date correctly for monthly frequency', () => {
    const current = new Date('2026-01-15T00:00:00Z');
    const next = calculateNextRunDate(current, 'monthly');

    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(1); // February (0-indexed)
    expect(next.getDate()).toBe(15);
  });

  // -----------------------------------------------------------------------
  // Quarterly: next generation date advances by three months
  // -----------------------------------------------------------------------
  it('should calculate next run date correctly for quarterly frequency', () => {
    const current = new Date('2026-01-01T00:00:00Z');
    const next = calculateNextRunDate(current, 'quarterly');

    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(3); // April
    expect(next.getDate()).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Weekly: advances by 7 days
  // -----------------------------------------------------------------------
  it('should calculate next run date correctly for weekly frequency', () => {
    const current = new Date('2026-03-01T00:00:00Z');
    const next = calculateNextRunDate(current, 'weekly');

    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(2); // March
    expect(next.getDate()).toBe(8);  // 1 + 7
  });

  // -----------------------------------------------------------------------
  // Yearly: advances by one year
  // -----------------------------------------------------------------------
  it('should calculate next run date correctly for yearly frequency', () => {
    const current = new Date('2026-06-15T00:00:00Z');
    const next = calculateNextRunDate(current, 'yearly');

    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(5); // June
    expect(next.getDate()).toBe(15);
  });

  // -----------------------------------------------------------------------
  // Template deactivated after end date passes
  // -----------------------------------------------------------------------
  it('should deactivate template after end date passes', () => {
    const invoice: RecurringInvoice = {
      frequency: 'monthly',
      nextRunDate: new Date('2026-12-01T00:00:00Z'),
      endDate: new Date('2026-12-31T00:00:00Z'),
      isActive: true,
      totalGenerated: 11,
    };

    // Process on Dec 1 — should generate and then deactivate
    // because next run (Jan 1 2027) > endDate (Dec 31 2026)
    const now = new Date('2026-12-01T00:00:00Z');
    const updated = processRecurringInvoice(invoice, now);

    expect(updated.totalGenerated).toBe(12);
    expect(updated.isActive).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Template with no end date stays active
  // -----------------------------------------------------------------------
  it('should keep template active when end date is null', () => {
    const invoice: RecurringInvoice = {
      frequency: 'monthly',
      nextRunDate: new Date('2026-06-01T00:00:00Z'),
      endDate: null,
      isActive: true,
      totalGenerated: 5,
    };

    const now = new Date('2026-06-01T00:00:00Z');
    const updated = processRecurringInvoice(invoice, now);

    expect(updated.isActive).toBe(true);
    expect(updated.totalGenerated).toBe(6);
  });

  // -----------------------------------------------------------------------
  // Inactive template is not processed
  // -----------------------------------------------------------------------
  it('should not process an inactive template', () => {
    const invoice: RecurringInvoice = {
      frequency: 'monthly',
      nextRunDate: new Date('2026-01-01T00:00:00Z'),
      endDate: null,
      isActive: false,
      totalGenerated: 3,
    };

    const now = new Date('2026-06-01T00:00:00Z');
    const updated = processRecurringInvoice(invoice, now);

    expect(updated.totalGenerated).toBe(3); // unchanged
    expect(updated.isActive).toBe(false);
  });
});
