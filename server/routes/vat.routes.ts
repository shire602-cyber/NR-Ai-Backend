import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { authMiddleware, requireCustomer } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

export function registerVATRoutes(app: Express) {
  // =====================================
  // VAT RETURNS
  // =====================================

  // Get VAT returns by company
  app.get("/api/companies/:companyId/vat-returns", authMiddleware, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { companyId } = req.params;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const vatReturns = await storage.getVatReturnsByCompanyId(companyId);
    res.json(vatReturns);
  }));

  // Generate VAT return (FTA VAT 201 format with emirate breakdown)
  app.post("/api/companies/:companyId/vat-returns/generate", authMiddleware, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { companyId } = req.params;
    const { periodStart, periodEnd } = req.body;

    const hasAccess = await storage.hasCompanyAccess(userId, companyId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get company information for emirate and VAT registration
    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Validate VAT registration
    if (!company.trnVatNumber) {
      return res.status(400).json({
        message: 'Company must have a TRN/VAT number to generate VAT returns. Please update your company profile.',
        code: 'NO_TRN'
      });
    }

    const companyEmirate = company.emirate || 'dubai';

    // Calculate VAT from invoices and receipts
    const invoices = await storage.getInvoicesByCompanyId(companyId);
    const receipts = await storage.getReceiptsByCompanyId(companyId);

    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);

    // Filter invoices for the period
    const periodInvoices = invoices.filter(inv => {
      const invDate = new Date(inv.date);
      return invDate >= startDate && invDate <= endDate && inv.status !== 'void';
    });

    // Fetch all invoice lines for categorization by VAT supply type
    let standardRatedAmount = 0;
    let standardRatedVat = 0;
    let zeroRatedAmount = 0;
    let exemptAmount = 0;

    for (const invoice of periodInvoices) {
      const lines = await storage.getInvoiceLinesByInvoiceId(invoice.id);

      for (const line of lines) {
        const lineAmount = Number(line.quantity) * Number(line.unitPrice);
        const lineVat = lineAmount * (Number(line.vatRate) || 0);
        const supplyType = (line as any).vatSupplyType || 'standard_rated';

        if (supplyType === 'zero_rated' || line.vatRate === 0) {
          // Zero-rated supplies (exports, international services)
          zeroRatedAmount += lineAmount;
        } else if (supplyType === 'exempt') {
          // Exempt supplies (financial services, residential rent, etc.)
          exemptAmount += lineAmount;
        } else {
          // Standard rated (5% VAT)
          standardRatedAmount += lineAmount;
          standardRatedVat += lineVat;
        }
      }
    }

    // Calculate input tax from receipts
    const periodReceipts = receipts.filter(rec => {
      const recDate = new Date(rec.date || rec.createdAt);
      return recDate >= startDate && recDate <= endDate;
    });

    const totalExpenses = periodReceipts.reduce((sum, rec) => sum + (Number(rec.amount) || 0), 0);
    const inputTax = periodReceipts.reduce((sum, rec) => sum + (Number(rec.vatAmount) || 0), 0);

    // Due date is 28 days after period end (FTA requirement)
    const dueDate = new Date(endDate);
    dueDate.setDate(dueDate.getDate() + 28);

    // Determine VAT stagger from company settings or default to quarterly
    const vatStagger = company.vatFilingFrequency === 'Monthly' ? 'monthly' : 'quarterly';

    // Initialize emirate breakdown - all to company's registered emirate
    const emirateBreakdown = {
      box1aAbuDhabiAmount: '0', box1aAbuDhabiVat: '0', box1aAbuDhabiAdj: '0',
      box1bDubaiAmount: '0', box1bDubaiVat: '0', box1bDubaiAdj: '0',
      box1cSharjahAmount: '0', box1cSharjahVat: '0', box1cSharjahAdj: '0',
      box1dAjmanAmount: '0', box1dAjmanVat: '0', box1dAjmanAdj: '0',
      box1eUmmAlQuwainAmount: '0', box1eUmmAlQuwainVat: '0', box1eUmmAlQuwainAdj: '0',
      box1fRasAlKhaimahAmount: '0', box1fRasAlKhaimahVat: '0', box1fRasAlKhaimahAdj: '0',
      box1gFujairahAmount: '0', box1gFujairahVat: '0', box1gFujairahAdj: '0',
    };

    // Assign standard rated sales to company's emirate
    switch (companyEmirate) {
      case 'abu_dhabi':
        emirateBreakdown.box1aAbuDhabiAmount = String(standardRatedAmount);
        emirateBreakdown.box1aAbuDhabiVat = String(standardRatedVat);
        break;
      case 'sharjah':
        emirateBreakdown.box1cSharjahAmount = String(standardRatedAmount);
        emirateBreakdown.box1cSharjahVat = String(standardRatedVat);
        break;
      case 'ajman':
        emirateBreakdown.box1dAjmanAmount = String(standardRatedAmount);
        emirateBreakdown.box1dAjmanVat = String(standardRatedVat);
        break;
      case 'umm_al_quwain':
        emirateBreakdown.box1eUmmAlQuwainAmount = String(standardRatedAmount);
        emirateBreakdown.box1eUmmAlQuwainVat = String(standardRatedVat);
        break;
      case 'ras_al_khaimah':
        emirateBreakdown.box1fRasAlKhaimahAmount = String(standardRatedAmount);
        emirateBreakdown.box1fRasAlKhaimahVat = String(standardRatedVat);
        break;
      case 'fujairah':
        emirateBreakdown.box1gFujairahAmount = String(standardRatedAmount);
        emirateBreakdown.box1gFujairahVat = String(standardRatedVat);
        break;
      case 'dubai':
      default:
        emirateBreakdown.box1bDubaiAmount = String(standardRatedAmount);
        emirateBreakdown.box1bDubaiVat = String(standardRatedVat);
        break;
    }

    // Calculate totals
    const totalOutputAmount = standardRatedAmount + zeroRatedAmount + exemptAmount;
    const totalOutputVat = standardRatedVat;

    const vatReturn = await storage.createVatReturn({
      companyId,
      periodStart: startDate,
      periodEnd: endDate,
      dueDate,
      status: 'draft',
      vatStagger,
      // Emirate breakdown from company registration
      ...emirateBreakdown,
      // Box 2: Tourist Refund Scheme (manual entry needed)
      box2TouristRefundAmount: String(0),
      box2TouristRefundVat: String(0),
      // Box 3: Reverse charge supplies (imports requiring reverse charge)
      box3ReverseChargeAmount: String(0),
      box3ReverseChargeVat: String(0),
      // Box 4: Zero-rated supplies (exports, international services)
      box4ZeroRatedAmount: String(zeroRatedAmount),
      // Box 5: Exempt supplies (financial services, residential rent)
      box5ExemptAmount: String(exemptAmount),
      // Box 6: Imports subject to VAT
      box6ImportsAmount: String(0),
      box6ImportsVat: String(0),
      // Box 7: Adjustments for imports
      box7ImportsAdjAmount: String(0),
      box7ImportsAdjVat: String(0),
      // Box 8: Total output amounts and VAT
      box8TotalAmount: String(totalOutputAmount),
      box8TotalVat: String(totalOutputVat),
      box8TotalAdj: String(0),
      // Box 9: Standard rated expenses (input VAT recovery)
      box9ExpensesAmount: String(totalExpenses),
      box9ExpensesVat: String(inputTax),
      box9ExpensesAdj: String(0),
      // Box 10: Reverse charge on imports (input side)
      box10ReverseChargeAmount: String(0),
      box10ReverseChargeVat: String(0),
      // Box 11: Total input amounts and VAT
      box11TotalAmount: String(totalExpenses),
      box11TotalVat: String(inputTax),
      box11TotalAdj: String(0),
      // Box 12-14: VAT calculations
      box12TotalDueTax: String(totalOutputVat),
      box13RecoverableTax: String(inputTax),
      box14PayableTax: String(totalOutputVat - inputTax),
      // Legacy fields for backward compatibility
      box1SalesStandard: String(standardRatedAmount),
      box2SalesOtherEmirates: String(0),
      box3SalesTaxExempt: String(zeroRatedAmount),
      box4SalesExempt: String(exemptAmount),
      box5TotalOutputTax: String(totalOutputVat),
      box6ExpensesStandard: String(totalExpenses),
      box7ExpensesTouristRefund: String(0),
      box8TotalInputTax: String(inputTax),
      box9NetTax: String(totalOutputVat - inputTax),
      createdBy: userId,
    });

    // Return with additional metadata for the UI
    res.status(201).json({
      ...vatReturn,
      _metadata: {
        invoicesProcessed: periodInvoices.length,
        receiptsProcessed: periodReceipts.length,
        companyEmirate,
        trnNumber: company.trnVatNumber,
        standardRatedSales: standardRatedAmount,
        zeroRatedSales: zeroRatedAmount,
        exemptSales: exemptAmount,
        totalInputVat: inputTax,
        netVatPayable: totalOutputVat - inputTax,
      }
    });
  }));

  // Submit VAT return
  app.post("/api/vat-returns/:id/submit", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { id } = req.params;
    const { adjustmentAmount, adjustmentReason, notes } = req.body;

    const existing = await storage.getVatReturn(id);
    if (!existing) {
      return res.status(404).json({ message: 'VAT return not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, existing.companyId);
    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    const vatReturn = await storage.updateVatReturn(id, {
      status: 'submitted',
      adjustmentAmount: adjustmentAmount || 0,
      adjustmentReason: adjustmentReason || null,
      notes: notes || null,
      submittedBy: userId,
      submittedAt: new Date(),
    });

    res.json(vatReturn);
  }));

  // Update VAT return (for editing draft returns)
  app.patch("/api/vat-returns/:id", authMiddleware, requireCustomer, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { id } = req.params;
    const updateData = req.body;

    const existing = await storage.getVatReturn(id);
    if (!existing) {
      return res.status(404).json({ message: 'VAT return not found' });
    }

    const hasAccess = await storage.hasCompanyAccess(userId, existing.companyId);
    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    const vatReturn = await storage.updateVatReturn(id, {
      ...updateData,
      updatedAt: new Date(),
    });

    res.json(vatReturn);
  }));
}
