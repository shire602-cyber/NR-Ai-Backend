import cron from 'node-cron';
import { storage } from '../storage';
import { createLogger } from '../config/logger';

const log = createLogger('scheduler');

/**
 * Background scheduler for the Client Engagement Automation Engine.
 *
 * Scans for engagement triggers (overdue invoices, upcoming due dates)
 * and creates in-app notifications prompting the user to send WhatsApp
 * messages. No messages are sent automatically -- all WhatsApp sends
 * remain manual via wa.me links.
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

  log.info('Scheduler initialized — running payment scans every hour');
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
        invoice: inv,
        ruleType: 'due_in_3_days',
        sentKeys,
        title: `Payment reminder: Invoice #${inv.number} due in 3 days`,
        message: `Invoice #${inv.number} for ${inv.customerName} (AED ${Number(inv.total ?? 0).toFixed(2)}) is due on ${dueDateStart.toLocaleDateString('en-AE')}. Consider sending a WhatsApp reminder.`,
        priority: 'normal',
      });
    }

    // Rule: Due today
    if (diffDays === 0) {
      await maybeCreateReminder({
        companyId,
        companyUsers,
        invoice: inv,
        ruleType: 'due_today',
        sentKeys,
        title: `Payment due today: Invoice #${inv.number}`,
        message: `Invoice #${inv.number} for ${inv.customerName} (AED ${Number(inv.total ?? 0).toFixed(2)}) is due today. Send a WhatsApp reminder to follow up.`,
        priority: 'high',
      });
    }

    // Rule: Overdue by 7+ days
    if (diffDays <= -7) {
      await maybeCreateReminder({
        companyId,
        companyUsers,
        invoice: inv,
        ruleType: 'overdue_7_days',
        sentKeys,
        title: `Overdue: Invoice #${inv.number} (${Math.abs(diffDays)} days)`,
        message: `Invoice #${inv.number} for ${inv.customerName} (AED ${Number(inv.total ?? 0).toFixed(2)}) is ${Math.abs(diffDays)} days overdue. Send a WhatsApp follow-up to collect payment.`,
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
