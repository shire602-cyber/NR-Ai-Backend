import type { Express, Request, Response } from 'express';
import { authMiddleware, requireCustomer } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { storage } from '../storage';

export function registerPayrollRoutes(app: Express) {
  // =====================================
  // Payroll Routes
  // =====================================

  // List payroll runs for a company
  app.get("/api/companies/:companyId/payroll", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const runs = await storage.getPayrollRunsByCompanyId(companyId);
    res.json(runs);
  }));

  // Get a single payroll run with its lines
  app.get("/api/payroll/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const run = await storage.getPayrollRun(id);
    if (!run) {
      return res.status(404).json({ message: 'Payroll run not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, run.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const lines = await storage.getPayrollLinesByRunId(id);

    // Enrich lines with employee details
    const enrichedLines = await Promise.all(
      lines.map(async (line) => {
        const employee = await storage.getEmployee(line.employeeId);
        return {
          ...line,
          employeeName: employee?.name || 'Unknown',
          employeeNumber: employee?.employeeNumber || '',
          bankAccountNumber: employee?.bankAccountNumber || '',
          bankIban: employee?.bankIban || '',
        };
      })
    );

    res.json({ ...run, lines: enrichedLines });
  }));

  // Create a draft payroll run (auto-populate from active employees)
  app.post("/api/companies/:companyId/payroll", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { period, runDate } = req.body;
    if (!period || !runDate) {
      return res.status(400).json({ message: 'Period and run date are required' });
    }

    // Get all active employees
    const allEmployees = await storage.getEmployeesByCompanyId(companyId);
    const activeEmployees = allEmployees.filter(e => e.status === 'active');

    if (activeEmployees.length === 0) {
      return res.status(400).json({ message: 'No active employees found to include in this payroll run' });
    }

    // Calculate totals
    let totalBasicSalary = 0;
    let totalAllowances = 0;
    let totalNetPay = 0;

    for (const emp of activeEmployees) {
      const basic = emp.basicSalary || 0;
      const housing = emp.housingAllowance || 0;
      const transport = emp.transportAllowance || 0;
      const other = emp.otherAllowances || 0;
      const allowances = housing + transport + other;
      const net = basic + allowances;

      totalBasicSalary += basic;
      totalAllowances += allowances;
      totalNetPay += net;
    }

    // Create the payroll run
    const run = await storage.createPayrollRun({
      companyId,
      period,
      runDate: new Date(runDate),
      totalBasicSalary,
      totalAllowances,
      totalDeductions: 0,
      totalNetPay,
      employeeCount: activeEmployees.length,
      status: 'draft',
      wpsFileGenerated: false,
    });

    // Create payroll lines for each active employee
    for (const emp of activeEmployees) {
      const basic = emp.basicSalary || 0;
      const housing = emp.housingAllowance || 0;
      const transport = emp.transportAllowance || 0;
      const other = emp.otherAllowances || 0;
      const net = basic + housing + transport + other;

      await storage.createPayrollLine({
        payrollRunId: run.id,
        employeeId: emp.id,
        basicSalary: basic,
        housingAllowance: housing,
        transportAllowance: transport,
        otherAllowances: other,
        deductions: 0,
        netPay: net,
      });
    }

    console.log('[Payroll] Draft run created:', run.id, 'with', activeEmployees.length, 'employees');
    res.json(run);
  }));

  // Approve a payroll run
  app.post("/api/payroll/:id/approve", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const run = await storage.getPayrollRun(id);
    if (!run) {
      return res.status(404).json({ message: 'Payroll run not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, run.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (run.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft payroll runs can be approved' });
    }

    const updated = await storage.updatePayrollRun(id, {
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date(),
    });

    console.log('[Payroll] Run approved:', id);
    res.json(updated);
  }));

  // Generate WPS SIF file for CBUAE
  app.post("/api/payroll/:id/generate-wps", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const run = await storage.getPayrollRun(id);
    if (!run) {
      return res.status(404).json({ message: 'Payroll run not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, run.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (run.status === 'draft') {
      return res.status(400).json({ message: 'Payroll run must be approved before generating WPS file' });
    }

    const lines = await storage.getPayrollLinesByRunId(id);
    if (lines.length === 0) {
      return res.status(400).json({ message: 'No payroll lines found for this run' });
    }

    // Build SIF file content
    const formatDate = (d: Date | string | null): string => {
      if (!d) return '01012026';
      const date = new Date(d);
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = String(date.getFullYear());
      return `${dd}${mm}${yyyy}`;
    };

    // Derive period start/end from the period string (e.g. "2026-03")
    const [yearStr, monthStr] = run.period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0); // last day of month
    const daysInMonth = periodEnd.getDate();

    const companyShortName = run.companyId.substring(0, 8).toUpperCase();
    const totalSalary = Math.round((run.totalNetPay || 0) * 100) / 100;

    // Header line
    const headerLine = `EDR,${run.companyId},${companyShortName},${formatDate(run.runDate)},${formatDate(periodStart)},${formatDate(periodEnd)},${run.employeeCount || lines.length},${totalSalary.toFixed(2)}`;

    // Employee lines
    const employeeLines: string[] = [];
    for (const line of lines) {
      const employee = await storage.getEmployee(line.employeeId);
      const empNumber = employee?.employeeNumber || '000';
      const routingCode = '000';
      const bankAccount = employee?.bankAccountNumber || '0000000000';
      const startDate = formatDate(periodStart);
      const endDate = formatDate(periodEnd);
      const netSalary = (line.netPay || 0).toFixed(2);
      const fixedAllowance = ((line.housingAllowance || 0) + (line.transportAllowance || 0)).toFixed(2);
      const variableAllowance = (line.otherAllowances || 0).toFixed(2);
      const leavePayment = '0.00';

      employeeLines.push(
        `EDR,${empNumber},${routingCode},${bankAccount},${startDate},${endDate},${daysInMonth},${netSalary},${fixedAllowance},${variableAllowance},${leavePayment},0`
      );
    }

    const sifContent = [headerLine, ...employeeLines].join('\n');

    // Mark run as WPS file generated
    await storage.updatePayrollRun(id, { wpsFileGenerated: true });

    console.log('[Payroll] WPS SIF file generated for run:', id);

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="WPS_SIF_${run.period}.SIF"`);
    res.send(sifContent);
  }));

  // Delete a payroll run (only draft)
  app.delete("/api/payroll/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const run = await storage.getPayrollRun(id);
    if (!run) {
      return res.status(404).json({ message: 'Payroll run not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, run.companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (run.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft payroll runs can be deleted' });
    }

    // Delete lines first (cascade should handle it, but be explicit)
    await storage.deletePayrollLinesByRunId(id);
    await storage.deletePayrollRun(id);

    console.log('[Payroll] Draft run deleted:', id);
    res.json({ message: 'Payroll run deleted successfully' });
  }));
}
