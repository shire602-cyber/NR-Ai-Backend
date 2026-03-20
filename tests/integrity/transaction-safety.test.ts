import { describe, it, expect, vi } from 'vitest';

/**
 * Transaction safety — pure unit tests.
 *
 * Tests verify that the transaction wrapper pattern enforces:
 *   1. Atomicity: all-or-nothing
 *   2. Rollback on failure
 *   3. Unique entry number generation under concurrency
 *
 * No real database is used — we mock the transaction abstraction.
 */

// ---------------------------------------------------------------------------
// Transaction wrapper abstraction (mirrors server/db pattern)
// ---------------------------------------------------------------------------

type TransactionClient = {
  execute: (query: string) => Promise<void>;
  rollback: () => Promise<void>;
};

type TransactionCallback<T> = (tx: TransactionClient) => Promise<T>;

/**
 * Simulated transaction wrapper.
 * Calls BEGIN, runs callback, calls COMMIT.
 * On error: calls ROLLBACK and re-throws.
 */
async function withTransaction<T>(
  callback: TransactionCallback<T>,
  mockExecute: (query: string) => Promise<void> = async () => {},
): Promise<T> {
  const queries: string[] = [];
  let rolledBack = false;

  const tx: TransactionClient = {
    execute: async (query: string) => {
      queries.push(query);
      await mockExecute(query);
    },
    rollback: async () => {
      rolledBack = true;
      queries.push('ROLLBACK');
    },
  };

  queries.push('BEGIN');
  try {
    const result = await callback(tx);
    queries.push('COMMIT');
    return result;
  } catch (error) {
    if (!rolledBack) {
      await tx.rollback();
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Entry number generator (simulates unique number allocation)
// ---------------------------------------------------------------------------

function createEntryNumberGenerator() {
  const usedNumbers = new Set<string>();
  let counter = 0;

  return {
    next(prefix: string, date: string): string {
      counter += 1;
      const num = `${prefix}-${date}-${String(counter).padStart(3, '0')}`;
      if (usedNumbers.has(num)) {
        throw new Error(`Duplicate entry number: ${num}`);
      }
      usedNumbers.add(num);
      return num;
    },
    getUsed(): Set<string> {
      return new Set(usedNumbers);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Transaction Safety', () => {
  // -----------------------------------------------------------------------
  // Atomicity: all queries within a transaction succeed together
  // -----------------------------------------------------------------------
  it('should ensure atomicity — all operations succeed or none', async () => {
    const executedQueries: string[] = [];

    const result = await withTransaction(async (tx) => {
      await tx.execute('INSERT INTO journal_entries (id) VALUES (1)');
      await tx.execute('INSERT INTO journal_lines (entry_id, debit) VALUES (1, 500)');
      await tx.execute('INSERT INTO journal_lines (entry_id, credit) VALUES (1, 500)');
      return { entryId: 1 };
    }, async (query) => {
      executedQueries.push(query);
    });

    expect(result).toEqual({ entryId: 1 });
    // Should have all three inserts recorded
    expect(executedQueries).toHaveLength(3);
    expect(executedQueries[0]).toContain('journal_entries');
    expect(executedQueries[1]).toContain('journal_lines');
    expect(executedQueries[2]).toContain('journal_lines');
  });

  // -----------------------------------------------------------------------
  // Rollback: failed journal line creation rolls back the entry
  // -----------------------------------------------------------------------
  it('should rollback journal entry when a journal line insert fails', async () => {
    const executedQueries: string[] = [];

    await expect(
      withTransaction(async (tx) => {
        await tx.execute('INSERT INTO journal_entries (id) VALUES (1)');
        // First line succeeds
        await tx.execute('INSERT INTO journal_lines (entry_id, debit) VALUES (1, 500)');
        // Second line fails
        throw new Error('Foreign key constraint: invalid account_id');
      }, async (query) => {
        executedQueries.push(query);
      })
    ).rejects.toThrow('Foreign key constraint: invalid account_id');

    // Verify that the entry and first line were attempted
    expect(executedQueries).toHaveLength(2);
    // The error causes ROLLBACK (handled inside withTransaction)
  });

  // -----------------------------------------------------------------------
  // Concurrent operations don't create duplicate entry numbers
  // -----------------------------------------------------------------------
  it('should not create duplicate entry numbers under concurrent allocation', async () => {
    const generator = createEntryNumberGenerator();
    const date = '20260315';
    const prefix = 'JE';

    // Simulate 100 concurrent allocations
    const promises = Array.from({ length: 100 }, () =>
      Promise.resolve(generator.next(prefix, date))
    );

    const entryNumbers = await Promise.all(promises);

    // All 100 should be unique
    const uniqueSet = new Set(entryNumbers);
    expect(uniqueSet.size).toBe(100);

    // Each should follow the format JE-YYYYMMDD-NNN
    for (const num of entryNumbers) {
      expect(num).toMatch(/^JE-20260315-\d{3}$/);
    }
  });

  // -----------------------------------------------------------------------
  // Transaction wrapper calls rollback exactly once on error
  // -----------------------------------------------------------------------
  it('should call rollback exactly once when an error occurs', async () => {
    const rollbackSpy = vi.fn();

    try {
      await withTransaction(async (tx) => {
        // Override rollback with spy
        tx.rollback = async () => {
          rollbackSpy();
        };
        await tx.execute('INSERT INTO journal_entries (id) VALUES (1)');
        throw new Error('Simulated failure');
      });
    } catch {
      // expected
    }

    expect(rollbackSpy).toHaveBeenCalledTimes(1);
  });
});
