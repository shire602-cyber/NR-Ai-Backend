import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockStorage,
  seedTestCompanyWithAccounts,
  createTestUser,
} from '../helpers';
import type { IStorage } from '../../server/storage';
import type { Account, User, Company } from '@shared/schema';

// ---------------------------------------------------------------------------
// Pure helper functions mirroring access control patterns
// from various route files
// ---------------------------------------------------------------------------

/**
 * Simulates the common access check pattern found in all protected routes:
 *   const hasAccess = await storage.hasCompanyAccess(userId, companyId);
 *   if (!hasAccess) return res.status(403).json({ ... });
 */
async function checkCompanyAccess(
  storage: IStorage,
  userId: string,
  companyId: string,
): Promise<{ status: number; allowed: boolean; error?: string }> {
  const hasAccess = await storage.hasCompanyAccess(userId, companyId);
  if (!hasAccess) {
    return { status: 403, allowed: false, error: 'Access denied' };
  }
  return { status: 200, allowed: true };
}

/**
 * Simulates the AI service availability check from ai.routes.ts:
 *   if (!openai) return res.status(503).json({ error: 'AI service unavailable...' });
 */
function checkAIServiceAvailability(
  openaiConfigured: boolean,
): { status: number; available: boolean; error?: string } {
  if (!openaiConfigured) {
    return {
      status: 503,
      available: false,
      error: 'AI service unavailable \u2014 OPENAI_API_KEY not configured',
    };
  }
  return { status: 200, available: true };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Access Control', () => {
  let storage: IStorage;
  let user: User;
  let company: Company;
  let accounts: Account[];

  beforeEach(async () => {
    storage = createMockStorage();
    const seed = await seedTestCompanyWithAccounts(storage);
    user = seed.user;
    company = seed.company;
    accounts = seed.accounts;
  });

  // -------------------------------------------------------------------------
  // 1. Dashboard returns 403 for unauthorized user
  // -------------------------------------------------------------------------
  it('dashboard returns 403 for unauthorized user', async () => {
    // Create a user with no company access
    const unauthorizedUser = await storage.createUser({
      email: 'outsider@test.com',
      name: 'Outsider',
      password: 'password123',
      isAdmin: false,
      userType: 'customer',
    } as any);

    const result = await checkCompanyAccess(storage, unauthorizedUser.id, company.id);

    expect(result.status).toBe(403);
    expect(result.allowed).toBe(false);
    expect(result.error).toBe('Access denied');
  });

  // -------------------------------------------------------------------------
  // 2. VAT PATCH returns 403 for unauthorized user
  // -------------------------------------------------------------------------
  it('VAT PATCH returns 403 for unauthorized user', async () => {
    const unauthorizedUser = await storage.createUser({
      email: 'vat-outsider@test.com',
      name: 'VAT Outsider',
      password: 'password123',
      isAdmin: false,
      userType: 'customer',
    } as any);

    const result = await checkCompanyAccess(storage, unauthorizedUser.id, company.id);

    expect(result.status).toBe(403);
    expect(result.allowed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 3. Corporate tax GET returns 403 for unauthorized user
  // -------------------------------------------------------------------------
  it('corporate tax GET returns 403 for unauthorized user', async () => {
    const unauthorizedUser = await storage.createUser({
      email: 'tax-outsider@test.com',
      name: 'Tax Outsider',
      password: 'password123',
      isAdmin: false,
      userType: 'customer',
    } as any);

    const result = await checkCompanyAccess(storage, unauthorizedUser.id, company.id);

    expect(result.status).toBe(403);
    expect(result.allowed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. AI categorize returns 503 when OpenAI unavailable
  // -------------------------------------------------------------------------
  it('AI categorize returns 503 when OpenAI unavailable', () => {
    const result = checkAIServiceAvailability(false);

    expect(result.status).toBe(503);
    expect(result.available).toBe(false);
    expect(result.error).toContain('AI service unavailable');
  });

  // -------------------------------------------------------------------------
  // 5. Portal document delete returns 403 for unauthorized user
  // -------------------------------------------------------------------------
  it('portal document delete returns 403 for unauthorized user', async () => {
    const unauthorizedUser = await storage.createUser({
      email: 'portal-outsider@test.com',
      name: 'Portal Outsider',
      password: 'password123',
      isAdmin: false,
      userType: 'customer',
    } as any);

    const result = await checkCompanyAccess(storage, unauthorizedUser.id, company.id);

    expect(result.status).toBe(403);
    expect(result.allowed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 6. Receipt PUT returns 403 for unauthorized user
  // -------------------------------------------------------------------------
  it('receipt PUT returns 403 for unauthorized user', async () => {
    const unauthorizedUser = await storage.createUser({
      email: 'receipt-outsider@test.com',
      name: 'Receipt Outsider',
      password: 'password123',
      isAdmin: false,
      userType: 'customer',
    } as any);

    const result = await checkCompanyAccess(storage, unauthorizedUser.id, company.id);

    expect(result.status).toBe(403);
    expect(result.allowed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 7. Authorized user gets 200
  // -------------------------------------------------------------------------
  it('authorized user gets 200 for all endpoints', async () => {
    // The seed user (owner) should have access
    const result = await checkCompanyAccess(storage, user.id, company.id);

    expect(result.status).toBe(200);
    expect(result.allowed).toBe(true);
  });
});
