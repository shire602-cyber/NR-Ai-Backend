import { pool } from '../db';

// ===========================
// AI Learning System
// Records user feedback on AI classifications,
// builds per-company rules, and provides
// few-shot examples for future predictions.
// ===========================

interface CompanyRule {
  id: string;
  companyId: string;
  pattern: string;
  patternType: 'merchant' | 'description';
  suggestedAccountId: string;
  confidence: number;
  sampleCount: number;
  isActive: boolean;
}

interface FewShotExample {
  description: string;
  merchant: string | null;
  amount: number | null;
  accountId: string;
  accountName: string;
  accountCode: string;
}

/**
 * Record user feedback on an AI classification.
 * Updates the classification record, then rebuilds company rules.
 */
export async function recordFeedback(
  companyId: string,
  classificationId: string,
  accepted: boolean,
  userSelectedAccountId?: string
): Promise<void> {
  // Update the transaction_classifications record
  if (userSelectedAccountId) {
    await pool.query(
      `UPDATE transaction_classifications
       SET was_accepted = $1, user_selected_account_id = $2
       WHERE id = $3 AND company_id = $4`,
      [accepted, userSelectedAccountId, classificationId, companyId]
    );
  } else {
    await pool.query(
      `UPDATE transaction_classifications
       SET was_accepted = $1
       WHERE id = $2 AND company_id = $3`,
      [accepted, classificationId, companyId]
    );
  }

  // Rebuild company rules based on all feedback
  await updateCompanyRules(companyId);
}

/**
 * Analyze all accepted classifications for a company.
 * Group by merchant / description patterns and create or update
 * ai_company_rules with acceptance rates as confidence scores.
 * Deactivates rules whose acceptance rate drops below 50%.
 */
