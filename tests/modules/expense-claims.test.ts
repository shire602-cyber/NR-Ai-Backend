import { describe, it, expect } from 'vitest';

/**
 * Expense Claims — pure unit tests.
 *
 * Schema tables: expenseClaims, expenseClaimItems
 * Status workflow: draft -> submitted -> approved -> paid
 *                                    -> rejected -> (resubmitted) submitted
 */

// ---------------------------------------------------------------------------
// Types matching schema shape
// ---------------------------------------------------------------------------
interface ClaimItem {
  amount: string;      // Drizzle numeric → string
  vatAmount: string;   // Drizzle numeric → string
}

type ClaimStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';

interface ExpenseClaim {
  status: ClaimStatus;
  totalAmount: string;
}

// ---------------------------------------------------------------------------
// Business logic helpers
// ---------------------------------------------------------------------------

/** Claim total = sum of all item amounts (VAT-inclusive line totals) */
function claimTotal(items: ClaimItem[]): number {
  return items.reduce((sum, item) => sum + Number(item.amount) + Number(item.vatAmount), 0);
}

/** Valid status transitions */
const validTransitions: Record<ClaimStatus, ClaimStatus[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: ['paid'],
  rejected: ['submitted'], // resubmission
  paid: [],               // terminal state
};

function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return validTransitions[from].includes(to);
}

function transitionClaim(claim: ExpenseClaim, newStatus: ClaimStatus): ExpenseClaim {
  if (!canTransition(claim.status, newStatus)) {
    throw new Error(`Invalid transition from '${claim.status}' to '${newStatus}'`);
  }
  return { ...claim, status: newStatus };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Expense Claims Module', () => {
  const sampleItems: ClaimItem[] = [
    { amount: '250.00', vatAmount: '12.50' },
    { amount: '1500.00', vatAmount: '75.00' },
    { amount: '320.00', vatAmount: '16.00' },
  ];

  // -----------------------------------------------------------------------
  // Claim total = sum of claim items
  // -----------------------------------------------------------------------
  it('should calculate claim total as sum of all item amounts and VAT', () => {
    const total = claimTotal(sampleItems);
    // (250 + 12.50) + (1500 + 75) + (320 + 16) = 262.50 + 1575 + 336 = 2173.50
    expect(total).toBe(2173.5);
  });

  // -----------------------------------------------------------------------
  // Approval workflow: draft -> submitted -> approved -> paid
  // -----------------------------------------------------------------------
  it('should allow the full approval workflow: draft -> submitted -> approved -> paid', () => {
    let claim: ExpenseClaim = { status: 'draft', totalAmount: '2173.50' };

    claim = transitionClaim(claim, 'submitted');
    expect(claim.status).toBe('submitted');

    claim = transitionClaim(claim, 'approved');
    expect(claim.status).toBe('approved');

    claim = transitionClaim(claim, 'paid');
    expect(claim.status).toBe('paid');
  });

  // -----------------------------------------------------------------------
  // Invalid transitions are rejected
  // -----------------------------------------------------------------------
  it('should reject invalid status transitions', () => {
    const draft: ExpenseClaim = { status: 'draft', totalAmount: '100.00' };

    // Cannot go directly from draft to approved
    expect(() => transitionClaim(draft, 'approved')).toThrow(
      "Invalid transition from 'draft' to 'approved'"
    );

    // Cannot go from draft to paid
    expect(() => transitionClaim(draft, 'paid')).toThrow(
      "Invalid transition from 'draft' to 'paid'"
    );

    // Cannot go from paid to anything
    const paid: ExpenseClaim = { status: 'paid', totalAmount: '100.00' };
    expect(() => transitionClaim(paid, 'draft')).toThrow();
  });

  // -----------------------------------------------------------------------
  // Rejected claims can be resubmitted
  // -----------------------------------------------------------------------
  it('should allow rejected claims to be resubmitted', () => {
    let claim: ExpenseClaim = { status: 'draft', totalAmount: '500.00' };

    claim = transitionClaim(claim, 'submitted');
    claim = transitionClaim(claim, 'rejected');
    expect(claim.status).toBe('rejected');

    // Resubmit
    claim = transitionClaim(claim, 'submitted');
    expect(claim.status).toBe('submitted');

    // Now it can be approved
    claim = transitionClaim(claim, 'approved');
    expect(claim.status).toBe('approved');
  });

  // -----------------------------------------------------------------------
  // Empty items list yields zero total
  // -----------------------------------------------------------------------
  it('should return zero total for an empty items list', () => {
    expect(claimTotal([])).toBe(0);
  });
});
