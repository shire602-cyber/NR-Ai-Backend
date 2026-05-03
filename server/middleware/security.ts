import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { Express, Request, Response, NextFunction } from 'express';
import { getEnv, isProduction } from '../config/env';
import { createLogger } from '../config/logger';

const log = createLogger('security');

/**
 * Apply all security middleware to the Express app.
 * Must be called BEFORE route registration.
 */
export function applySecurityMiddleware(app: Express): void {
  const env = getEnv();

  // ─── Helmet: Security Headers ─────────────────────────────
  // Sets X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
  // Content-Security-Policy, Strict-Transport-Security, etc.
  app.use(
    helmet({
      contentSecurityPolicy: isProduction()
        ? {
            // Explicit CSP for production. Keeps HMR-only relaxations out
            // of the prod header while still permitting the styles/fonts
            // the Vite-built bundle needs.
            useDefaults: true,
            directives: {
              'default-src': ["'self'"],
              'script-src': ["'self'"],
              'style-src': ["'self'", "'unsafe-inline'"], // Tailwind inlines critical styles
              'font-src': ["'self'", 'data:'],
              'img-src': ["'self'", 'data:', 'blob:', 'https:'],
              'connect-src': ["'self'", 'https:', 'wss:'],
              'frame-ancestors': ["'none'"],
              'object-src': ["'none'"],
              'base-uri': ["'self'"],
              'form-action': ["'self'"],
              'upgrade-insecure-requests': [],
            },
          }
        : false, // Disable CSP in development (Vite HMR needs inline scripts)
      crossOriginEmbedderPolicy: false, // Allow embedding (PDF viewers, etc.)
      strictTransportSecurity: isProduction()
        ? { maxAge: 63072000, includeSubDomains: true, preload: true }
        : false,
    })
  );

  // ─── CORS: Cross-Origin Resource Sharing ──────────────────
  const allowedOrigins = new Set<string>();

  if (env.FRONTEND_URL) {
    allowedOrigins.add(env.FRONTEND_URL);
  }

  if (env.CORS_ORIGIN) {
    for (const origin of env.CORS_ORIGIN.split(',')) {
      const trimmed = origin.trim();
      if (trimmed) allowedOrigins.add(trimmed);
    }
  }

  // In development, allow localhost origins
  if (!isProduction()) {
    [
      'http://localhost:5173',
      'http://localhost:5000',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:3000'
    ].forEach((origin) => allowedOrigins.add(origin));
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin fetches (server-side rendering, same-origin SPA)
        // have no Origin header — allow. In production we reject any
        // *other* null-origin source (iframe srcdoc, file://, Electron)
        // because CSRF from those contexts is otherwise possible when
        // credentials: true is set.
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.has(origin)) {
          return callback(null, true);
        }

        log.warn({ origin }, 'Blocked CORS request from unauthorized origin');
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'X-XSRF-Token'],
      exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page', 'Retry-After', 'RateLimit-Reset'],
      maxAge: 86400, // Cache preflight for 24 hours
    })
  );

  // ─── Rate Limiting ────────────────────────────────────────

  // General API rate limit: 100 requests per minute per IP
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please try again later.' },
    skip: (req) => {
      // Don't rate limit health checks
      return req.path === '/health' || req.path === '/api/v1/health';
    },
  });

  // Auth session/general limit. Login has its own email-aware failed-attempt
  // limiter in auth.routes.ts after JSON body parsing, so this bucket should
  // not lock out legitimate users behind the same office/shared-network IP.
  const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication requests. Please wait before trying again.' },
  });

  // Registration is far stricter — creating accounts is the costliest
  // operation (chart of accounts seed, email delivery, default data) and
  // is the most abusable surface. Five accounts per IP per hour is
  // generous for legitimate users and painful for automated signup abuse.
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many accounts created from this IP. Please try again later.' },
  });

  // AI endpoints rate limit: 20 requests per minute per IP
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'AI rate limit exceeded. Please try again later.' },
  });

  // Apply rate limiters. Order matters: more specific limiters before the
  // generic ones so the stricter cap wins on overlapping paths.
  app.use('/api/auth/register', registerLimiter);
  app.use('/api/auth/', authLimiter);
  app.use('/api/ai/', aiLimiter);
  app.use('/api/', apiLimiter);

  // ─── Request Size Limits ──────────────────────────────────
  // Already handled in index.ts body parsers, but add a safety check
  app.use((req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > 52_428_800) {
      // 50MB
      return res.status(413).json({ message: 'Request too large' });
    }
    next();
  });

  // ─── HTTPS Enforcement (production only) ──────────────────
  if (isProduction()) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const proto = req.headers['x-forwarded-proto'];
      // Only redirect if header is present AND not https, skip health checks
      if (proto && proto !== 'https' && req.path !== '/health') {
        return res.redirect(301, `https://${req.hostname}${req.url}`);
      }
      next();
    });
  }

  // ─── Security Logging ─────────────────────────────────────
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // Log suspicious requests
    const suspiciousPatterns = [
      /\.\.\//,          // Path traversal
      /<script/i,        // XSS attempt
      /union\s+select/i, // SQL injection
      /javascript:/i,    // XSS in URLs
    ];

    const fullUrl = req.originalUrl || req.url;
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(fullUrl) || pattern.test(JSON.stringify(req.body || ''))) {
        log.warn(
          { ip: req.ip, method: req.method, url: fullUrl },
          'Suspicious request detected'
        );
        break;
      }
    }
    next();
  });

  log.info('Security middleware applied');
}
