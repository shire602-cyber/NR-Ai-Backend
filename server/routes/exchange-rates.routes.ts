import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { authMiddleware, requireCustomer } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

export function registerExchangeRateRoutes(app: Express) {
  // List exchange rates for a company
  app.get("/api/companies/:companyId/exchange-rates", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { companyId } = req.params;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const rates = await storage.getExchangeRatesByCompanyId(companyId);
    res.json(rates);
  }));

  // Create exchange rate
  app.post("/api/companies/:companyId/exchange-rates", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { companyId } = req.params;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const rate = await storage.createExchangeRate({
      ...req.body,
      companyId,
    });
    res.json(rate);
  }));

  // Update exchange rate
  app.put("/api/companies/:companyId/exchange-rates/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { companyId, id } = req.params;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Verify the exchange rate exists and belongs to this company
    const existingRate = await storage.getExchangeRate(id);
    if (!existingRate) {
      return res.status(404).json({ error: "Exchange rate not found" });
    }
    if (existingRate.companyId !== companyId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const rate = await storage.updateExchangeRate(id, req.body);
    res.json(rate);
  }));

  // Delete exchange rate
  app.delete("/api/companies/:companyId/exchange-rates/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { companyId, id } = req.params;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Verify the exchange rate exists and belongs to this company
    const existingRate = await storage.getExchangeRate(id);
    if (!existingRate) {
      return res.status(404).json({ error: "Exchange rate not found" });
    }
    if (existingRate.companyId !== companyId) {
      return res.status(403).json({ error: "Access denied" });
    }

    await storage.deleteExchangeRate(id);
    res.json({ message: "Exchange rate deleted" });
  }));
}
