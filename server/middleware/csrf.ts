import { randomBytes, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config/env';
import { authCookieBaseOptions } from '../config/cookies';
import { createLogger } from '../config/logger';

const log = createLogger('csrf');

const CSRF_COOKIE_NAME = isProduction() ? '__Host-x-csrf' : 'x-csrf';
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_EXEMPT = [
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/register$/,
  /^\/api\/auth\/refresh-token$/,
  /^\/api\/auth\/refresh$/,
  /^\/api\/invitations\/accept\//,
  /^\/api\/webhooks\//,
];

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName || rawValue.length === 0) continue;
    result[rawName] = decodeURIComponent(rawValue.join('='));
  }
  return result;
}

function hasBearerAuth(req: Request): boolean {
  const auth = req.headers.authorization;
  return typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function csrfTokenHandler(_req: Request, res: Response): void {
  const token = randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, token, {
    ...authCookieBaseOptions(),
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ csrfToken: token });
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!STATE_CHANGING.has(req.method.toUpperCase())) return next();
  if (hasBearerAuth(req)) return next();
  if (CSRF_EXEMPT.some((rx) => rx.test(req.path))) return next();

  const headerToken =
    (req.headers['x-csrf-token'] as string | undefined) ||
    (req.headers['x-xsrf-token'] as string | undefined);
  const cookieToken = parseCookieHeader(req.headers.cookie)[CSRF_COOKIE_NAME];

  if (!headerToken || !cookieToken || !safeEqual(headerToken, cookieToken)) {
    log.warn({ path: req.path, method: req.method }, 'CSRF token validation failed');
    res.status(403).json({
      message: 'Invalid or missing CSRF token',
      code: 'CSRF_INVALID',
    });
    return;
  }

  next();
}
