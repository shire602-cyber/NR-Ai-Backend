import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Express } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { storage } from '../storage';
import { getEnv } from '../config/env';
import {
  authMiddleware,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  decodeTokenUnsafe,
} from '../middleware/auth';
import {
  clearAuthCookies,
  getAccessTokenFromRequest,
  getRefreshTokenFromRequest,
  setAuthCookies,
} from '../services/auth-cookies.service';
import { asyncHandler } from '../middleware/errorHandler';
import { insertUserSchema } from '../../shared/schema';
import { createDefaultAccountsForCompany } from '../defaultChartOfAccounts';
import { createLogger } from '../config/logger';

const log = createLogger('auth');

function publicUser(user: any) {
  const { passwordHash: _passwordHash, password: _password, ...safeUser } = user;
  return safeUser;
}

function issueAuthTokens(res: Response, user: { id: string; email: string; isAdmin?: boolean; userType?: string }) {
  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user);
  setAuthCookies(res, token, refreshToken);
  return { token, refreshToken };
}

function loginRateLimitKey(req: Request): string {
  const rawEmail = (req.body as { email?: unknown } | undefined)?.email;
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : 'unknown';
  return `${req.ip || 'unknown'}:${email || 'unknown'}`;
}

function retryAfterSeconds(req: Request, fallbackSeconds: number): number {
  const resetTime = (req as any).rateLimit?.resetTime;
  if (resetTime instanceof Date) {
    return Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
  }
  return fallbackSeconds;
}

// =============================================
// Helpers (migrated from monolith routes.ts)
// =============================================

/**
 * Seed Chart of Accounts for a newly created company.
 */
async function seedChartOfAccounts(
  companyId: string
): Promise<{ created: number; alreadyExisted: boolean }> {
  const hasAccounts = await storage.companyHasAccounts(companyId);
  if (hasAccounts) {
    log.info({ companyId }, 'Company already has accounts, skipping seed');
    return { created: 0, alreadyExisted: true };
  }

  const defaultAccounts = createDefaultAccountsForCompany(companyId);

  try {
    const createdAccounts = await storage.createBulkAccounts(defaultAccounts as any);
    log.info({ companyId, count: createdAccounts.length }, 'Seeded chart of accounts');
    return { created: createdAccounts.length, alreadyExisted: false };
  } catch (error: any) {
    if (error.message?.includes('PARTIAL_INSERT')) {
      log.error({ companyId, message: error.message }, 'Partial COA insert detected');
      throw new Error(
        'PARTIAL_CHART: Chart of Accounts partially created due to race condition. Please contact support.'
      );
    }
    throw error;
  }
}

// Stronger password validation for a financial system:
// 8+ characters, at least one uppercase, one lowercase, one digit
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit');

// =============================================
// Route registration
// =============================================