export async function updateCompanyRules(companyId: string): Promise<void> {
  // ---- Merchant-based rules ----
  // Group accepted classifications by merchant and find the most-used account
  const merchantResult = await pool.query(
    `SELECT
       LOWER(TRIM(merchant)) AS pattern,
       COALESCE(user_selected_account_id, suggested_account_id) AS account_id,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE was_accepted = true) AS accepted,
       COUNT(*) FILTER (WHERE was_accepted = false) AS rejected
     FROM transaction_classifications
     WHERE company_id = $1
       AND merchant IS NOT NULL
       AND merchant != ''
       AND was_accepted IS NOT NULL
     GROUP BY LOWER(TRIM(merchant)), COALESCE(user_selected_account_id, suggested_account_id)
     HAVING COUNT(*) >= 2
     ORDER BY LOWER(TRIM(merchant)), COUNT(*) DESC`,
    [companyId]
  );

  // For each merchant pattern, pick the most popular account mapping
  const merchantRules = new Map<string, { accountId: string; total: number; accepted: number; rejected: number }>();
  for (const row of merchantResult.rows) {
    const existing = merchantRules.get(row.pattern);
    if (!existing || row.total > existing.total) {
      merchantRules.set(row.pattern, {
        accountId: row.account_id,
        total: parseInt(row.total),
        accepted: parseInt(row.accepted),
        rejected: parseInt(row.rejected),
      });
    }
  }

  // ---- Description-based rules ----
  // Extract 2+ word patterns from descriptions where the user accepted
  const descResult = await pool.query(
    `SELECT
       LOWER(TRIM(description)) AS pattern,
       COALESCE(user_selected_account_id, suggested_account_id) AS account_id,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE was_accepted = true) AS accepted,
       COUNT(*) FILTER (WHERE was_accepted = false) AS rejected
     FROM transaction_classifications
     WHERE company_id = $1
       AND was_accepted IS NOT NULL
       AND (merchant IS NULL OR merchant = '')
     GROUP BY LOWER(TRIM(description)), COALESCE(user_selected_account_id, suggested_account_id)
     HAVING COUNT(*) >= 2
     ORDER BY LOWER(TRIM(description)), COUNT(*) DESC`,
    [companyId]
  );

  const descriptionRules = new Map<string, { accountId: string; total: number; accepted: number; rejected: number }>();
  for (const row of descResult.rows) {
    const existing = descriptionRules.get(row.pattern);
    if (!existing || row.total > existing.total) {
      descriptionRules.set(row.pattern, {
        accountId: row.account_id,
        total: parseInt(row.total),
        accepted: parseInt(row.accepted),
        rejected: parseInt(row.rejected),
      });
    }
  }

  // ---- Upsert rules into ai_company_rules ----
  // Create the table if it doesn't exist yet (safe migration)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_company_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      pattern TEXT NOT NULL,
      pattern_type TEXT NOT NULL,
      suggested_account_id UUID NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      sample_count INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(company_id, pattern, pattern_type)
    )
  `);

  // Upsert merchant rules
  for (const [pattern, data] of merchantRules) {
    const confidence = data.total > 0 ? data.accepted / data.total : 0;
    const isActive = confidence >= 0.5;

    await pool.query(
      `INSERT INTO ai_company_rules (company_id, pattern, pattern_type, suggested_account_id, confidence, sample_count, is_active, updated_at)
       VALUES ($1, $2, 'merchant', $3, $4, $5, $6, now())
       ON CONFLICT (company_id, pattern, pattern_type)
       DO UPDATE SET
         suggested_account_id = EXCLUDED.suggested_account_id,
         confidence = EXCLUDED.confidence,
         sample_count = EXCLUDED.sample_count,
         is_active = EXCLUDED.is_active,
         updated_at = now()`,
      [companyId, pattern, data.accountId, confidence, data.total, isActive]
    );
  }

  // Upsert description rules
  for (const [pattern, data] of descriptionRules) {
    const confidence = data.total > 0 ? data.accepted / data.total : 0;
    const isActive = confidence >= 0.5;

    await pool.query(
      `INSERT INTO ai_company_rules (company_id, pattern, pattern_type, suggested_account_id, confidence, sample_count, is_active, updated_at)
       VALUES ($1, $2, 'description', $3, $4, $5, $6, now())
       ON CONFLICT (company_id, pattern, pattern_type)
       DO UPDATE SET
         suggested_account_id = EXCLUDED.suggested_account_id,
         confidence = EXCLUDED.confidence,
         sample_count = EXCLUDED.sample_count,
         is_active = EXCLUDED.is_active,
         updated_at = now()`,
      [companyId, pattern, data.accountId, confidence, data.total, isActive]
    );
  }
}

/**
 * Get relevant few-shot examples for an AI classification prompt.
 * Queries accepted classifications that are similar to the given description
 * using simple ILIKE keyword matching.
 */
export async function getRelevantExamples(
  companyId: string,
  description: string,
  limit: number = 10
): Promise<FewShotExample[]> {
  // Extract meaningful keywords (3+ chars, skip common words)
  const stopWords = new Set([
    'the', 'and', 'for', 'from', 'with', 'this', 'that', 'not', 'are', 'was',
    'has', 'had', 'have', 'been', 'will', 'but', 'all', 'can', 'her', 'his',
    'payment', 'paid', 'fee', 'charge', 'total', 'amount',
  ]);
  const keywords = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  if (keywords.length === 0) {
    // Fallback: return most recent accepted examples
    const result = await pool.query(
      `SELECT
         tc.description,
         tc.merchant,
         tc.amount,
         COALESCE(tc.user_selected_account_id, tc.suggested_account_id) AS account_id,
         a.name_en AS account_name,
         a.code AS account_code
       FROM transaction_classifications tc
       JOIN accounts a ON a.id = COALESCE(tc.user_selected_account_id, tc.suggested_account_id)
       WHERE tc.company_id = $1
         AND tc.was_accepted = true
       ORDER BY tc.created_at DESC
       LIMIT $2`,
      [companyId, limit]
    );
    return result.rows;
  }

  // Build ILIKE conditions — match any keyword in description or merchant
  const conditions = keywords.map(
    (_, i) => `(tc.description ILIKE $${i + 2} OR tc.merchant ILIKE $${i + 2})`
  );
  const params: any[] = [companyId, ...keywords.map((k) => `%${k}%`)];

  const result = await pool.query(
    `SELECT
       tc.description,
       tc.merchant,
       tc.amount,
       COALESCE(tc.user_selected_account_id, tc.suggested_account_id) AS account_id,
       a.name_en AS account_name,
       a.code AS account_code,
       (${keywords.map((_, i) => `(CASE WHEN tc.description ILIKE $${i + 2} THEN 1 ELSE 0 END) + (CASE WHEN tc.merchant ILIKE $${i + 2} THEN 1 ELSE 0 END)`).join(' + ')}) AS relevance
     FROM transaction_classifications tc
     JOIN accounts a ON a.id = COALESCE(tc.user_selected_account_id, tc.suggested_account_id)
     WHERE tc.company_id = $1
       AND tc.was_accepted = true
       AND (${conditions.join(' OR ')})
     ORDER BY relevance DESC, tc.created_at DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );

  return result.rows;
}

