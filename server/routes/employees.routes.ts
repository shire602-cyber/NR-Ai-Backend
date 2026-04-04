import type { Express, Request, Response } from 'express';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { storage } from '../storage';

export function registerEmployeeRoutes(app: Express) {
  // =====================================
  // Employee Routes
  // =====================================

  // List all employees for a company
  app.get("/api/companies/:companyId/employees", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const employees = await storage.getEmployeesByCompanyId(companyId);
    res.json(employees);
  }));

  // Get a single employee
  app.get("/api/employees/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const employee = await storage.getEmployee(id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, employee.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(employee);
  }));

  // Create a new employee
  app.post("/api/companies/:companyId/employees", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const employee = await storage.createEmployee({
      ...req.body,
      companyId,
    });

    console.log('[Employees] Employee created:', employee.id, employee.name);
    res.json(employee);
  }));

  // Update an employee
  app.put("/api/employees/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const existing = await storage.getEmployee(id);
    if (!existing) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, existing.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const updated = await storage.updateEmployee(id, req.body);
    console.log('[Employees] Employee updated:', id);
    res.json(updated);
  }));

  // Delete an employee
  app.delete("/api/employees/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const existing = await storage.getEmployee(id);
    if (!existing) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, existing.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await storage.deleteEmployee(id);
    res.json({ message: 'Employee deleted successfully' });
  }));
}
