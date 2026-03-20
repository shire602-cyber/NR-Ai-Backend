import cron from 'node-cron';
import { storage } from '../storage';
import { createLogger } from '../config/logger';
import type { RecurringInvoice } from '../../shared/schema';

const log = createLogger('scheduler');

/**
 * Background scheduler for the Client Engagement Automation Engine.
 *
 * Scans for engagement triggers (overdue invoices, upcoming due dates)
 * and creates in-app notifications prompting the user to send WhatsApp
 * messages. No messages are sent automatically -- all WhatsApp sends
 * remain manual via wa.me links.
 *
 * Also generates invoices from active recurring invoice templates
 * whose nextRunDate has arrived.
 */
export function initScheduler() {
  log.info('Initializing background scheduler...');

  // Run every hour: scan for payment-related engagement triggers
  cron.schedule('0 * * * *', async () => {
    try {
      log.info('Running hourly payment reminder scan...');
      await scanPaymentReminders();
      log.info('Hourly payment reminder scan complete');
    } catch (err) {
      log.error({ err }, 'Scheduler error during payment reminder scan');
    }
  });

  // Run daily at 06:00: generate invoices from recurring templates
  cron.schedule('0 6 * * *', async () => {
    try {
      log.info('Running daily recurring invoice generation...');
      await generateRecurringInvoices();
      log.info('Daily recurring invoice generation complete');
    } catch (err) {
      log.error({ err }, 'Scheduler error during recurring invoice generation');
    }
  });

  log.info('Scheduler initialized — running payment scans every hour, recurring invoices daily at 06:00');
}

/**
 * Computes the due date for an invoice based on its issue date and
 * the customer's payment terms (default 30 days).
 */
function computeDueDate(invoiceDate: Date, paymentTerms: number): Date {
  const due = new Date(invoiceDate);
  due.setDate(due.getDate() + paymentTerms);
  return due;
}

/**
 * Builds a unique key for deduplicating reminder logs so the same
 * reminder is not created twice for the same invoice + rule.
 */
function reminderKey(invoiceId: string, rule: string): string {
  return `${rule}::${invoiceId}`;
}

/**
 * Scans all companies for invoices that match engagement rules and
 * creates notifications for the company owner(s).
 */
async function scanPaymentReminders() {
  const companies = await storage.getAllCompanies();

  for (const company of companies) {
    try {
      await scanCompanyPaymentReminders(company.id);
    } catch (err) {
      log.error({ err, companyId: company.id }, 'Error scanning reminders for company');
    }
  }
}

/**
 * For a single company, check all unpaid invoices against reminder rules
 * and create notifications where appropriate.
 */
