import type { Express, Request, Response } from 'express';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { storage } from '../storage';

export function registerExchangeRateRoutes(app: Express) {
  // =====================================
  // Exchange Rate Routes (Multi-Currency)
  // =====================================

  // List all exchange rates for a company
  app.get('/api/companies/:companyId/exchange-rates', authMiddleware, requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const rates = await storage.getExchangeRatesByCompanyId(companyId);
      res.json(rates);
    }));

  // Create a new exchange rate
  app.post('/api/companies/:companyId/exchange-rates', authMiddleware, requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const { fromCurrency, toCurrency, rate, effectiveDate, source } = req.body;

      if (!fromCurrency || !toCurrency || rate == null || !effectiveDate) {
        return res.status(400).json({ message: 'fromCurrency, toCurrency, rate, and effectiveDate are required' });
      }

      if (typeof rate !== 'number' || rate <= 0) {
        return res.status(400).json({ message: 'rate must be a positive number' });
      }

      const created = await storage.createExchangeRate({
        companyId,
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        rate,
        effectiveDate: new Date(effectiveDate),
        source: source || 'manual',
      });

      console.log('[ExchangeRate] Rate created:', created.id, `${fromCurrency}->${toCurrency} @${rate}`);
      res.status(201).json(created);
    }));

  // Delete an exchange rate
  app.delete('/api/exchange-rates/:id', authMiddleware, requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const userId = (req as any).user.id;

      const rate = await storage.getExchangeRate(id);
      if (!rate) {
        return res.status(404).json({ message: 'Exchange rate not found' });
      }

      const hasAccess = await storage.hasCompanyAccess(userId, rate.companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      await storage.deleteExchangeRate(id);
      res.json({ message: 'Exchange rate deleted' });
    }));

  // Convert currency using latest rate
  app.get('/api/companies/:companyId/exchange-rates/convert', authMiddleware, requireCustomer,
    asyncHandler(async (req: Request, res: Response) => {
      const { companyId } = req.params;
      const userId = (req as any).user.id;

      const hasAccess = await storage.hasCompanyAccess(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const from = (req.query.from as string)?.toUpperCase();
      const to = (req.query.to as string)?.toUpperCase();
      const amountStr = req.query.amount as string;

      if (!from || !to || !amountStr) {
        return res.status(400).json({ message: 'from, to, and amount query params are required' });
      }

      const amount = parseFloat(amountStr);
      if (isNaN(amount)) {
        return res.status(400).json({ message: 'amount must be a valid number' });
      }

      // Same currency — no conversion needed
      if (from === to) {
        return res.json({ from, to, amount, convertedAmount: amount, rate: 1 });
      }

      // Try direct rate first
      let rate = await storage.getLatestExchangeRate(companyId, from, to);
      if (rate) {
        const convertedAmount = Math.round(amount * rate.rate * 100) / 100;
        return res.json({ from, to, amount, convertedAmount, rate: rate.rate, effectiveDate: rate.effectiveDate });
      }

      // Try inverse rate
      const inverseRate = await storage.getLatestExchangeRate(companyId, to, from);
      if (inverseRate) {
        const inverted = 1 / inverseRate.rate;
        const convertedAmount = Math.round(amount * inverted * 100) / 100;
        return res.json({ from, to, amount, convertedAmount, rate: inverted, effectiveDate: inverseRate.effectiveDate });
      }

      return res.status(404).json({ message: `No exchange rate found for ${from} -> ${to}` });
    }));
}