/**
 * Adjust the auto-post confidence threshold for a company.
 * Looks at the most recent 100 AI GL queue items to calculate accuracy.
 * - If accuracy > 95%, raise threshold (auto-post more)
 * - If accuracy < 80%, lower threshold (require more review)
 * Returns the new threshold value.
 */
export async function adjustConfidenceThreshold(companyId: string): Promise<{
  previousThreshold: number;
  newThreshold: number;
  accuracy: number;
  sampleSize: number;
}> {
  // Check if the ai_gl_queue table exists (it may not in all deployments)
  const tableCheck = await pool.query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_name = 'ai_gl_queue'
     ) AS exists`
  );

  let accuracy = 0.85; // Default assumption
  let sampleSize = 0;

  if (tableCheck.rows[0].exists) {
    // Get the most recent 100 items that have been reviewed
    const result = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE was_accepted = true) AS accepted
       FROM (
         SELECT was_accepted
         FROM ai_gl_queue
         WHERE company_id = $1
           AND was_accepted IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 100
       ) sub`,
      [companyId]
    );

    sampleSize = parseInt(result.rows[0]?.total || '0');
    if (sampleSize > 0) {
      accuracy = parseInt(result.rows[0].accepted) / sampleSize;
    }
  } else {
    // Fall back to transaction_classifications
    const result = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE was_accepted = true) AS accepted
       FROM (
         SELECT was_accepted
         FROM transaction_classifications
         WHERE company_id = $1
           AND was_accepted IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 100
       ) sub`,
      [companyId]
    );

    sampleSize = parseInt(result.rows[0]?.total || '0');
    if (sampleSize > 0) {
      accuracy = parseInt(result.rows[0].accepted) / sampleSize;
    }
  }

  // Read current threshold from company settings or default
  const settingsResult = await pool.query(
    `SELECT ai_confidence_threshold FROM companies WHERE id = $1`,
    [companyId]
  );

  // Default threshold is 0.85
  let previousThreshold = 0.85;
  if (settingsResult.rows[0]?.ai_confidence_threshold != null) {
    previousThreshold = parseFloat(settingsResult.rows[0].ai_confidence_threshold);
  }

  let newThreshold = previousThreshold;

  if (sampleSize >= 10) {
    if (accuracy > 0.95) {
      // High accuracy: lower threshold to auto-post more (more permissive)
      newThreshold = Math.max(0.60, previousThreshold - 0.05);
    } else if (accuracy < 0.80) {
      // Low accuracy: raise threshold to require more review (more strict)
      newThreshold = Math.min(0.95, previousThreshold + 0.05);
    }
    // Between 80-95%: keep current threshold
  }

  // Save new threshold (column may not exist — handle gracefully)
  try {
    await pool.query(
      `UPDATE companies SET ai_confidence_threshold = $1 WHERE id = $2`,
      [newThreshold, companyId]
    );
  } catch {
    // Column doesn't exist yet; skip saving
  }

  return {
    previousThreshold,
    newThreshold,
    accuracy: Math.round(accuracy * 1000) / 1000,
    sampleSize,
  };
}