async function scanCompanyPaymentReminders(companyId: string) {
  const invoices = await storage.getInvoicesByCompanyId(companyId);
  const customers = await storage.getCustomerContactsByCompanyId(companyId);
  const existingLogs = await storage.getReminderLogsByCompanyId(companyId);
  const companyUsers = await storage.getCompanyUsersByCompanyId(companyId);

  // Build a set of already-sent reminder keys for dedup
  const sentKeys = new Set<string>();
  for (const rl of existingLogs) {
    if (rl.relatedEntityId && rl.reminderType) {
      sentKeys.add(reminderKey(rl.relatedEntityId, rl.reminderType));
    }
  }

  // Build a lookup of customer name -> customer
  const customerByName = new Map<string, typeof customers[number]>();
  for (const c of customers) {
    customerByName.set(c.name, c);
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Filter to unpaid invoices
  const unpaid = invoices.filter(
    (inv) => inv.status !== 'paid' && inv.status !== 'void'
  );

  for (const inv of unpaid) {
    const customer = customerByName.get(inv.customerName);
    const paymentTerms = customer?.paymentTerms ?? 30;
    const dueDate = computeDueDate(new Date(inv.date), paymentTerms);
    const dueDateStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const diffDays = Math.round(
      (dueDateStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Rule: Due in 3 days
    if (diffDays === 3) {
      await maybeCreateReminder({
        companyId,
        companyUsers,
        invoice: { id: inv.id, number: inv.number, total: Number(inv.total) },
        ruleType: 'due_in_3_days',
        sentKeys,
        title: `Payment reminder: Invoice #${inv.number} due in 3 days`,
        message: `Invoice #${inv.number} for ${inv.customerName} (AED ${Number(inv.total).toFixed(2)}) is due on ${dueDateStart.toLocaleDateString('en-AE')}. Consider sending a WhatsApp reminder.`,
        priority: 'normal',
      });
    }

    // Rule: Due today
    if (diffDays === 0) {
      await maybeCreateReminder({
        companyId,
        companyUsers,
        invoice: { id: inv.id, number: inv.number, total: Number(inv.total) },
        ruleType: 'due_today',
        sentKeys,
        title: `Payment due today: Invoice #${inv.number}`,
        message: `Invoice #${inv.number} for ${inv.customerName} (AED ${Number(inv.total).toFixed(2)}) is due today. Send a WhatsApp reminder to follow up.`,
        priority: 'high',
      });
    }

    // Rule: Overdue by 7+ days
    if (diffDays <= -7) {
      await maybeCreateReminder({
        companyId,
        companyUsers,
        invoice: { id: inv.id, number: inv.number, total: Number(inv.total) },
        ruleType: 'overdue_7_days',
        sentKeys,
        title: `Overdue: Invoice #${inv.number} (${Math.abs(diffDays)} days)`,
        message: `Invoice #${inv.number} for ${inv.customerName} (AED ${Number(inv.total).toFixed(2)}) is ${Math.abs(diffDays)} days overdue. Send a WhatsApp follow-up to collect payment.`,
        priority: 'urgent',
      });
    }
  }
}

interface ReminderParams {
  companyId: string;
  companyUsers: { userId: string }[];
  invoice: { id: string; number: string; total: number };
  ruleType: string;
  sentKeys: Set<string>;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

/**
 * Creates a notification + reminder log if one hasn't already been sent
 * for this invoice + rule combination.
 */
async function maybeCreateReminder(params: ReminderParams) {
  const key = reminderKey(params.invoice.id, params.ruleType);
  if (params.sentKeys.has(key)) {
    return; // Already sent this reminder
  }

  // Create a notification for each user associated with the company
  for (const cu of params.companyUsers) {
    try {
      await storage.createNotification({
        userId: cu.userId,
        companyId: params.companyId,
        type: 'payment_due',
        title: params.title,
        message: params.message,
        priority: params.priority,
        relatedEntityType: 'invoice',
        relatedEntityId: params.invoice.id,
        actionUrl: `/invoices`,
        isRead: false,
        isDismissed: false,
      });
    } catch (err) {
      log.error({ err, userId: cu.userId, invoiceId: params.invoice.id }, 'Failed to create notification');
    }
  }

  // Log the reminder to prevent duplicates
  try {
    await storage.createReminderLog({
      companyId: params.companyId,
      reminderType: params.ruleType,
      relatedEntityType: 'invoice',
      relatedEntityId: params.invoice.id,
      channel: 'in_app',
      status: 'sent',
      attemptNumber: 1,
      sentAt: new Date(),
    });
  } catch (err) {
    log.error({ err, invoiceId: params.invoice.id }, 'Failed to create reminder log');
  }

  params.sentKeys.add(key);
  log.info(
    { companyId: params.companyId, invoiceId: params.invoice.id, rule: params.ruleType },
    `Created payment reminder notification`
  );
}

// =========================================================================
// Recurring Invoice Generation
// =========================================================================

/**
 * Calculates the next generation date by advancing `current` by one period
 * based on the given frequency.
 */
function calculateNextRunDate(current: Date, frequency: string): Date {
  const next = new Date(current);
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      // Default to monthly if frequency is unrecognised
      next.setMonth(next.getMonth() + 1);
      break;
  }
  return next;
}

/**
 * Generates an invoice number for a recurring template.
 * Format: REC-<totalGenerated + 1>-<timestamp suffix>
 * e.g. REC-3-20260320
 */
function generateRecurringInvoiceNumber(template: RecurringInvoice): string {
  const seq = (template.totalGenerated ?? 0) + 1;
  const now = new Date();
  const dateSuffix = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0');
  return `REC-${seq}-${dateSuffix}`;
}

interface TemplateLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
  vatSupplyType?: string;
}

/**
 * Queries all active recurring invoice templates whose nextRunDate has
 * arrived (or passed) and generates a new invoice for each one.
 *
 * Each template is processed independently -- a failure in one template
 * does not prevent the others from being generated.
 */
async function generateRecurringInvoices() {
  const dueTemplates = await storage.getDueRecurringInvoices();

  if (dueTemplates.length === 0) {
    log.info('No recurring invoices due for generation');
    return;
  }

  log.info({ count: dueTemplates.length }, 'Found recurring invoice templates due for generation');

  let successCount = 0;
  let failCount = 0;

  for (const template of dueTemplates) {
    try {
      // If the template has an endDate and we've passed it, deactivate
      if (template.endDate && new Date(template.endDate) < new Date()) {
        log.info(
          { templateId: template.id, companyId: template.companyId },
          'Recurring invoice template has passed its end date — deactivating'
        );
        await storage.updateRecurringInvoice(template.id, { isActive: false });
        continue;
      }

      await generateInvoiceFromTemplate(template);
      successCount++;
    } catch (err) {
      failCount++;
      log.error(
        { err, templateId: template.id, companyId: template.companyId },
        'Failed to generate invoice from recurring template'
      );
    }
  }

  log.info(
    { successCount, failCount, total: dueTemplates.length },
    'Recurring invoice generation run complete'
  );
}

/**
 * Creates a single invoice (with line items) from a recurring invoice
 * template, then advances the template's nextRunDate and increments
 * its generation counter.
 */
async function generateInvoiceFromTemplate(template: RecurringInvoice) {
  // Parse the stored line items
  let lines: TemplateLine[];
  try {
    lines = JSON.parse(template.linesJson);
  } catch {
    throw new Error(`Invalid linesJson for recurring invoice ${template.id}`);
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error(`Empty or invalid lines array for recurring invoice ${template.id}`);
  }

  // Calculate totals from the line items
  let subtotal = 0;
  let vatAmount = 0;

  for (const line of lines) {
    const lineTotal = (line.quantity ?? 1) * (line.unitPrice ?? 0);
    subtotal += lineTotal;
    vatAmount += lineTotal * (line.vatRate ?? 0.05);
  }

  const total = subtotal + vatAmount;

  // Generate a unique invoice number
  const invoiceNumber = generateRecurringInvoiceNumber(template);

  // Create the invoice
  const invoice = await storage.createInvoice({
    companyId: template.companyId,
    number: invoiceNumber,
    customerName: template.customerName,
    customerTrn: template.customerTrn,
    date: new Date(),
    currency: template.currency,
    subtotal: subtotal.toFixed(2),
    vatAmount: vatAmount.toFixed(2),
    total: total.toFixed(2),
    status: 'draft',
  });

  // Create invoice line items
  for (const line of lines) {
    await storage.createInvoiceLine({
      invoiceId: invoice.id,
      description: line.description,
      quantity: line.quantity ?? 1,
      unitPrice: String(line.unitPrice ?? 0),
      vatRate: line.vatRate ?? 0.05,
      vatSupplyType: line.vatSupplyType ?? 'standard_rated',
    });
  }

  // Calculate the next run date and update the template
  const nextRunDate = calculateNextRunDate(
    new Date(template.nextRunDate),
    template.frequency
  );

  await storage.updateRecurringInvoice(template.id, {
    nextRunDate,
    lastGeneratedInvoiceId: invoice.id,
    totalGenerated: (template.totalGenerated ?? 0) + 1,
  });

  log.info(
    {
      templateId: template.id,
      companyId: template.companyId,
      invoiceId: invoice.id,
      invoiceNumber,
      customerName: template.customerName,
      total: total.toFixed(2),
      frequency: template.frequency,
      nextRunDate: nextRunDate.toISOString(),
    },
    'Generated invoice from recurring template'
  );
}
