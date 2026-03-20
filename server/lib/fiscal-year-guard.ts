import { pool } from '../db';

/**
 * Checks if a date falls within a closed fiscal year for the given company.
 * If it does, throws an error preventing journal entry creation.
 * If no fiscal years exist, the operation is allowed (backward compatibility).
 *
 * @param companyId - The company UUID
 * @param date - The journal entry date to check
 */
export async function assertFiscalYearOpen(companyId: string, date: Date | string): Promise<void> {
  const dateStr = typeof date === 'string' ? date : date.toISOString().slice(0, 10);

  const result = await pool.query(
    `SELECT name, start_date, end_date FROM fiscal_years
     WHERE company_id = $1
       AND status = 'closed'
       AND start_date <= $2::date
       AND end_date >= $2::date
     LIMIT 1`,
    [companyId, dateStr]
  );

  if (result.rows.length > 0) {
    const fy = result.rows[0];
    throw Object.assign(
      new Error(`Cannot create entries in closed fiscal year: ${fy.name}`),
      { statusCode: 400 }
    );
  }
}

/**
 * Pool-client variant of the fiscal year guard.
 * Use this inside pool-based transactions (bill-pay, fixed-assets) where you
 * already hold a dedicated client from pool.connect().
 *
 * @param client - A pg PoolClient (from pool.connect())
 * @param companyId - The company UUID
 * @param date - The journal entry date to check
 */
export async function assertFiscalYearOpenPool(
  client: any,
  companyId: string,
  date: Date | string
): Promise<void> {
  const dateStr = typeof date === 'string' ? date : date.toISOString().slice(0, 10);

  const result = await client.query(
    `SELECT name, start_date, end_date FROM fiscal_years
     WHERE company_id = $1
       AND status = 'closed'
       AND start_date <= $2::date
       AND end_date >= $2::date
     LIMIT 1`,
    [companyId, dateStr]
  );

  if (result.rows.length > 0) {
    const fy = result.rows[0];
    throw Object.assign(
      new Error(`Cannot create entries in closed fiscal year: ${fy.name}`),
      { statusCode: 400 }
    );
  }
}
