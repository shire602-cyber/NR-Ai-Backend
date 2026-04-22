// ─── Load environment variables first ────────────────────────
import 'dotenv/config';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import session from 'express-session';
import MemoryStore from 'memorystore';
import passport from 'passport';

import { validateEnv, isProduction, isDevelopment } from './config/env';
import { createLogger } from './config/logger';
import { applySecurityMiddleware } from './middleware/security';
import { requestLogger } from './middleware/requestLogger';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler';
import { registerRoutes } from './routes';
import { setupVite, serveStatic } from './vite';
import { initScheduler } from './services/scheduler.service';
import { initWebPush } from './services/push-notification.service';

// ─── Validate environment on startup ─────────────────────────
const env = validateEnv();
const log = createLogger('server');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const app = express();

// ─── Trust proxy (required behind reverse proxy / Railway / Render) ──
app.set('trust proxy', 1);

// ─── Security middleware (helmet, CORS, rate limiting) ──────
applySecurityMiddleware(app);

// ─── Stripe webhook needs raw body (BEFORE json parsing) ─────
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// ─── Body parsing ────────────────────────────────────────────
app.use(
  express.json({
    limit: '50mb', // For base64-encoded receipt images
  })
);
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// ─── Session configuration ───────────────────────────────────
// Pick a session store based on REDIS_URL: when it is set we persist
// sessions to Redis so they survive restarts and can be shared across
// replicas; when it is not set we fall back to an in-process
// MemoryStore (fine for local dev; in production this means users are
// logged out on every deploy/restart, which is why REDIS_URL should be
// set on the Railway service).
let sessionStore: session.Store;
if (env.REDIS_URL) {
  const { createClient } = await import('redis');
  const { RedisStore } = await import('connect-redis');
  const redisClient = createClient({ url: env.REDIS_URL });
  redisClient.on('error', (err: unknown) => log.error({ err }, 'Redis client error'));
  await redisClient.connect();
  sessionStore = new RedisStore({ client: redisClient, prefix: 'muhasib:sess:' });
  log.info('Session store: Redis');
} else {
  const MemoryStoreSession = MemoryStore(session);
  sessionStore = new MemoryStoreSession({
    checkPeriod: 86400000, // Prune expired entries every 24h
  });
  if (isProduction()) {
    log.warn('REDIS_URL not set — using in-memory sessions. All users will be logged out on every restart.');
  } else {
    log.info('Session store: in-memory');
  }
}

app.use(
  session({
    store: sessionStore,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction(),
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax',
    },
  })
);

// ─── Passport initialization ─────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());
import './auth';

// ─── Request logging ─────────────────────────────────────────
app.use(requestLogger);

// ─── Health check (before auth, always accessible) ───────────
// Read /app/.build-info once at startup so /health and /api/version
// can return which git SHA is actually live. This is the source of
// truth when Fastly/CDN caching makes us doubt what's deployed.
let buildSha = process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown';
try {
  const info = fs.readFileSync('/app/.build-info', 'utf-8').trim();
  const m = info.match(/git-sha:\s*([0-9a-f]+)/i);
  if (m) buildSha = m[1];
} catch {
  // file only exists in the Docker image; ignore on local
}

app.get('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.NODE_ENV,
    version: '1.0.0',
    sha: buildSha.slice(0, 7),
  });
});

app.get('/api/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    sha: buildSha,
    short: buildSha.slice(0, 7),
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    uptime: process.uptime(),
  });
});

// ─── Ensure required directories exist ───────────────────────
const uploadsDir = path.resolve(projectRoot, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  log.info(`Created uploads directory: ${uploadsDir}`);
}

// ─── Bootstrap application ───────────────────────────────────
async function bootstrap() {
  log.info({ environment: env.NODE_ENV, port: env.PORT }, 'Starting server');

  // Register all API routes
  const server = await registerRoutes(app);

  // ─── Background scheduler (engagement automation) ─────
  initScheduler();

  // ─── Web push initialization ──────────────────────────
  initWebPush();

  // ─── API 404 handler (before static/SPA fallback) ───────
  app.use('/api/*', notFoundHandler);

  // ─── Error handling (MUST be after routes) ───────────────
  app.use(globalErrorHandler);

  // ─── Vite / Static serving ───────────────────────────────
  if (isDevelopment()) {
    await setupVite(app, server);
    log.info('Vite development server configured');
  } else {
    serveStatic(app);
    log.info('Serving static files');
  }

  // ─── Start listening ─────────────────────────────────────
  const port = env.PORT;
  server.listen(port, '0.0.0.0', () => {
    log.info(`✓ Server running at http://localhost:${port}`);
    log.info(`✓ Database: ${env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
    log.info(`✓ AI: ${env.OPENAI_API_KEY ? 'Configured' : 'Not configured'}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      log.fatal({ port }, 'Port already in use');
    } else {
      log.fatal({ error }, 'Server error');
    }
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  log.fatal({ error }, 'Failed to start server');
  process.exit(1);
});

// ─── Graceful shutdown ───────────────────────────────────────
process.on('SIGTERM', () => {
  log.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  log.info('SIGINT received. Shutting down...');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  log.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  log.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});