export function registerAuthRoutes(app: Express): void {
  const router = Router();

  // =====================================
  // Auth Routes
  // =====================================

  // Customer self-signup (SaaS customers only - clients must use invitation)
  router.post(
    '/auth/register',
    asyncHandler(async (req: Request, res: Response) => {
      const validated = insertUserSchema.parse(req.body);

      // Strengthen password validation (8+ chars)
      passwordSchema.parse(validated.password);

      // Check if user exists
      const existingUser = await storage.getUserByEmail(validated.email);
      if (existingUser) {
        return res.status(400).json({ message: 'Email already registered' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(validated.password, 10);

      // SECURITY: Force userType to 'customer' - never trust client-supplied userType
      // Self-signup users can only be customers. Clients/admins must use invitation flow.
      // NOTE: Do NOT pass raw password to storage - only pass the hash
      const user = await storage.createUser({
        name: validated.name,
        email: validated.email,
        userType: 'customer', // FORCED: Self-signup users are always customers
        isAdmin: false, // FORCED: Self-signup users cannot be admins
        passwordHash,
      } as any);

      // Auto-create a default company for this user (marked as 'customer' type)
      // Add timestamp to ensure uniqueness if user re-registers
      const timestamp = Date.now().toString(36);
      const companyName = `${validated.name}'s Company`;
      const uniqueCompanyName = `${companyName} (${timestamp})`;
      const company = await storage.createCompany({
        name: uniqueCompanyName,
        baseCurrency: 'AED',
        locale: 'en',
        companyType: 'customer', // Self-signup companies are customer type (not managed by NR)
      });

      // Associate user with company as owner
      await storage.createCompanyUser({
        companyId: company.id,
        userId: user.id,
        role: 'owner',
      });

      // Seed Chart of Accounts for new company
      await seedChartOfAccounts(company.id);

      // Create free tier subscription for new customer
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setFullYear(periodEnd.getFullYear() + 100); // Free tier never expires

      await storage.createSubscription({
        companyId: company.id,
        planId: 'free',
        planName: 'Free',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        maxUsers: 1,
        maxInvoices: 20,
        maxReceipts: 20,
        aiCreditsRemaining: 10,
        billingCycle: 'monthly',
        maxCompanies: 1,
        maxStorageMb: 500,
        aiCreditsPerMonth: 10,
        aiCreditsUsedThisMonth: 0,
        invoicesCreatedThisMonth: 0,
        receiptsCreatedThisMonth: 0,
        usagePeriodStart: now,
      });

      const { token, refreshToken } = issueAuthTokens(res, user);

      res.json({
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: false,
          userType: 'customer',
        },
        company: {
          id: company.id,
          name: company.name,
        },
      });
    })
  );

  // Login
  // Dummy bcrypt hash generated once at startup. Used when the email is
  // unknown so we still spend CPU on a comparison — this removes the
  // timing signal that distinguishes "no such user" from "wrong password"
  // and prevents email enumeration via response-time measurement.
  const DUMMY_HASH = bcrypt.hashSync('account_enumeration_placeholder', 10);
  const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: loginRateLimitKey,
    handler: (req, res) => {
      const retryAfter = retryAfterSeconds(req, 60);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        message: 'Too many login attempts for this email. Please wait before trying again.',
        details: { retryAfterSeconds: retryAfter },
      });
    },
  });

  router.post(
    '/auth/login',
    loginLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const { email, password } = req.body;

      const user = await storage.getUserByEmail(email);

      // Always compare against *some* hash so the timing is constant.
      const passwordToCheck = typeof password === 'string' ? password : '';
      const isValid = user
        ? await bcrypt.compare(passwordToCheck, user.passwordHash)
        : (await bcrypt.compare(passwordToCheck, DUMMY_HASH), false);

      if (!user || !isValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Ensure isAdmin is a proper boolean
      const isAdminBoolean =
        user.isAdmin === true ||
        (user.isAdmin as any) === 'true' ||
        (user.isAdmin as any) === 1;

      const { token, refreshToken } = issueAuthTokens(res, user);

      res.json({
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: isAdminBoolean,
          userType: user.userType || 'customer', // Include userType in response
        },
      });
    })
  );

  // Refresh token endpoint
  const handleRefreshToken = asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.body?.refreshToken || getRefreshTokenFromRequest(req);

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    // Revocation check — refresh tokens are long-lived (7d), so a
    // denylist hit here is the main defence against a stolen refresh
    // token being replayed after logout.
    if (payload.jti && (await storage.isJwtRevoked(payload.jti))) {
      return res.status(401).json({ message: 'Refresh token has been revoked' });
    }

    // Verify user still exists in DB
    const user = await storage.getUser(payload.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Refresh-token rotation: revoke the one we just consumed so it
    // cannot be replayed, and issue a fresh pair.
    if (payload.jti && payload.exp) {
      await storage.revokeJwt(
        payload.jti,
        new Date(payload.exp * 1000),
        user.id,
        'refresh_rotation',
      );
    }
    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);
    setAuthCookies(res, newToken, newRefreshToken);

    res.json({
      token: newToken,
      refreshToken: newRefreshToken,
    });
  });

  router.post('/auth/refresh-token', handleRefreshToken);
  router.post('/auth/refresh', handleRefreshToken);

  router.get(
    '/auth/me',
    authMiddleware as any,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(publicUser(user));
    }),
  );

  // Logout endpoint — revokes both the access token (from Authorization
  // header) and the refresh token (from body) by adding their jti to the
  // denylist table. Expired tokens are skipped; malformed tokens are a
  // no-op (we still return 200 so the client proceeds with its local
  // cleanup). Subsequent requests using either revoked token are
  // rejected in authMiddleware.
  router.post(
    '/auth/logout',
    asyncHandler(async (req: Request, res: Response) => {
      const revokeIfValid = async (raw: string | undefined, reason: string) => {
        if (!raw) return;
        const decoded = decodeTokenUnsafe(raw);
        if (!decoded?.jti || !decoded.exp) return;
        const expiresAt = new Date(decoded.exp * 1000);
        if (expiresAt.getTime() < Date.now()) return; // already expired
        await storage.revokeJwt(decoded.jti, expiresAt, decoded.userId, reason);
      };

      const authHeader = req.headers.authorization;
      const accessToken =
        getAccessTokenFromRequest(req) ||
        (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined);
      const refreshToken: string | undefined = req.body?.refreshToken || getRefreshTokenFromRequest(req) || undefined;

      await revokeIfValid(accessToken, 'logout');
      await revokeIfValid(refreshToken, 'logout');
      clearAuthCookies(res);

      res.json({ ok: true });
    }),
  );

  // =====================================
  // PUBLIC - INVITATION ACCEPTANCE
  // =====================================

  // Verify invitation token (public endpoint)
  router.get(
    '/invitations/verify/:token',
    asyncHandler(async (req: Request, res: Response) => {
      const { token } = req.params;
      const invitation = await storage.getInvitationByToken(token);

      if (!invitation) {
        return res.status(404).json({ message: 'Invitation not found' });
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({ message: `Invitation has been ${invitation.status}` });
      }

      if (new Date() > invitation.expiresAt) {
        return res.status(400).json({ message: 'Invitation has expired' });
      }

      // Get company details if associated
      let company = null;
      if (invitation.companyId) {
        company = await storage.getCompany(invitation.companyId);
      }

      res.json({
        email: invitation.email,
        role: invitation.role,
        userType: invitation.userType,
        company: company ? { id: company.id, name: company.name } : null,
      });
    })
  );

  // Accept invitation and create account (public endpoint)
  router.post(
    '/invitations/accept/:token',
    asyncHandler(async (req: Request, res: Response) => {
      const { token } = req.params;
      const { name, password } = req.body;

      const nameSchema = z.string().min(1, 'Name is required').max(100, 'Name too long');
      nameSchema.parse(name);

      // Strengthen password validation (8+ chars)
      passwordSchema.parse(password);

      const invitation = await storage.getInvitationByToken(token);

      if (!invitation) {
        return res.status(404).json({ message: 'Invitation not found' });
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({ message: `Invitation has been ${invitation.status}` });
      }

      if (new Date() > invitation.expiresAt) {
        return res.status(400).json({ message: 'Invitation has expired' });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(invitation.email);
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists with this email' });
      }

      // Create user with appropriate userType from invitation.
      // Only pass passwordHash — never the raw password.
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        email: invitation.email,
        name,
        isAdmin: invitation.role === 'staff' || invitation.userType === 'admin',
        userType: invitation.userType || 'client',
        passwordHash,
      } as any);

      // If company associated, add user to company and set company type
      if (invitation.companyId) {
        await storage.createCompanyUser({
          companyId: invitation.companyId,
          userId: user.id,
          role: 'owner', // Client users are owners of their company view
        });

        // Set company type based on user type (client companies are managed by NR)
        if (invitation.userType === 'client') {
          await storage.updateCompany(invitation.companyId, {
            companyType: 'client',
          });
        }
      }

      // Mark invitation as accepted
      await storage.updateInvitation(invitation.id, {
        status: 'accepted',
        acceptedAt: new Date(),
      });

      // Log activity
      await storage.createActivityLog({
        userId: user.id,
        companyId: invitation.companyId || null,
        action: 'create',
        entityType: 'user',
        entityId: user.id,
        description: `User registered via invitation: ${user.email}`,
      });

      const { token: jwtToken, refreshToken } = issueAuthTokens(res, user);

      res.json({ user: publicUser(user), token: jwtToken, refreshToken });
    })
  );

  // Mount all auth routes under /api
  app.use('/api', router);
}
