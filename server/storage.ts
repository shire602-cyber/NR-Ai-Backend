import type { 
  User, InsertUser,
  Company, InsertCompany,
  CompanyUser, InsertCompanyUser,
  Account, InsertAccount,
  JournalEntry, InsertJournalEntry,
  JournalLine, InsertJournalLine,
  Invoice, InsertInvoice,
  InvoiceLine, InsertInvoiceLine,
  Receipt, InsertReceipt,
  CustomerContact, InsertCustomerContact,
  Waitlist, InsertWaitlist,
  IntegrationSync, InsertIntegrationSync,
  WhatsappConfig, InsertWhatsappConfig,
  WhatsappMessage, InsertWhatsappMessage,
  AnomalyAlert, InsertAnomalyAlert,
  BankTransaction, InsertBankTransaction,
  CashFlowForecast, InsertCashFlowForecast,
  TransactionClassification, InsertTransactionClassification,
  Budget, InsertBudget,
  EcommerceIntegration, InsertEcommerceIntegration,
  EcommerceTransaction, InsertEcommerceTransaction,
  FinancialKpi, InsertFinancialKpi,
  Notification, InsertNotification,
  RegulatoryNews, InsertRegulatoryNews,
  ReminderSetting, InsertReminderSetting,
  ReminderLog, InsertReminderLog,
  UserOnboarding, InsertUserOnboarding,
  HelpTip, InsertHelpTip,
  ReferralCode, InsertReferralCode,
  Referral, InsertReferral,
  UserFeedback, InsertUserFeedback,
  AnalyticsEvent, InsertAnalyticsEvent,
  FeatureUsageMetric, InsertFeatureUsageMetric,
  AdminSetting, InsertAdminSetting,
  SubscriptionPlan, InsertSubscriptionPlan,
  UserSubscription, InsertUserSubscription,
  AuditLog, InsertAuditLog,
  VatReturn, InsertVatReturn,
  Document, InsertDocument,
  TaxReturnArchive, InsertTaxReturnArchive,
  ComplianceTask, InsertComplianceTask,
  Message, InsertMessage,
  NewsItem, InsertNewsItem,
  Invitation, InsertInvitation,
  ActivityLog, InsertActivityLog,
  ClientNote, InsertClientNote,
  Engagement, InsertEngagement,
  ServiceInvoice, InsertServiceInvoice,
  ServiceInvoiceLine, InsertServiceInvoiceLine,
  FtaEmail, InsertFtaEmail,
  Subscription, InsertSubscription,
  Backup, InsertBackup,
  AiConversation, InsertAiConversation,
  RecurringInvoice, InsertRecurringInvoice,
  CorporateTaxReturn, InsertCorporateTaxReturn,
  Product, InsertProduct,
  InventoryMovement, InsertInventoryMovement,
  Quote, InsertQuote,
  QuoteLine, InsertQuoteLine,
  CreditNote, InsertCreditNote,
  CreditNoteLine, InsertCreditNoteLine,
  PurchaseOrder, InsertPurchaseOrder,
  PurchaseOrderLine, InsertPurchaseOrderLine,
  InvoiceTemplate, InsertInvoiceTemplate,
  BankConnection, InsertBankConnection,
  StripeEvent, InsertStripeEvent,
  PushSubscription, InsertPushSubscription,
  NotificationPreferences, InsertNotificationPreferences,
  ExchangeRate, InsertExchangeRate,
  Employee, InsertEmployee,
  PayrollRun, InsertPayrollRun,
  PayrollLine, InsertPayrollLine,
  ReconciliationRule, InsertReconciliationRule,
  DocumentVersion, InsertDocumentVersion,
  ApiKey, InsertApiKey,
  WebhookEndpoint, InsertWebhookEndpoint,
  WebhookDelivery, InsertWebhookDelivery,
  CostCenter, InsertCostCenter,
  FixedAssetCategory, InsertFixedAssetCategory,
  FixedAsset, InsertFixedAsset,
  DepreciationSchedule, InsertDepreciationSchedule
} from "@shared/schema";
import {
  users,
  companies,
  companyUsers,
  accounts,
  journalEntries,
  journalLines,
  invoices,
  invoiceLines,
  receipts,
  customerContacts,
  waitlist,
  integrationSyncs,
  whatsappConfigs,
  whatsappMessages,
  anomalyAlerts,
  bankTransactions,
  cashFlowForecasts,
  transactionClassifications,
  budgets,
  ecommerceIntegrations,
  ecommerceTransactions,
  financialKpis,
  notifications,
  regulatoryNews,
  reminderSettings,
  reminderLogs,
  userOnboarding,
  helpTips,
  referralCodes,
  referrals,
  userFeedback,
  analyticsEvents,
  featureUsageMetrics,
  adminSettings,
  subscriptionPlans,
  userSubscriptions,
  auditLogs,
  vatReturns,
  documents,
  taxReturnArchive,
  complianceTasks,
  messages,
  newsItems,
  invitations,
  activityLogs,
  clientNotes,
  engagements,
  serviceInvoices,
  serviceInvoiceLines,
  ftaEmails,
  subscriptions,
  backups,
  aiConversations,
  recurringInvoices,
  corporateTaxReturns,
  products,
  inventoryMovements,
  quotes,
  quoteLines,
  creditNotes,
  creditNoteLines,
  purchaseOrders,
  purchaseOrderLines,
  invoiceTemplates,
  bankConnections,
  stripeEvents,
  pushSubscriptions,
  notificationPreferences,
  exchangeRates,
  employees,
  payrollRuns,
  payrollLines,
  reconciliationRules,
  documentVersions,
  apiKeys,
  webhookEndpoints,
  webhookDeliveries,
  costCenters,
  fixedAssetCategories,
  fixedAssets,
  depreciationSchedules,
  jwtRevocations
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, lte, sql, lt } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // JWT revocation
  revokeJwt(jti: string, expiresAt: Date, userId?: string, reason?: string): Promise<void>;
  isJwtRevoked(jti: string): Promise<boolean>;
  pruneExpiredJwtRevocations(): Promise<number>;

  // Companies
  getCompany(id: string): Promise<Company | undefined>;
  getCompanyByName(name: string): Promise<Company | undefined>;
  getCompaniesByUserId(userId: string): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company>;
  
  // Company Users
  createCompanyUser(companyUser: InsertCompanyUser): Promise<CompanyUser>;
  getUserRole(companyId: string, userId: string): Promise<CompanyUser | undefined>;
  getCompanyUsersByCompanyId(companyId: string): Promise<CompanyUser[]>;
  hasCompanyAccess(userId: string, companyId: string): Promise<boolean>;
  
  // Accounts
  getAccount(id: string): Promise<Account | undefined>;
  getAccountsByCompanyId(companyId: string): Promise<Account[]>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: string, data: Partial<InsertAccount>): Promise<Account>;
  deleteAccount(id: string): Promise<void>;
  accountHasTransactions(accountId: string): Promise<boolean>;
  
  // Account Ledger & Balance
  getAccountsWithBalances(companyId: string, dateRange?: { start: Date; end: Date }): Promise<{
    account: Account;
    balance: number;
    debitTotal: number;
    creditTotal: number;
  }[]>;
  getAccountLedger(accountId: string, options?: { 
    dateStart?: Date; 
    dateEnd?: Date; 
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    entries: {
      id: string;
      date: Date;
      entryNumber: string;
      description: string;
      debit: number;
      credit: number;
      runningBalance: number;
      journalEntryId: string;
      journalLineId: string;
      memo: string | null;
      source: string;
      status: string;
    }[];
    allEntries: {
      id: string;
      date: Date;
      entryNumber: string;
      description: string;
      debit: number;
      credit: number;
      runningBalance: number;
      journalEntryId: string;
      journalLineId: string;
      memo: string | null;
      source: string;
      status: string;
    }[];
    account: Account;
    openingBalance: number;
    totalDebit: number;
    totalCredit: number;
    closingBalance: number;
    totalCount: number;
  }>;
  
  // Journal Entries
  getJournalEntry(id: string): Promise<JournalEntry | undefined>;
  getJournalEntriesByCompanyId(companyId: string): Promise<JournalEntry[]>;
  createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry>;
  updateJournalEntry(id: string, data: Partial<InsertJournalEntry>): Promise<JournalEntry>;
  deleteJournalEntry(id: string): Promise<void>;
  generateEntryNumber(companyId: string, date: Date, tx?: any): Promise<string>;
  createJournalEntryWithLines(
    companyId: string,
    date: Date,
    entryData: Omit<InsertJournalEntry, 'entryNumber' | 'companyId' | 'date'>,
    lines: Array<Omit<InsertJournalLine, 'entryId'>>,
  ): Promise<{ entry: JournalEntry; lines: JournalLine[] }>;

  // Journal Lines
  createJournalLine(line: InsertJournalLine): Promise<JournalLine>;
  getJournalLinesByEntryId(entryId: string): Promise<JournalLine[]>;
  deleteJournalLinesByEntryId(entryId: string): Promise<void>;
  
  // Invoices
  getInvoice(id: string): Promise<Invoice | undefined>;
  getInvoicesByCompanyId(companyId: string): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice>;
  updateInvoiceStatus(id: string, status: string): Promise<Invoice>;
  deleteInvoice(id: string): Promise<void>;
  
  // Invoice Share Token
  getInvoiceByShareToken(token: string): Promise<Invoice | undefined>;
  setInvoiceShareToken(id: string, token: string, expiresAt: Date): Promise<void>;

  // Invoice Lines
  createInvoiceLine(line: InsertInvoiceLine): Promise<InvoiceLine>;
  getInvoiceLinesByInvoiceId(invoiceId: string): Promise<InvoiceLine[]>;
  deleteInvoiceLinesByInvoiceId(invoiceId: string): Promise<void>;
  
  // Receipts
  getReceipt(id: string): Promise<Receipt | undefined>;
  createReceipt(receipt: InsertReceipt): Promise<Receipt>;
  getReceiptsByCompanyId(companyId: string): Promise<Receipt[]>;
  updateReceipt(id: string, data: Partial<InsertReceipt>): Promise<Receipt>;
  deleteReceipt(id: string): Promise<void>;
  
  // Customer Contacts
  getCustomerContact(id: string): Promise<CustomerContact | undefined>;
  getCustomerContactsByCompanyId(companyId: string): Promise<CustomerContact[]>;
  getCustomerContactByEmail(companyId: string, email: string): Promise<CustomerContact | undefined>;
  getCustomerContactByTrn(companyId: string, trn: string): Promise<CustomerContact | undefined>;
  createCustomerContact(contact: InsertCustomerContact): Promise<CustomerContact>;
  createBulkCustomerContacts(contacts: InsertCustomerContact[]): Promise<CustomerContact[]>;
  updateCustomerContact(id: string, data: Partial<InsertCustomerContact>): Promise<CustomerContact>;
  deleteCustomerContact(id: string): Promise<void>;
  getCustomerContactByPortalToken(token: string): Promise<CustomerContact | undefined>;
  setPortalAccessToken(contactId: string, token: string, expiresAt: Date): Promise<CustomerContact>;

  // Waitlist
  createWaitlistEntry(entry: InsertWaitlist): Promise<Waitlist>;
  getWaitlistByEmail(email: string): Promise<Waitlist | undefined>;
  
  // Integration Syncs
  createIntegrationSync(sync: InsertIntegrationSync): Promise<IntegrationSync>;
  getIntegrationSyncsByCompanyId(companyId: string): Promise<IntegrationSync[]>;
  getIntegrationSyncsByType(companyId: string, integrationType: string): Promise<IntegrationSync[]>;

  // WhatsApp Configuration
  getWhatsappConfig(companyId: string): Promise<WhatsappConfig | undefined>;
  getWhatsappConfigByPhoneNumberId(phoneNumberId: string): Promise<WhatsappConfig | undefined>;
  createWhatsappConfig(config: InsertWhatsappConfig): Promise<WhatsappConfig>;
  updateWhatsappConfig(id: string, data: Partial<InsertWhatsappConfig>): Promise<WhatsappConfig>;

  // WhatsApp Messages
  createWhatsappMessage(message: InsertWhatsappMessage): Promise<WhatsappMessage>;
  getWhatsappMessagesByCompanyId(companyId: string): Promise<WhatsappMessage[]>;
  getWhatsappMessage(id: string): Promise<WhatsappMessage | undefined>;
  updateWhatsappMessage(id: string, data: Partial<InsertWhatsappMessage>): Promise<WhatsappMessage>;

  // AI Anomaly Alerts
  createAnomalyAlert(alert: InsertAnomalyAlert): Promise<AnomalyAlert>;
  getAnomalyAlertById(id: string): Promise<AnomalyAlert | undefined>;
  getAnomalyAlertsByCompanyId(companyId: string): Promise<AnomalyAlert[]>;
  getUnresolvedAnomalyAlerts(companyId: string): Promise<AnomalyAlert[]>;
  updateAnomalyAlert(id: string, data: Partial<InsertAnomalyAlert>): Promise<AnomalyAlert>;
  resolveAnomalyAlert(id: string, userId: string, note?: string): Promise<AnomalyAlert>;

  // Bank Transactions
  createBankTransaction(transaction: InsertBankTransaction): Promise<BankTransaction>;
  getBankTransactionById(id: string): Promise<BankTransaction | undefined>;
  getBankTransactionsByCompanyId(companyId: string): Promise<BankTransaction[]>;
  getUnreconciledBankTransactions(companyId: string): Promise<BankTransaction[]>;
  updateBankTransaction(id: string, data: Partial<InsertBankTransaction>): Promise<BankTransaction>;
  reconcileBankTransaction(id: string, matchedId: string, matchType: 'journal' | 'receipt' | 'invoice'): Promise<BankTransaction>;

  // Cash Flow Forecasts
  createCashFlowForecast(forecast: InsertCashFlowForecast): Promise<CashFlowForecast>;
  getCashFlowForecastsByCompanyId(companyId: string): Promise<CashFlowForecast[]>;
  deleteCashFlowForecastsByCompanyId(companyId: string): Promise<void>;

  // Transaction Classifications
  createTransactionClassification(classification: InsertTransactionClassification): Promise<TransactionClassification>;
  getTransactionClassification(id: string): Promise<TransactionClassification | undefined>;
  getTransactionClassificationsByCompanyId(companyId: string): Promise<TransactionClassification[]>;
  updateTransactionClassification(id: string, data: Partial<InsertTransactionClassification>): Promise<TransactionClassification>;

  // Journal Lines (for analytics)
  getJournalLinesByCompanyId(companyId: string): Promise<JournalLine[]>;

  // Budgets
  getBudgetsByCompanyId(companyId: string, year: number, month: number): Promise<Budget[]>;
  createBudget(budget: InsertBudget): Promise<Budget>;
  updateBudget(id: string, data: Partial<InsertBudget>): Promise<Budget>;

  // E-Commerce Integrations
  getEcommerceIntegrations(companyId: string): Promise<EcommerceIntegration[]>;
  createEcommerceIntegration(integration: InsertEcommerceIntegration): Promise<EcommerceIntegration>;
  updateEcommerceIntegration(id: string, data: Partial<InsertEcommerceIntegration>): Promise<EcommerceIntegration>;
  deleteEcommerceIntegration(id: string): Promise<void>;

  // E-Commerce Transactions
  getEcommerceTransactions(companyId: string): Promise<EcommerceTransaction[]>;
  createEcommerceTransaction(transaction: InsertEcommerceTransaction): Promise<EcommerceTransaction>;
  updateEcommerceTransaction(id: string, data: Partial<InsertEcommerceTransaction>): Promise<EcommerceTransaction>;

  // Financial KPIs
  getFinancialKpis(companyId: string): Promise<FinancialKpi[]>;
  createFinancialKpi(kpi: InsertFinancialKpi): Promise<FinancialKpi>;
  
  // Cash Flow Forecasts (alias for consistency)
  getCashFlowForecasts(companyId: string): Promise<CashFlowForecast[]>;
  
  // Notifications
  getNotification(id: string): Promise<Notification | undefined>;
  getNotificationsByUserId(userId: string): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  dismissNotification(id: string): Promise<Notification>;
  
  // Regulatory News
  getRegulatoryNews(): Promise<RegulatoryNews[]>;
  createRegulatoryNews(news: InsertRegulatoryNews): Promise<RegulatoryNews>;
  
  // Reminder Settings
  getReminderSetting(id: string): Promise<ReminderSetting | undefined>;
  getReminderSettingsByCompanyId(companyId: string): Promise<ReminderSetting[]>;
  createReminderSetting(setting: InsertReminderSetting): Promise<ReminderSetting>;
  updateReminderSetting(id: string, data: Partial<InsertReminderSetting>): Promise<ReminderSetting>;
  
  // Reminder Logs
  getReminderLogsByCompanyId(companyId: string): Promise<ReminderLog[]>;
  createReminderLog(log: InsertReminderLog): Promise<ReminderLog>;
  updateReminderLog(id: string, data: Partial<InsertReminderLog>): Promise<ReminderLog>;
  
  // User Onboarding
  getUserOnboarding(userId: string): Promise<UserOnboarding | undefined>;
  createUserOnboarding(onboarding: InsertUserOnboarding): Promise<UserOnboarding>;
  updateUserOnboarding(userId: string, data: Partial<InsertUserOnboarding>): Promise<UserOnboarding>;
  
  // Help Tips
  getHelpTipsByPage(pageContext: string): Promise<HelpTip[]>;
  getAllHelpTips(): Promise<HelpTip[]>;
  createHelpTip(tip: InsertHelpTip): Promise<HelpTip>;
  
  // Referral Codes
  getReferralCodeByUserId(userId: string): Promise<ReferralCode | undefined>;
  getReferralCodeByCode(code: string): Promise<ReferralCode | undefined>;
  createReferralCode(code: InsertReferralCode): Promise<ReferralCode>;
  updateReferralCode(id: string, data: Partial<InsertReferralCode>): Promise<ReferralCode>;
  
  // Referrals
  getReferralsByReferrerId(referrerId: string): Promise<Referral[]>;
  createReferral(referral: InsertReferral): Promise<Referral>;
  updateReferral(id: string, data: Partial<InsertReferral>): Promise<Referral>;
  
  // User Feedback
  createUserFeedback(feedback: InsertUserFeedback): Promise<UserFeedback>;
  getUserFeedback(userId?: string): Promise<UserFeedback[]>;
  updateUserFeedback(id: string, data: Partial<InsertUserFeedback>): Promise<UserFeedback>;
  
  // Analytics Events
  createAnalyticsEvent(event: InsertAnalyticsEvent): Promise<AnalyticsEvent>;
  getAnalyticsEvents(filters?: { userId?: string; eventType?: string; startDate?: Date; endDate?: Date }): Promise<AnalyticsEvent[]>;
  
  // Feature Usage Metrics
  getFeatureUsageMetrics(featureName?: string): Promise<FeatureUsageMetric[]>;
  createFeatureUsageMetric(metric: InsertFeatureUsageMetric): Promise<FeatureUsageMetric>;

  // Admin Settings
  getAdminSettings(): Promise<AdminSetting[]>;
  getAdminSettingByKey(key: string): Promise<AdminSetting | undefined>;
  createAdminSetting(setting: InsertAdminSetting): Promise<AdminSetting>;
  updateAdminSetting(key: string, value: string): Promise<AdminSetting>;

  // Subscription Plans
  getSubscriptionPlans(): Promise<SubscriptionPlan[]>;
  getSubscriptionPlan(id: string): Promise<SubscriptionPlan | undefined>;
  createSubscriptionPlan(plan: InsertSubscriptionPlan): Promise<SubscriptionPlan>;
  updateSubscriptionPlan(id: string, data: Partial<InsertSubscriptionPlan>): Promise<SubscriptionPlan>;
  deleteSubscriptionPlan(id: string): Promise<void>;

  // User Subscriptions
  getUserSubscription(userId: string): Promise<UserSubscription | undefined>;
  createUserSubscription(subscription: InsertUserSubscription): Promise<UserSubscription>;
  updateUserSubscription(id: string, data: Partial<InsertUserSubscription>): Promise<UserSubscription>;

  // Audit Logs
  getAuditLogs(limit?: number): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;

  // VAT Returns
  getVatReturnsByCompanyId(companyId: string): Promise<VatReturn[]>;
  getVatReturn(id: string): Promise<VatReturn | undefined>;
  createVatReturn(vatReturn: InsertVatReturn): Promise<VatReturn>;
  updateVatReturn(id: string, data: Partial<InsertVatReturn>): Promise<VatReturn>;
  deleteVatReturn(id: string): Promise<void>;

  // Corporate Tax Returns
  getCorporateTaxReturnsByCompanyId(companyId: string): Promise<CorporateTaxReturn[]>;
  getCorporateTaxReturn(id: string): Promise<CorporateTaxReturn | undefined>;
  createCorporateTaxReturn(data: InsertCorporateTaxReturn): Promise<CorporateTaxReturn>;
  updateCorporateTaxReturn(id: string, data: Partial<CorporateTaxReturn>): Promise<CorporateTaxReturn>;

  // Team Management
  updateCompanyUser(id: string, data: Partial<InsertCompanyUser>): Promise<CompanyUser>;
  deleteCompanyUser(id: string): Promise<void>;
  getCompanyUserWithUser(companyId: string): Promise<(CompanyUser & { user: User })[]>;

  // Admin Stats
  getAllUsers(): Promise<User[]>;
  getAllCompanies(): Promise<Company[]>;

  // Document Vault
  getDocuments(companyId: string): Promise<Document[]>;
  getDocument(id: string): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: string, data: Partial<InsertDocument>): Promise<Document>;
  deleteDocument(id: string): Promise<void>;

  // Tax Return Archive
  getTaxReturnArchive(companyId: string): Promise<TaxReturnArchive[]>;
  getTaxReturnArchiveItem(id: string): Promise<TaxReturnArchive | undefined>;
  createTaxReturnArchive(taxReturn: InsertTaxReturnArchive): Promise<TaxReturnArchive>;

  // Compliance Tasks
  getComplianceTasks(companyId: string): Promise<ComplianceTask[]>;
  getComplianceTask(id: string): Promise<ComplianceTask | undefined>;
  createComplianceTask(task: InsertComplianceTask): Promise<ComplianceTask>;
  updateComplianceTask(id: string, data: Partial<InsertComplianceTask>): Promise<ComplianceTask>;
  deleteComplianceTask(id: string): Promise<void>;

  // Messages
  getMessages(companyId: string): Promise<Message[]>;
  getMessage(id: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessageAsRead(id: string): Promise<Message>;

  // News Items
  getNewsItems(): Promise<NewsItem[]>;
  createNewsItem(news: InsertNewsItem): Promise<NewsItem>;

  // Invitations (Admin)
  getInvitations(): Promise<Invitation[]>;
  getInvitationsByCompany(companyId: string): Promise<Invitation[]>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  getInvitationByEmail(email: string): Promise<Invitation | undefined>;
  createInvitation(invitation: InsertInvitation): Promise<Invitation>;
  updateInvitation(id: string, data: Partial<InsertInvitation>): Promise<Invitation>;
  deleteInvitation(id: string): Promise<void>;

  // Activity Logs (Admin)
  getActivityLogs(limit?: number): Promise<ActivityLog[]>;
  getActivityLogsByCompany(companyId: string, limit?: number): Promise<ActivityLog[]>;
  getActivityLogsByUser(userId: string, limit?: number): Promise<ActivityLog[]>;
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;

  // Client Notes (Admin internal notes)
  getClientNotes(companyId: string): Promise<ClientNote[]>;
  createClientNote(note: InsertClientNote): Promise<ClientNote>;
  updateClientNote(id: string, data: Partial<InsertClientNote>): Promise<ClientNote>;
  deleteClientNote(id: string): Promise<void>;

  // Admin User Management
  updateUser(id: string, data: { name?: string; email?: string; isAdmin?: boolean }): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Admin Company Management
  deleteCompany(id: string): Promise<void>;

  // Client Engagements
  getEngagements(): Promise<Engagement[]>;
  getEngagementsByCompany(companyId: string): Promise<Engagement[]>;
  getEngagement(id: string): Promise<Engagement | undefined>;
  createEngagement(engagement: InsertEngagement): Promise<Engagement>;
  updateEngagement(id: string, data: Partial<InsertEngagement>): Promise<Engagement>;
  deleteEngagement(id: string): Promise<void>;

  // Service Invoices (NR billing to clients)
  getServiceInvoices(companyId?: string): Promise<ServiceInvoice[]>;
  getServiceInvoice(id: string): Promise<ServiceInvoice | undefined>;
  createServiceInvoice(invoice: InsertServiceInvoice): Promise<ServiceInvoice>;
  updateServiceInvoice(id: string, data: Partial<InsertServiceInvoice>): Promise<ServiceInvoice>;
  deleteServiceInvoice(id: string): Promise<void>;

  // Service Invoice Lines
  getServiceInvoiceLines(serviceInvoiceId: string): Promise<ServiceInvoiceLine[]>;
  createServiceInvoiceLine(line: InsertServiceInvoiceLine): Promise<ServiceInvoiceLine>;
  deleteServiceInvoiceLines(serviceInvoiceId: string): Promise<void>;

  // FTA Emails
  getFtaEmails(companyId: string): Promise<FtaEmail[]>;
  createFtaEmail(email: InsertFtaEmail): Promise<FtaEmail>;
  updateFtaEmail(id: string, data: Partial<InsertFtaEmail>): Promise<FtaEmail>;

  // Customer Subscriptions
  getSubscription(companyId: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription>;

  // User type management
  updateUserType(id: string, userType: string): Promise<User>;
  getUsersByType(userType: string): Promise<User[]>;
  getClientCompanies(): Promise<Company[]>;
  getCustomerCompanies(): Promise<Company[]>;

  // Backups
  getBackupsByCompanyId(companyId: string): Promise<Backup[]>;
  getBackup(id: string): Promise<Backup | undefined>;
  createBackup(backup: InsertBackup): Promise<Backup>;
  updateBackup(id: string, data: Partial<InsertBackup>): Promise<Backup>;
  deleteBackup(id: string): Promise<void>;
  
  // AI Conversations
  createAiConversation(conversation: InsertAiConversation): Promise<AiConversation>;
  getAiConversationsByUserId(userId: string, limit?: number): Promise<AiConversation[]>;
  getAiConversationsByCompanyId(companyId: string, limit?: number): Promise<AiConversation[]>;
  getAiConversation(id: string): Promise<AiConversation | undefined>;
  deleteAiConversation(id: string): Promise<void>;

  // Recurring Invoices
  getRecurringInvoicesByCompanyId(companyId: string): Promise<RecurringInvoice[]>;
  getRecurringInvoice(id: string): Promise<RecurringInvoice | undefined>;
  getDueRecurringInvoices(): Promise<RecurringInvoice[]>;
  createRecurringInvoice(data: InsertRecurringInvoice): Promise<RecurringInvoice>;
  updateRecurringInvoice(id: string, data: Partial<RecurringInvoice>): Promise<RecurringInvoice>;
  deleteRecurringInvoice(id: string): Promise<void>;

  // Products / Inventory
  getProductsByCompanyId(companyId: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(data: InsertProduct): Promise<Product>;
  updateProduct(id: string, data: Partial<Product>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  // Inventory Movements
  getInventoryMovementsByProductId(productId: string): Promise<InventoryMovement[]>;
  getInventoryMovementsByCompanyId(companyId: string): Promise<InventoryMovement[]>;
  createInventoryMovement(data: InsertInventoryMovement): Promise<InventoryMovement>;

  // Quotes
  getQuote(id: string): Promise<Quote | undefined>;
  getQuotesByCompanyId(companyId: string): Promise<Quote[]>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuote(id: string, data: Partial<InsertQuote>): Promise<Quote>;
  deleteQuote(id: string): Promise<void>;

  // Quote Lines
  createQuoteLine(line: InsertQuoteLine): Promise<QuoteLine>;
  getQuoteLinesByQuoteId(quoteId: string): Promise<QuoteLine[]>;
  deleteQuoteLinesByQuoteId(quoteId: string): Promise<void>;

  // Credit Notes
  getCreditNote(id: string): Promise<CreditNote | undefined>;
  getCreditNotesByCompanyId(companyId: string): Promise<CreditNote[]>;
  createCreditNote(note: InsertCreditNote): Promise<CreditNote>;
  updateCreditNote(id: string, data: Partial<InsertCreditNote>): Promise<CreditNote>;
  deleteCreditNote(id: string): Promise<void>;

  // Credit Note Lines
  createCreditNoteLine(line: InsertCreditNoteLine): Promise<CreditNoteLine>;
  getCreditNoteLinesByCreditNoteId(creditNoteId: string): Promise<CreditNoteLine[]>;
  deleteCreditNoteLinesByCreditNoteId(creditNoteId: string): Promise<void>;

  // Purchase Orders
  getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined>;
  getPurchaseOrdersByCompanyId(companyId: string): Promise<PurchaseOrder[]>;
  createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: string, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder>;
  deletePurchaseOrder(id: string): Promise<void>;

  // Purchase Order Lines
  createPurchaseOrderLine(line: InsertPurchaseOrderLine): Promise<PurchaseOrderLine>;
  getPurchaseOrderLinesByPurchaseOrderId(poId: string): Promise<PurchaseOrderLine[]>;
  deletePurchaseOrderLinesByPurchaseOrderId(poId: string): Promise<void>;

  // Invoice Templates
  getInvoiceTemplate(id: string): Promise<InvoiceTemplate | undefined>;
  getInvoiceTemplatesByCompanyId(companyId: string): Promise<InvoiceTemplate[]>;
  createInvoiceTemplate(template: InsertInvoiceTemplate): Promise<InvoiceTemplate>;
  updateInvoiceTemplate(id: string, data: Partial<InsertInvoiceTemplate>): Promise<InvoiceTemplate>;
  deleteInvoiceTemplate(id: string): Promise<void>;
  getDefaultInvoiceTemplate(companyId: string): Promise<InvoiceTemplate | undefined>;

  // Bank Connections
  getBankConnection(id: string): Promise<BankConnection | undefined>;
  getBankConnectionsByCompanyId(companyId: string): Promise<BankConnection[]>;
  createBankConnection(connection: InsertBankConnection): Promise<BankConnection>;
  updateBankConnection(id: string, data: Partial<InsertBankConnection>): Promise<BankConnection>;
  deleteBankConnection(id: string): Promise<void>;

  // Stripe Events
  getStripeEvent(stripeEventId: string): Promise<StripeEvent | undefined>;
  createStripeEvent(event: InsertStripeEvent): Promise<StripeEvent>;

  // Usage Tracking
  incrementInvoiceCount(companyId: string): Promise<void>;
  incrementReceiptCount(companyId: string): Promise<void>;
  decrementAiCredits(companyId: string, amount?: number): Promise<void>;
  resetMonthlyUsage(companyId: string): Promise<void>;
  getCompanyCountByUserId(userId: string): Promise<number>;
  getUserCountByCompanyId(companyId: string): Promise<number>;

  // Push Subscriptions
  getPushSubscriptionsByUserId(userId: string): Promise<PushSubscription[]>;
  createPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscription(id: string): Promise<void>;
  deactivatePushSubscription(endpoint: string): Promise<void>;

  // Notification Preferences
  getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined>;
  upsertNotificationPreferences(userId: string, prefs: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser & { passwordHash?: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        passwordHash: (insertUser as any).passwordHash || '',
      })
      .returning();
    return user;
  }

  // JWT revocation
  async revokeJwt(jti: string, expiresAt: Date, userId?: string, reason?: string): Promise<void> {
    // INSERT ... ON CONFLICT DO NOTHING — logging out twice or calling
    // revoke on a jti that is already denylisted is a no-op rather than
    // an error.
    await db
      .insert(jwtRevocations)
      .values({ jti, userId: userId ?? null, reason: reason ?? 'logout', expiresAt })
      .onConflictDoNothing({ target: jwtRevocations.jti });
  }

  async isJwtRevoked(jti: string): Promise<boolean> {
    const [row] = await db
      .select({ jti: jwtRevocations.jti })
      .from(jwtRevocations)
      .where(eq(jwtRevocations.jti, jti))
      .limit(1);
    return Boolean(row);
  }

  async pruneExpiredJwtRevocations(): Promise<number> {
    // Called by the scheduler. Rows whose original token expiry has
    // passed no longer need to be in the denylist (the signature check
    // will reject them on its own).
    const result = await db
      .delete(jwtRevocations)
      .where(lt(jwtRevocations.expiresAt, new Date()))
      .returning({ id: jwtRevocations.id });
    return result.length;
  }

  // Companies
  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company || undefined;
  }

  async getCompanyByName(name: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.name, name));
    return company || undefined;
  }

  async getCompaniesByUserId(userId: string): Promise<Company[]> {
    const results = await db
      .select()
      .from(companies)
      .innerJoin(companyUsers, eq(companies.id, companyUsers.companyId))
      .where(eq(companyUsers.userId, userId));
    
    return results.map((r: { companies: Company }) => r.companies);
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const [company] = await db
      .insert(companies)
      .values(insertCompany)
      .returning();
    return company;
  }

  async updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company> {
    const [company] = await db
      .update(companies)
      .set(data)
      .where(eq(companies.id, id))
      .returning();
    return company;
  }

  // Company Users
  async createCompanyUser(insertCompanyUser: InsertCompanyUser): Promise<CompanyUser> {
    const [companyUser] = await db
      .insert(companyUsers)
      .values(insertCompanyUser)
      .returning();
    return companyUser;
  }

  async getUserRole(companyId: string, userId: string): Promise<CompanyUser | undefined> {
    const [companyUser] = await db
      .select()
      .from(companyUsers)
      .where(
        and(
          eq(companyUsers.companyId, companyId),
          eq(companyUsers.userId, userId)
        )
      );
    return companyUser || undefined;
  }

  async hasCompanyAccess(userId: string, companyId: string): Promise<boolean> {
    const result = await this.getUserRole(companyId, userId);
    return !!result;
  }

  async getCompanyUsersByCompanyId(companyId: string): Promise<CompanyUser[]> {
    return await db.select().from(companyUsers).where(eq(companyUsers.companyId, companyId));
  }

  // Accounts
  async getAccount(id: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account || undefined;
  }

  async getAccountsByCompanyId(companyId: string): Promise<Account[]> {
    return await db.select().from(accounts).where(eq(accounts.companyId, companyId));
  }

  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    const [account] = await db
      .insert(accounts)
      .values(insertAccount)
      .returning();
    return account;
  }

  async updateAccount(id: string, data: Partial<InsertAccount>): Promise<Account> {
    const [account] = await db
      .update(accounts)
      .set(data)
      .where(eq(accounts.id, id))
      .returning();
    if (!account) {
      throw new Error('Account not found');
    }
    return account;
  }

  async deleteAccount(id: string): Promise<void> {
    await db.delete(accounts).where(eq(accounts.id, id));
  }

  async archiveAccount(id: string): Promise<Account> {
    const [account] = await db
      .update(accounts)
      .set({ isArchived: true, isActive: false, updatedAt: new Date() })
      .where(and(eq(accounts.id, id), eq(accounts.isSystemAccount, false)))
      .returning();
    if (!account) {
      throw new Error('Account not found or is a system account');
    }
    return account;
  }

  async getAccountByCode(companyId: string, code: string): Promise<Account | undefined> {
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.companyId, companyId), eq(accounts.code, code)));
    return account || undefined;
  }

  async getVatAccounts(companyId: string): Promise<Account[]> {
    return await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.companyId, companyId), eq(accounts.isVatAccount, true)));
  }

  async createBulkAccounts(accountsData: InsertAccount[]): Promise<Account[]> {
    if (accountsData.length === 0) return [];
    
    const expectedCount = accountsData.length;
    const createdAccounts = await db.transaction(async (tx: typeof db) => {
      const inserted = await tx
        .insert(accounts)
        .values(accountsData)
        .onConflictDoNothing()
        .returning();
      
      if (inserted.length < expectedCount) {
        throw new Error(`PARTIAL_INSERT: Only ${inserted.length}/${expectedCount} accounts were created. Some accounts already exist.`);
      }
      
      return inserted;
    });
    
    return createdAccounts;
  }

  async companyHasAccounts(companyId: string): Promise<boolean> {
    const existingAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.companyId, companyId))
      .limit(1);
    return existingAccounts.length > 0;
  }

  async accountHasTransactions(accountId: string): Promise<boolean> {
    const lines = await db
      .select()
      .from(journalLines)
      .where(eq(journalLines.accountId, accountId))
      .limit(1);
    return lines.length > 0;
  }

  async getAccountsWithBalances(companyId: string, dateRange?: { start: Date; end: Date }) {
    const accountsList = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
    
    type BalanceLine = { debit: number; credit: number; date: Date; status: string };
    const results = await Promise.all(accountsList.map(async (account: Account) => {
      let lines: BalanceLine[] = await db
        .select({
          debit: journalLines.debit,
          credit: journalLines.credit,
          date: journalEntries.date,
          status: journalEntries.status
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
        .where(eq(journalLines.accountId, account.id));

      if (dateRange) {
        lines = lines.filter((line: BalanceLine) => {
          const lineDate = new Date(line.date);
          return lineDate >= dateRange.start && lineDate <= dateRange.end;
        });
      }

      const postedLines = lines.filter((l: BalanceLine) => l.status === 'posted');

      const debitTotal = postedLines.reduce((sum: number, l: BalanceLine) => sum + (l.debit || 0), 0);
      const creditTotal = postedLines.reduce((sum: number, l: BalanceLine) => sum + (l.credit || 0), 0);
      
      let balance = 0;
      if (['asset', 'expense'].includes(account.type)) {
        balance = debitTotal - creditTotal;
      } else {
        balance = creditTotal - debitTotal;
      }
      
      return {
        account,
        balance,
        debitTotal,
        creditTotal
      };
    }));
    
    return results;
  }

  async getAccountLedger(accountId: string, options?: { 
    dateStart?: Date; 
    dateEnd?: Date; 
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const account = await this.getAccount(accountId);
    if (!account) {
      throw new Error('Account not found');
    }
    
    type LedgerLine = { lineId: string; debit: number; credit: number; lineDescription: string | null; entryId: string; entryNumber: string; date: Date; memo: string | null; source: string; status: string };
    const allLines: LedgerLine[] = await db
      .select({
        lineId: journalLines.id,
        debit: journalLines.debit,
        credit: journalLines.credit,
        lineDescription: journalLines.description,
        entryId: journalEntries.id,
        entryNumber: journalEntries.entryNumber,
        date: journalEntries.date,
        memo: journalEntries.memo,
        source: journalEntries.source,
        status: journalEntries.status
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(eq(journalLines.accountId, accountId));

    const postedLines = allLines.filter((l: LedgerLine) => l.status === 'posted');
    postedLines.sort((a: LedgerLine, b: LedgerLine) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let openingBalance = 0;
    if (options?.dateStart) {
      const priorLines = postedLines.filter((l: LedgerLine) => new Date(l.date) < options.dateStart!);
      const priorDebit = priorLines.reduce((sum: number, l: LedgerLine) => sum + (l.debit || 0), 0);
      const priorCredit = priorLines.reduce((sum: number, l: LedgerLine) => sum + (l.credit || 0), 0);

      if (['asset', 'expense'].includes(account.type)) {
        openingBalance = priorDebit - priorCredit;
      } else {
        openingBalance = priorCredit - priorDebit;
      }
    }

    let filteredLines = postedLines;
    if (options?.dateStart) {
      filteredLines = filteredLines.filter((l: LedgerLine) => new Date(l.date) >= options.dateStart!);
    }
    if (options?.dateEnd) {
      filteredLines = filteredLines.filter((l: LedgerLine) => new Date(l.date) <= options.dateEnd!);
    }

    if (options?.search) {
      const searchLower = options.search.toLowerCase();
      filteredLines = filteredLines.filter((l: LedgerLine) =>
        l.entryNumber?.toLowerCase().includes(searchLower) ||
        l.memo?.toLowerCase().includes(searchLower) ||
        l.lineDescription?.toLowerCase().includes(searchLower)
      );
    }

    let runningBalance = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const allEntries = filteredLines.map((line: LedgerLine) => {
      const debit = line.debit || 0;
      const credit = line.credit || 0;
      
      totalDebit += debit;
      totalCredit += credit;
      
      if (['asset', 'expense'].includes(account.type)) {
        runningBalance += debit - credit;
      } else {
        runningBalance += credit - debit;
      }
      
      return {
        id: line.lineId,
        date: line.date,
        entryNumber: line.entryNumber,
        description: line.lineDescription || line.memo || '',
        debit,
        credit,
        runningBalance,
        journalEntryId: line.entryId,
        journalLineId: line.lineId,
        memo: line.memo,
        source: line.source,
        status: line.status
      };
    });
    
    const totalCount = allEntries.length;
    const paginatedEntries = options?.limit 
      ? allEntries.slice(options.offset || 0, (options.offset || 0) + options.limit)
      : allEntries;
    
    const closingBalance = openingBalance + ((['asset', 'expense'].includes(account.type)) 
      ? totalDebit - totalCredit 
      : totalCredit - totalDebit);
    
    return {
      entries: paginatedEntries,
      allEntries,
      account,
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance,
      totalCount
    };
  }

  // Journal Entries
  async getJournalEntry(id: string): Promise<JournalEntry | undefined> {
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    return entry || undefined;
  }

  async getJournalEntriesByCompanyId(companyId: string): Promise<JournalEntry[]> {
    return await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.companyId, companyId))
      .orderBy(desc(journalEntries.date));
  }

  async createJournalEntry(insertEntry: InsertJournalEntry): Promise<JournalEntry> {
    const [entry] = await db
      .insert(journalEntries)
      .values(insertEntry)
      .returning();
    return entry;
  }

  async updateJournalEntry(id: string, data: Partial<InsertJournalEntry>): Promise<JournalEntry> {
    const [entry] = await db
      .update(journalEntries)
      .set(data)
      .where(eq(journalEntries.id, id))
      .returning();
    if (!entry) {
      throw new Error('Journal entry not found');
    }
    return entry;
  }

  async deleteJournalEntry(id: string): Promise<void> {
    // Safeguard: prevent deletion of posted/void entries (accounting integrity)
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (entry && (entry.status === 'posted' || entry.status === 'void')) {
      throw new Error('Cannot delete a posted or voided journal entry. Void it instead.');
    }
    // Delete lines first, then the entry
    await db.delete(journalLines).where(eq(journalLines.entryId, id));
    await db.delete(journalEntries).where(eq(journalEntries.id, id));
  }

  async generateEntryNumber(companyId: string, date: Date, tx?: any): Promise<string> {
    const executor = tx || db;
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `JE-${dateStr}`;

    const [result] = await executor
      .select({ count: sql<number>`count(*)` })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.companyId, companyId),
          sql`${journalEntries.entryNumber} LIKE ${prefix + '%'}`
        )
      );

    const nextNumber = (Number(result?.count) || 0) + 1;
    return `${prefix}-${String(nextNumber).padStart(3, '0')}`;
  }

  async createJournalEntryWithLines(
    companyId: string,
    date: Date,
    entryData: Omit<InsertJournalEntry, 'entryNumber' | 'companyId' | 'date'>,
    lines: Array<Omit<InsertJournalLine, 'entryId'>>,
  ): Promise<{ entry: JournalEntry; lines: JournalLine[] }> {
    return await db.transaction(async (tx: any) => {
      // Generate entry number inside transaction
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      const prefix = `JE-${dateStr}`;
      const [result] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.companyId, companyId),
            sql`${journalEntries.entryNumber} LIKE ${prefix + '%'}`
          )
        );
      const nextNumber = (Number(result?.count) || 0) + 1;
      const entryNumber = `${prefix}-${String(nextNumber).padStart(3, '0')}`;

      // Create journal entry
      const [entry] = await tx
        .insert(journalEntries)
        .values({ ...entryData, companyId, date, entryNumber })
        .returning();

      // Create journal lines
      const createdLines: JournalLine[] = [];
      for (const line of lines) {
        const [created] = await tx
          .insert(journalLines)
          .values({ ...line, entryId: entry.id })
          .returning();
        createdLines.push(created);
      }

      return { entry, lines: createdLines };
    });
  }

  // Journal Lines
  async createJournalLine(insertLine: InsertJournalLine): Promise<JournalLine> {
    const [line] = await db
      .insert(journalLines)
      .values(insertLine)
      .returning();
    return line;
  }

  async getJournalLinesByEntryId(entryId: string): Promise<JournalLine[]> {
    return await db.select().from(journalLines).where(eq(journalLines.entryId, entryId));
  }

  async deleteJournalLinesByEntryId(entryId: string): Promise<void> {
    await db.delete(journalLines).where(eq(journalLines.entryId, entryId));
  }

  // Invoices
  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice || undefined;
  }

  async getInvoicesByCompanyId(companyId: string): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .where(eq(invoices.companyId, companyId))
      .orderBy(desc(invoices.date));
  }

  async createInvoice(insertInvoice: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db
      .insert(invoices)
      .values(insertInvoice)
      .returning();
    return invoice;
  }

  async updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice> {
    const [invoice] = await db
      .update(invoices)
      .set(data)
      .where(eq(invoices.id, id))
      .returning();
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    return invoice;
  }

  async updateInvoiceStatus(id: string, status: string): Promise<Invoice> {
    const [invoice] = await db
      .update(invoices)
      .set({ status })
      .where(eq(invoices.id, id))
      .returning();
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    return invoice;
  }

  async deleteInvoice(id: string): Promise<void> {
    // Safeguard: prevent deletion of paid invoices (financial record integrity)
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (invoice && invoice.status === 'paid') {
      throw new Error('Cannot delete a paid invoice. Void or credit it instead.');
    }
    // Delete lines first, then the invoice
    await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id));
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  async getInvoiceByShareToken(token: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.shareToken, token));
    return invoice || undefined;
  }

  async setInvoiceShareToken(id: string, token: string, expiresAt: Date): Promise<void> {
    await db
      .update(invoices)
      .set({ shareToken: token, shareTokenExpiresAt: expiresAt })
      .where(eq(invoices.id, id));
  }

  // Invoice Lines
  async createInvoiceLine(insertLine: InsertInvoiceLine): Promise<InvoiceLine> {
    const [line] = await db
      .insert(invoiceLines)
      .values(insertLine)
      .returning();
    return line;
  }

  async getInvoiceLinesByInvoiceId(invoiceId: string): Promise<InvoiceLine[]> {
    return await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  }

  async deleteInvoiceLinesByInvoiceId(invoiceId: string): Promise<void> {
    await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  }

  // Receipts
  async getReceipt(id: string): Promise<Receipt | undefined> {
    const [receipt] = await db.select().from(receipts).where(eq(receipts.id, id));
    return receipt || undefined;
  }

  async createReceipt(insertReceipt: InsertReceipt): Promise<Receipt> {
    const [receipt] = await db
      .insert(receipts)
      .values(insertReceipt)
      .returning();
    return receipt;
  }

  async getReceiptsByCompanyId(companyId: string): Promise<Receipt[]> {
    return await db
      .select()
      .from(receipts)
      .where(eq(receipts.companyId, companyId))
      .orderBy(desc(receipts.createdAt));
  }

  async updateReceipt(id: string, data: Partial<InsertReceipt>): Promise<Receipt> {
    const [receipt] = await db
      .update(receipts)
      .set(data)
      .where(eq(receipts.id, id))
      .returning();
    if (!receipt) {
      throw new Error('Receipt not found');
    }
    return receipt;
  }

  /**
   * Post a receipt to the journal within a single database transaction.
   * Creates journal entry + lines + updates receipt atomically.
   * If any step fails, everything rolls back.
   */
  async postReceiptTransaction(
    receipt: Receipt,
    accounts: { accountId: string; paymentAccountId: string },
    resolvedAccounts: { expenseAccount: Account; paymentAccount: Account },
    entryDate: Date,
    userId: string,
    totalAmount: number,
  ): Promise<Receipt> {
    return await db.transaction(async (tx: any) => {
      // Generate entry number inside transaction
      const dateStr = entryDate.toISOString().slice(0, 10).replace(/-/g, '');
      const prefix = `JE-${dateStr}`;
      const [countResult] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.companyId, receipt.companyId),
            sql`${journalEntries.entryNumber} LIKE ${prefix + '%'}`
          )
        );
      const nextNumber = (Number(countResult?.count) || 0) + 1;
      const entryNumber = `${prefix}-${String(nextNumber).padStart(3, '0')}`;

      // Create journal entry
      const [entry] = await tx
        .insert(journalEntries)
        .values({
          companyId: receipt.companyId,
          date: entryDate,
          memo: `Receipt: ${receipt.merchant || 'Expense'} - ${receipt.category || 'General'}`,
          entryNumber,
          status: 'posted',
          source: 'receipt',
          sourceId: receipt.id,
          createdBy: userId,
          postedBy: userId,
        })
        .returning();

      // Debit: Expense Account
      await tx.insert(journalLines).values({
        entryId: entry.id,
        accountId: resolvedAccounts.expenseAccount.id,
        debit: totalAmount,
        credit: 0,
        description: `${receipt.merchant || 'Expense'} - ${receipt.category || 'General'}`,
      });

      // Credit: Payment Account
      await tx.insert(journalLines).values({
        entryId: entry.id,
        accountId: resolvedAccounts.paymentAccount.id,
        debit: 0,
        credit: totalAmount,
        description: `Payment for ${receipt.merchant || 'expense'}`,
      });

      // Update receipt
      const [updated] = await tx
        .update(receipts)
        .set({
          accountId: accounts.accountId,
          paymentAccountId: accounts.paymentAccountId,
          posted: true,
          journalEntryId: entry.id,
        })
        .where(eq(receipts.id, receipt.id))
        .returning();

      return updated;
    });
  }

  async deleteReceipt(id: string): Promise<void> {
    await db.delete(receipts).where(eq(receipts.id, id));
  }

  // Customer Contacts
  async getCustomerContact(id: string): Promise<CustomerContact | undefined> {
    const [contact] = await db.select().from(customerContacts).where(eq(customerContacts.id, id));
    return contact;
  }

  async getCustomerContactsByCompanyId(companyId: string): Promise<CustomerContact[]> {
    return await db.select().from(customerContacts)
      .where(and(eq(customerContacts.companyId, companyId), eq(customerContacts.isActive, true)))
      .orderBy(desc(customerContacts.createdAt));
  }

  async getCustomerContactByEmail(companyId: string, email: string): Promise<CustomerContact | undefined> {
    const [contact] = await db.select().from(customerContacts)
      .where(and(eq(customerContacts.companyId, companyId), eq(customerContacts.email, email)));
    return contact;
  }

  async getCustomerContactByTrn(companyId: string, trn: string): Promise<CustomerContact | undefined> {
    const [contact] = await db.select().from(customerContacts)
      .where(and(eq(customerContacts.companyId, companyId), eq(customerContacts.trnNumber, trn)));
    return contact;
  }

  async createCustomerContact(insertContact: InsertCustomerContact): Promise<CustomerContact> {
    const [contact] = await db.insert(customerContacts).values(insertContact).returning();
    return contact;
  }

  async createBulkCustomerContacts(contactsData: InsertCustomerContact[]): Promise<CustomerContact[]> {
    if (contactsData.length === 0) return [];
    const created = await db.insert(customerContacts).values(contactsData).returning();
    return created;
  }

  async updateCustomerContact(id: string, data: Partial<InsertCustomerContact>): Promise<CustomerContact> {
    const [contact] = await db.update(customerContacts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customerContacts.id, id))
      .returning();
    if (!contact) throw new Error('Customer contact not found');
    return contact;
  }

  async deleteCustomerContact(id: string): Promise<void> {
    await db.delete(customerContacts).where(eq(customerContacts.id, id));
  }

  async getCustomerContactByPortalToken(token: string): Promise<CustomerContact | undefined> {
    const [contact] = await db.select().from(customerContacts)
      .where(eq(customerContacts.portalAccessToken, token));
    return contact || undefined;
  }

  async setPortalAccessToken(contactId: string, token: string, expiresAt: Date): Promise<CustomerContact> {
    const [contact] = await db.update(customerContacts)
      .set({ portalAccessToken: token, portalAccessExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(customerContacts.id, contactId))
      .returning();
    if (!contact) throw new Error('Customer contact not found');
    return contact;
  }

  // Waitlist
  async createWaitlistEntry(insertEntry: InsertWaitlist): Promise<Waitlist> {
    const [entry] = await db
      .insert(waitlist)
      .values(insertEntry)
      .returning();
    return entry;
  }

  async getWaitlistByEmail(email: string): Promise<Waitlist | undefined> {
    const [entry] = await db.select().from(waitlist).where(eq(waitlist.email, email));
    return entry || undefined;
  }

  // Integration Syncs
  async createIntegrationSync(insertSync: InsertIntegrationSync): Promise<IntegrationSync> {
    const [sync] = await db
      .insert(integrationSyncs)
      .values(insertSync)
      .returning();
    return sync;
  }

  async getIntegrationSyncsByCompanyId(companyId: string): Promise<IntegrationSync[]> {
    return await db
      .select()
      .from(integrationSyncs)
      .where(eq(integrationSyncs.companyId, companyId))
      .orderBy(desc(integrationSyncs.syncedAt));
  }

  async getIntegrationSyncsByType(companyId: string, integrationType: string): Promise<IntegrationSync[]> {
    return await db
      .select()
      .from(integrationSyncs)
      .where(and(
        eq(integrationSyncs.companyId, companyId),
        eq(integrationSyncs.integrationType, integrationType)
      ))
      .orderBy(desc(integrationSyncs.syncedAt));
  }

  // WhatsApp Configuration
  async getWhatsappConfig(companyId: string): Promise<WhatsappConfig | undefined> {
    const [config] = await db
      .select()
      .from(whatsappConfigs)
      .where(eq(whatsappConfigs.companyId, companyId));
    return config || undefined;
  }

  async getWhatsappConfigByPhoneNumberId(phoneNumberId: string): Promise<WhatsappConfig | undefined> {
    const [config] = await db
      .select()
      .from(whatsappConfigs)
      .where(eq(whatsappConfigs.phoneNumberId, phoneNumberId));
    return config || undefined;
  }

  async createWhatsappConfig(insertConfig: InsertWhatsappConfig): Promise<WhatsappConfig> {
    const [config] = await db
      .insert(whatsappConfigs)
      .values(insertConfig)
      .returning();
    return config;
  }

  async updateWhatsappConfig(id: string, data: Partial<InsertWhatsappConfig>): Promise<WhatsappConfig> {
    const [config] = await db
      .update(whatsappConfigs)
      .set(data)
      .where(eq(whatsappConfigs.id, id))
      .returning();
    if (!config) {
      throw new Error('WhatsApp configuration not found');
    }
    return config;
  }

  // WhatsApp Messages
  async createWhatsappMessage(insertMessage: InsertWhatsappMessage): Promise<WhatsappMessage> {
    const [message] = await db
      .insert(whatsappMessages)
      .values(insertMessage)
      .returning();
    return message;
  }

  async getWhatsappMessagesByCompanyId(companyId: string): Promise<WhatsappMessage[]> {
    return await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.companyId, companyId))
      .orderBy(desc(whatsappMessages.createdAt));
  }

  async getWhatsappMessage(id: string): Promise<WhatsappMessage | undefined> {
    const [message] = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.id, id));
    return message || undefined;
  }

  async updateWhatsappMessage(id: string, data: Partial<InsertWhatsappMessage>): Promise<WhatsappMessage> {
    const [message] = await db
      .update(whatsappMessages)
      .set(data)
      .where(eq(whatsappMessages.id, id))
      .returning();
    if (!message) {
      throw new Error('WhatsApp message not found');
    }
    return message;
  }

  // AI Anomaly Alerts
  async createAnomalyAlert(insertAlert: InsertAnomalyAlert): Promise<AnomalyAlert> {
    const [alert] = await db
      .insert(anomalyAlerts)
      .values(insertAlert)
      .returning();
    return alert;
  }

  async getAnomalyAlertById(id: string): Promise<AnomalyAlert | undefined> {
    const [alert] = await db
      .select()
      .from(anomalyAlerts)
      .where(eq(anomalyAlerts.id, id));
    return alert;
  }

  async getAnomalyAlertsByCompanyId(companyId: string): Promise<AnomalyAlert[]> {
    return await db
      .select()
      .from(anomalyAlerts)
      .where(eq(anomalyAlerts.companyId, companyId))
      .orderBy(desc(anomalyAlerts.createdAt));
  }

  async getUnresolvedAnomalyAlerts(companyId: string): Promise<AnomalyAlert[]> {
    return await db
      .select()
      .from(anomalyAlerts)
      .where(and(
        eq(anomalyAlerts.companyId, companyId),
        eq(anomalyAlerts.isResolved, false)
      ))
      .orderBy(desc(anomalyAlerts.createdAt));
  }

  async updateAnomalyAlert(id: string, data: Partial<InsertAnomalyAlert>): Promise<AnomalyAlert> {
    const [alert] = await db
      .update(anomalyAlerts)
      .set(data)
      .where(eq(anomalyAlerts.id, id))
      .returning();
    if (!alert) {
      throw new Error('Anomaly alert not found');
    }
    return alert;
  }

  async resolveAnomalyAlert(id: string, userId: string, note?: string): Promise<AnomalyAlert> {
    const [alert] = await db
      .update(anomalyAlerts)
      .set({
        isResolved: true,
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolutionNote: note,
      })
      .where(eq(anomalyAlerts.id, id))
      .returning();
    if (!alert) {
      throw new Error('Anomaly alert not found');
    }
    return alert;
  }

  // Bank Transactions
  async createBankTransaction(insertTransaction: InsertBankTransaction): Promise<BankTransaction> {
    const [transaction] = await db
      .insert(bankTransactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  async getBankTransactionById(id: string): Promise<BankTransaction | undefined> {
    const [transaction] = await db
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.id, id));
    return transaction;
  }

  async getBankTransactionsByCompanyId(companyId: string): Promise<BankTransaction[]> {
    return await db
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.companyId, companyId))
      .orderBy(desc(bankTransactions.transactionDate));
  }

  async getUnreconciledBankTransactions(companyId: string): Promise<BankTransaction[]> {
    return await db
      .select()
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.isReconciled, false)
      ))
      .orderBy(desc(bankTransactions.transactionDate));
  }

  async updateBankTransaction(id: string, data: Partial<InsertBankTransaction>): Promise<BankTransaction> {
    const [transaction] = await db
      .update(bankTransactions)
      .set(data)
      .where(eq(bankTransactions.id, id))
      .returning();
    if (!transaction) {
      throw new Error('Bank transaction not found');
    }
    return transaction;
  }

  async reconcileBankTransaction(id: string, matchedId: string, matchType: 'journal' | 'receipt' | 'invoice'): Promise<BankTransaction> {
    const updateData: any = {
      isReconciled: true,
    };
    if (matchType === 'journal') {
      updateData.matchedJournalEntryId = matchedId;
    } else if (matchType === 'receipt') {
      updateData.matchedReceiptId = matchedId;
    } else {
      updateData.matchedInvoiceId = matchedId;
    }
    
    const [transaction] = await db
      .update(bankTransactions)
      .set(updateData)
      .where(eq(bankTransactions.id, id))
      .returning();
    if (!transaction) {
      throw new Error('Bank transaction not found');
    }
    return transaction;
  }

  // Cash Flow Forecasts
  async createCashFlowForecast(insertForecast: InsertCashFlowForecast): Promise<CashFlowForecast> {
    const [forecast] = await db
      .insert(cashFlowForecasts)
      .values(insertForecast)
      .returning();
    return forecast;
  }

  async getCashFlowForecastsByCompanyId(companyId: string): Promise<CashFlowForecast[]> {
    return await db
      .select()
      .from(cashFlowForecasts)
      .where(eq(cashFlowForecasts.companyId, companyId))
      .orderBy(cashFlowForecasts.forecastDate);
  }

  async deleteCashFlowForecastsByCompanyId(companyId: string): Promise<void> {
    await db.delete(cashFlowForecasts).where(eq(cashFlowForecasts.companyId, companyId));
  }

  // Transaction Classifications
  async createTransactionClassification(insertClassification: InsertTransactionClassification): Promise<TransactionClassification> {
    const [classification] = await db
      .insert(transactionClassifications)
      .values(insertClassification)
      .returning();
    return classification;
  }

  async getTransactionClassification(id: string): Promise<TransactionClassification | undefined> {
    const [classification] = await db
      .select()
      .from(transactionClassifications)
      .where(eq(transactionClassifications.id, id));
    return classification;
  }

  async getTransactionClassificationsByCompanyId(companyId: string): Promise<TransactionClassification[]> {
    return await db
      .select()
      .from(transactionClassifications)
      .where(eq(transactionClassifications.companyId, companyId))
      .orderBy(desc(transactionClassifications.createdAt));
  }

  async updateTransactionClassification(id: string, data: Partial<InsertTransactionClassification>): Promise<TransactionClassification> {
    const [classification] = await db
      .update(transactionClassifications)
      .set(data)
      .where(eq(transactionClassifications.id, id))
      .returning();
    if (!classification) {
      throw new Error('Transaction classification not found');
    }
    return classification;
  }

  // Journal Lines (for analytics)
  async getJournalLinesByCompanyId(companyId: string): Promise<JournalLine[]> {
    return await db
      .select({
        id: journalLines.id,
        entryId: journalLines.entryId,
        accountId: journalLines.accountId,
        debit: journalLines.debit,
        credit: journalLines.credit,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(eq(journalEntries.companyId, companyId));
  }

  // Budgets
  async getBudgetsByCompanyId(companyId: string, year: number, month: number): Promise<Budget[]> {
    return await db
      .select()
      .from(budgets)
      .where(and(
        eq(budgets.companyId, companyId),
        eq(budgets.year, year),
        eq(budgets.month, month)
      ));
  }

  async createBudget(insertBudget: InsertBudget): Promise<Budget> {
    const [budget] = await db
      .insert(budgets)
      .values(insertBudget)
      .returning();
    return budget;
  }

  async updateBudget(id: string, data: Partial<InsertBudget>): Promise<Budget> {
    const [budget] = await db
      .update(budgets)
      .set(data)
      .where(eq(budgets.id, id))
      .returning();
    if (!budget) {
      throw new Error('Budget not found');
    }
    return budget;
  }

  // E-Commerce Integrations
  async getEcommerceIntegrations(companyId: string): Promise<EcommerceIntegration[]> {
    return await db
      .select()
      .from(ecommerceIntegrations)
      .where(eq(ecommerceIntegrations.companyId, companyId))
      .orderBy(desc(ecommerceIntegrations.createdAt));
  }

  async createEcommerceIntegration(insertIntegration: InsertEcommerceIntegration): Promise<EcommerceIntegration> {
    const [integration] = await db
      .insert(ecommerceIntegrations)
      .values(insertIntegration)
      .returning();
    return integration;
  }

  async updateEcommerceIntegration(id: string, data: Partial<InsertEcommerceIntegration>): Promise<EcommerceIntegration> {
    const [integration] = await db
      .update(ecommerceIntegrations)
      .set(data)
      .where(eq(ecommerceIntegrations.id, id))
      .returning();
    if (!integration) {
      throw new Error('E-commerce integration not found');
    }
    return integration;
  }

  async deleteEcommerceIntegration(id: string): Promise<void> {
    await db.delete(ecommerceIntegrations).where(eq(ecommerceIntegrations.id, id));
  }

  // E-Commerce Transactions
  async getEcommerceTransactions(companyId: string): Promise<EcommerceTransaction[]> {
    const results = await db
      .select({
        ecommerceTransactions: ecommerceTransactions,
      })
      .from(ecommerceTransactions)
      .innerJoin(ecommerceIntegrations, eq(ecommerceTransactions.integrationId, ecommerceIntegrations.id))
      .where(eq(ecommerceIntegrations.companyId, companyId));
    
    return results.map((r: { ecommerceTransactions: EcommerceTransaction }) => r.ecommerceTransactions);
  }

  async createEcommerceTransaction(insertTransaction: InsertEcommerceTransaction): Promise<EcommerceTransaction> {
    const [transaction] = await db
      .insert(ecommerceTransactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  async updateEcommerceTransaction(id: string, data: Partial<InsertEcommerceTransaction>): Promise<EcommerceTransaction> {
    const [transaction] = await db
      .update(ecommerceTransactions)
      .set(data)
      .where(eq(ecommerceTransactions.id, id))
      .returning();
    if (!transaction) {
      throw new Error('E-commerce transaction not found');
    }
    return transaction;
  }

  // Financial KPIs
  async getFinancialKpis(companyId: string): Promise<FinancialKpi[]> {
    return await db
      .select()
      .from(financialKpis)
      .where(eq(financialKpis.companyId, companyId))
      .orderBy(desc(financialKpis.calculatedAt));
  }

  async createFinancialKpi(insertKpi: InsertFinancialKpi): Promise<FinancialKpi> {
    const [kpi] = await db
      .insert(financialKpis)
      .values(insertKpi)
      .returning();
    return kpi;
  }

  // Cash Flow Forecasts (alias for consistency)
  async getCashFlowForecasts(companyId: string): Promise<CashFlowForecast[]> {
    return this.getCashFlowForecastsByCompanyId(companyId);
  }

  // Notifications
  async getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id));
    return notification;
  }

  async getNotificationsByUserId(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isDismissed, false)
      ))
      .orderBy(desc(notifications.createdAt));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
        eq(notifications.isDismissed, false)
      ));
    return result.length;
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(insertNotification)
      .returning();
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<Notification> {
    const [notification] = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.userId, userId));
  }

  async dismissNotification(id: string): Promise<Notification> {
    const [notification] = await db
      .update(notifications)
      .set({ isDismissed: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  // Regulatory News
  async getRegulatoryNews(): Promise<RegulatoryNews[]> {
    return await db
      .select()
      .from(regulatoryNews)
      .where(eq(regulatoryNews.isActive, true))
      .orderBy(desc(regulatoryNews.publishedAt));
  }

  async createRegulatoryNews(insertNews: InsertRegulatoryNews): Promise<RegulatoryNews> {
    const [news] = await db
      .insert(regulatoryNews)
      .values(insertNews)
      .returning();
    return news;
  }

  // Reminder Settings
  async getReminderSetting(id: string): Promise<ReminderSetting | undefined> {
    const [setting] = await db
      .select()
      .from(reminderSettings)
      .where(eq(reminderSettings.id, id));
    return setting;
  }

  async getReminderSettingsByCompanyId(companyId: string): Promise<ReminderSetting[]> {
    return await db
      .select()
      .from(reminderSettings)
      .where(eq(reminderSettings.companyId, companyId));
  }

  async createReminderSetting(insertSetting: InsertReminderSetting): Promise<ReminderSetting> {
    const [setting] = await db
      .insert(reminderSettings)
      .values(insertSetting)
      .returning();
    return setting;
  }

  async updateReminderSetting(id: string, data: Partial<InsertReminderSetting>): Promise<ReminderSetting> {
    const [setting] = await db
      .update(reminderSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reminderSettings.id, id))
      .returning();
    return setting;
  }

  // Reminder Logs
  async getReminderLogsByCompanyId(companyId: string): Promise<ReminderLog[]> {
    return await db
      .select()
      .from(reminderLogs)
      .where(eq(reminderLogs.companyId, companyId))
      .orderBy(desc(reminderLogs.createdAt));
  }

  async createReminderLog(insertLog: InsertReminderLog): Promise<ReminderLog> {
    const [log] = await db
      .insert(reminderLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  async updateReminderLog(id: string, data: Partial<InsertReminderLog>): Promise<ReminderLog> {
    const [log] = await db
      .update(reminderLogs)
      .set(data)
      .where(eq(reminderLogs.id, id))
      .returning();
    return log;
  }

  // User Onboarding
  async getUserOnboarding(userId: string): Promise<UserOnboarding | undefined> {
    const [onboarding] = await db
      .select()
      .from(userOnboarding)
      .where(eq(userOnboarding.userId, userId));
    return onboarding;
  }

  async createUserOnboarding(insertOnboarding: InsertUserOnboarding): Promise<UserOnboarding> {
    const [onboarding] = await db
      .insert(userOnboarding)
      .values(insertOnboarding)
      .returning();
    return onboarding;
  }

  async updateUserOnboarding(userId: string, data: Partial<InsertUserOnboarding>): Promise<UserOnboarding> {
    const [onboarding] = await db
      .update(userOnboarding)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userOnboarding.userId, userId))
      .returning();
    return onboarding;
  }

  // Help Tips
  async getHelpTipsByPage(pageContext: string): Promise<HelpTip[]> {
    return await db
      .select()
      .from(helpTips)
      .where(and(
        eq(helpTips.pageContext, pageContext),
        eq(helpTips.isActive, true)
      ))
      .orderBy(helpTips.order);
  }

  async getAllHelpTips(): Promise<HelpTip[]> {
    return await db
      .select()
      .from(helpTips)
      .where(eq(helpTips.isActive, true))
      .orderBy(helpTips.order);
  }

  async createHelpTip(insertTip: InsertHelpTip): Promise<HelpTip> {
    const [tip] = await db
      .insert(helpTips)
      .values(insertTip)
      .returning();
    return tip;
  }

  // Referral Codes
  async getReferralCodeByUserId(userId: string): Promise<ReferralCode | undefined> {
    const [code] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.userId, userId));
    return code;
  }

  async getReferralCodeByCode(code: string): Promise<ReferralCode | undefined> {
    const [referralCode] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.code, code));
    return referralCode;
  }

  async createReferralCode(insertCode: InsertReferralCode): Promise<ReferralCode> {
    const [code] = await db
      .insert(referralCodes)
      .values(insertCode)
      .returning();
    return code;
  }

  async updateReferralCode(id: string, data: Partial<InsertReferralCode>): Promise<ReferralCode> {
    const [code] = await db
      .update(referralCodes)
      .set(data)
      .where(eq(referralCodes.id, id))
      .returning();
    return code;
  }

  // Referrals
  async getReferralsByReferrerId(referrerId: string): Promise<Referral[]> {
    return await db
      .select()
      .from(referrals)
      .where(eq(referrals.referrerId, referrerId))
      .orderBy(desc(referrals.createdAt));
  }

  async createReferral(insertReferral: InsertReferral): Promise<Referral> {
    const [referral] = await db
      .insert(referrals)
      .values(insertReferral)
      .returning();
    return referral;
  }

  async updateReferral(id: string, data: Partial<InsertReferral>): Promise<Referral> {
    const [referral] = await db
      .update(referrals)
      .set(data)
      .where(eq(referrals.id, id))
      .returning();
    return referral;
  }

  // User Feedback
  async createUserFeedback(insertFeedback: InsertUserFeedback): Promise<UserFeedback> {
    const [feedback] = await db
      .insert(userFeedback)
      .values(insertFeedback)
      .returning();
    return feedback;
  }

  async getUserFeedback(userId?: string): Promise<UserFeedback[]> {
    if (userId) {
      return await db
        .select()
        .from(userFeedback)
        .where(eq(userFeedback.userId, userId))
        .orderBy(desc(userFeedback.createdAt));
    }
    return await db
      .select()
      .from(userFeedback)
      .orderBy(desc(userFeedback.createdAt));
  }

  async updateUserFeedback(id: string, data: Partial<InsertUserFeedback>): Promise<UserFeedback> {
    const [feedback] = await db
      .update(userFeedback)
      .set(data)
      .where(eq(userFeedback.id, id))
      .returning();
    return feedback;
  }

  // Analytics Events
  async createAnalyticsEvent(insertEvent: InsertAnalyticsEvent): Promise<AnalyticsEvent> {
    const [event] = await db
      .insert(analyticsEvents)
      .values(insertEvent)
      .returning();
    return event;
  }

  async getAnalyticsEvents(filters?: { userId?: string; eventType?: string; startDate?: Date; endDate?: Date }): Promise<AnalyticsEvent[]> {
    let query = db.select().from(analyticsEvents);
    
    if (filters?.userId) {
      query = query.where(eq(analyticsEvents.userId, filters.userId)) as typeof query;
    }
    if (filters?.eventType) {
      query = query.where(eq(analyticsEvents.eventType, filters.eventType)) as typeof query;
    }
    
    return await query.orderBy(desc(analyticsEvents.createdAt));
  }

  // Feature Usage Metrics
  async getFeatureUsageMetrics(featureName?: string): Promise<FeatureUsageMetric[]> {
    if (featureName) {
      return await db
        .select()
        .from(featureUsageMetrics)
        .where(eq(featureUsageMetrics.featureName, featureName))
        .orderBy(desc(featureUsageMetrics.calculatedAt));
    }
    return await db
      .select()
      .from(featureUsageMetrics)
      .orderBy(desc(featureUsageMetrics.calculatedAt));
  }

  async createFeatureUsageMetric(insertMetric: InsertFeatureUsageMetric): Promise<FeatureUsageMetric> {
    const [metric] = await db
      .insert(featureUsageMetrics)
      .values(insertMetric)
      .returning();
    return metric;
  }

  // Admin Settings
  async getAdminSettings(): Promise<AdminSetting[]> {
    return await db.select().from(adminSettings);
  }

  async getAdminSettingByKey(key: string): Promise<AdminSetting | undefined> {
    const [setting] = await db.select().from(adminSettings).where(eq(adminSettings.key, key));
    return setting || undefined;
  }

  async createAdminSetting(insertSetting: InsertAdminSetting): Promise<AdminSetting> {
    const [setting] = await db
      .insert(adminSettings)
      .values(insertSetting)
      .returning();
    return setting;
  }

  async updateAdminSetting(key: string, value: string): Promise<AdminSetting> {
    const [setting] = await db
      .update(adminSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(adminSettings.key, key))
      .returning();
    return setting;
  }

  // Subscription Plans
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.sortOrder);
  }

  async getSubscriptionPlan(id: string): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id));
    return plan || undefined;
  }

  async createSubscriptionPlan(insertPlan: InsertSubscriptionPlan): Promise<SubscriptionPlan> {
    const [plan] = await db
      .insert(subscriptionPlans)
      .values(insertPlan)
      .returning();
    return plan;
  }

  async updateSubscriptionPlan(id: string, data: Partial<InsertSubscriptionPlan>): Promise<SubscriptionPlan> {
    const [plan] = await db
      .update(subscriptionPlans)
      .set(data)
      .where(eq(subscriptionPlans.id, id))
      .returning();
    return plan;
  }

  async deleteSubscriptionPlan(id: string): Promise<void> {
    await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id));
  }

  // User Subscriptions
  async getUserSubscription(userId: string): Promise<UserSubscription | undefined> {
    const [subscription] = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId));
    return subscription || undefined;
  }

  async createUserSubscription(insertSubscription: InsertUserSubscription): Promise<UserSubscription> {
    const [subscription] = await db
      .insert(userSubscriptions)
      .values(insertSubscription)
      .returning();
    return subscription;
  }

  async updateUserSubscription(id: string, data: Partial<InsertUserSubscription>): Promise<UserSubscription> {
    const [subscription] = await db
      .update(userSubscriptions)
      .set(data)
      .where(eq(userSubscriptions.id, id))
      .returning();
    return subscription;
  }

  // Audit Logs
  async getAuditLogs(limit: number = 100): Promise<AuditLog[]> {
    return await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db
      .insert(auditLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  // Admin Stats
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAllCompanies(): Promise<Company[]> {
    return await db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  // VAT Returns
  async getVatReturnsByCompanyId(companyId: string): Promise<VatReturn[]> {
    return await db
      .select()
      .from(vatReturns)
      .where(eq(vatReturns.companyId, companyId))
      .orderBy(desc(vatReturns.periodEnd));
  }

  async getVatReturn(id: string): Promise<VatReturn | undefined> {
    const [vatReturn] = await db.select().from(vatReturns).where(eq(vatReturns.id, id));
    return vatReturn || undefined;
  }

  async createVatReturn(insertVatReturn: InsertVatReturn): Promise<VatReturn> {
    const [vatReturn] = await db
      .insert(vatReturns)
      .values(insertVatReturn)
      .returning();
    return vatReturn;
  }

  async updateVatReturn(id: string, data: Partial<InsertVatReturn>): Promise<VatReturn> {
    const [vatReturn] = await db
      .update(vatReturns)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(vatReturns.id, id))
      .returning();
    return vatReturn;
  }

  async deleteVatReturn(id: string): Promise<void> {
    await db.delete(vatReturns).where(eq(vatReturns.id, id));
  }

  // Corporate Tax Returns
  async getCorporateTaxReturnsByCompanyId(companyId: string): Promise<CorporateTaxReturn[]> {
    return await db
      .select()
      .from(corporateTaxReturns)
      .where(eq(corporateTaxReturns.companyId, companyId))
      .orderBy(desc(corporateTaxReturns.taxPeriodEnd));
  }

  async getCorporateTaxReturn(id: string): Promise<CorporateTaxReturn | undefined> {
    const [taxReturn] = await db.select().from(corporateTaxReturns).where(eq(corporateTaxReturns.id, id));
    return taxReturn || undefined;
  }

  async createCorporateTaxReturn(data: InsertCorporateTaxReturn): Promise<CorporateTaxReturn> {
    const [taxReturn] = await db
      .insert(corporateTaxReturns)
      .values(data)
      .returning();
    return taxReturn;
  }

  async updateCorporateTaxReturn(id: string, data: Partial<CorporateTaxReturn>): Promise<CorporateTaxReturn> {
    const [taxReturn] = await db
      .update(corporateTaxReturns)
      .set(data)
      .where(eq(corporateTaxReturns.id, id))
      .returning();
    return taxReturn;
  }

  // Team Management
  async updateCompanyUser(id: string, data: Partial<InsertCompanyUser>): Promise<CompanyUser> {
    const [companyUser] = await db
      .update(companyUsers)
      .set(data)
      .where(eq(companyUsers.id, id))
      .returning();
    return companyUser;
  }

  async deleteCompanyUser(id: string): Promise<void> {
    await db.delete(companyUsers).where(eq(companyUsers.id, id));
  }

  async getCompanyUserWithUser(companyId: string): Promise<(CompanyUser & { user: User })[]> {
    const results = await db
      .select()
      .from(companyUsers)
      .innerJoin(users, eq(companyUsers.userId, users.id))
      .where(eq(companyUsers.companyId, companyId));
    
    return results.map((r: { company_users: CompanyUser; users: User }) => ({
      ...r.company_users,
      user: r.users
    }));
  }

  // Document Vault
  async getDocuments(companyId: string): Promise<Document[]> {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.companyId, companyId))
      .orderBy(desc(documents.createdAt));
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values(insertDocument)
      .returning();
    return document;
  }

  async updateDocument(id: string, data: Partial<InsertDocument>): Promise<Document> {
    const [document] = await db
      .update(documents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return document;
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  // Tax Return Archive
  async getTaxReturnArchive(companyId: string): Promise<TaxReturnArchive[]> {
    return await db
      .select()
      .from(taxReturnArchive)
      .where(eq(taxReturnArchive.companyId, companyId))
      .orderBy(desc(taxReturnArchive.filingDate));
  }

  async getTaxReturnArchiveItem(id: string): Promise<TaxReturnArchive | undefined> {
    const [item] = await db.select().from(taxReturnArchive).where(eq(taxReturnArchive.id, id));
    return item || undefined;
  }

  async createTaxReturnArchive(insertTaxReturn: InsertTaxReturnArchive): Promise<TaxReturnArchive> {
    const [taxReturn] = await db
      .insert(taxReturnArchive)
      .values(insertTaxReturn)
      .returning();
    return taxReturn;
  }

  // Compliance Tasks
  async getComplianceTasks(companyId: string): Promise<ComplianceTask[]> {
    return await db
      .select()
      .from(complianceTasks)
      .where(eq(complianceTasks.companyId, companyId))
      .orderBy(complianceTasks.dueDate);
  }

  async getComplianceTask(id: string): Promise<ComplianceTask | undefined> {
    const [task] = await db.select().from(complianceTasks).where(eq(complianceTasks.id, id));
    return task || undefined;
  }

  async createComplianceTask(insertTask: InsertComplianceTask): Promise<ComplianceTask> {
    const [task] = await db
      .insert(complianceTasks)
      .values(insertTask)
      .returning();
    return task;
  }

  async updateComplianceTask(id: string, data: Partial<InsertComplianceTask>): Promise<ComplianceTask> {
    const [task] = await db
      .update(complianceTasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(complianceTasks.id, id))
      .returning();
    return task;
  }

  async deleteComplianceTask(id: string): Promise<void> {
    await db.delete(complianceTasks).where(eq(complianceTasks.id, id));
  }

  // Messages
  async getMessages(companyId: string): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.companyId, companyId))
      .orderBy(desc(messages.createdAt));
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message || undefined;
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values(insertMessage)
      .returning();
    return message;
  }

  async markMessageAsRead(id: string): Promise<Message> {
    const [message] = await db
      .update(messages)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(messages.id, id))
      .returning();
    return message;
  }

  // News Items
  async getNewsItems(): Promise<NewsItem[]> {
    return await db
      .select()
      .from(newsItems)
      .where(eq(newsItems.isActive, true))
      .orderBy(desc(newsItems.publishedAt));
  }

  async createNewsItem(insertNews: InsertNewsItem): Promise<NewsItem> {
    const [news] = await db
      .insert(newsItems)
      .values(insertNews)
      .returning();
    return news;
  }

  // Invitations (Admin)
  async getInvitations(): Promise<Invitation[]> {
    return await db
      .select()
      .from(invitations)
      .orderBy(desc(invitations.createdAt));
  }

  async getInvitationsByCompany(companyId: string): Promise<Invitation[]> {
    return await db
      .select()
      .from(invitations)
      .where(eq(invitations.companyId, companyId))
      .orderBy(desc(invitations.createdAt));
  }

  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.token, token));
    return invitation || undefined;
  }

  async getInvitationByEmail(email: string): Promise<Invitation | undefined> {
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.email, email));
    return invitation || undefined;
  }

  async createInvitation(insertInvitation: InsertInvitation): Promise<Invitation> {
    const [invitation] = await db
      .insert(invitations)
      .values(insertInvitation)
      .returning();
    return invitation;
  }

  async updateInvitation(id: string, data: Partial<InsertInvitation>): Promise<Invitation> {
    const [invitation] = await db
      .update(invitations)
      .set(data)
      .where(eq(invitations.id, id))
      .returning();
    return invitation;
  }

  async deleteInvitation(id: string): Promise<void> {
    await db.delete(invitations).where(eq(invitations.id, id));
  }

  // Activity Logs (Admin)
  async getActivityLogs(limit: number = 100): Promise<ActivityLog[]> {
    return await db
      .select()
      .from(activityLogs)
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  async getActivityLogsByCompany(companyId: string, limit: number = 100): Promise<ActivityLog[]> {
    return await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.companyId, companyId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  async getActivityLogsByUser(userId: string, limit: number = 100): Promise<ActivityLog[]> {
    return await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  async createActivityLog(insertLog: InsertActivityLog): Promise<ActivityLog> {
    const [log] = await db
      .insert(activityLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  // Client Notes (Admin)
  async getClientNotes(companyId: string): Promise<ClientNote[]> {
    return await db
      .select()
      .from(clientNotes)
      .where(eq(clientNotes.companyId, companyId))
      .orderBy(desc(clientNotes.createdAt));
  }

  async createClientNote(insertNote: InsertClientNote): Promise<ClientNote> {
    const [note] = await db
      .insert(clientNotes)
      .values(insertNote)
      .returning();
    return note;
  }

  async updateClientNote(id: string, data: Partial<InsertClientNote>): Promise<ClientNote> {
    const [note] = await db
      .update(clientNotes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clientNotes.id, id))
      .returning();
    return note;
  }

  async deleteClientNote(id: string): Promise<void> {
    await db.delete(clientNotes).where(eq(clientNotes.id, id));
  }

  // Admin User Management
  async updateUser(id: string, data: { name?: string; email?: string; isAdmin?: boolean }): Promise<User> {
    const [user] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Admin Company Management
  async deleteCompany(id: string): Promise<void> {
    // Safeguard: check if company has financial transactions before deletion
    const companyInvoices = await db.select({ count: sql<number>`count(*)` })
      .from(invoices).where(eq(invoices.companyId, id));
    const companyEntries = await db.select({ count: sql<number>`count(*)` })
      .from(journalEntries).where(eq(journalEntries.companyId, id));

    const invoiceCount = Number(companyInvoices[0]?.count) || 0;
    const entryCount = Number(companyEntries[0]?.count) || 0;

    if (invoiceCount > 0 || entryCount > 0) {
      throw new Error(
        `Cannot delete company with ${invoiceCount} invoices and ${entryCount} journal entries. Archive it instead.`
      );
    }

    // Safe to delete — company has no financial data
    await db.delete(companyUsers).where(eq(companyUsers.companyId, id));
    await db.delete(companies).where(eq(companies.id, id));
  }

  // Client Engagements
  async getEngagements(): Promise<Engagement[]> {
    return await db
      .select()
      .from(engagements)
      .orderBy(desc(engagements.createdAt));
  }

  async getEngagementsByCompany(companyId: string): Promise<Engagement[]> {
    return await db
      .select()
      .from(engagements)
      .where(eq(engagements.companyId, companyId))
      .orderBy(desc(engagements.createdAt));
  }

  async getEngagement(id: string): Promise<Engagement | undefined> {
    const [engagement] = await db
      .select()
      .from(engagements)
      .where(eq(engagements.id, id));
    return engagement || undefined;
  }

  async createEngagement(insertEngagement: InsertEngagement): Promise<Engagement> {
    const [engagement] = await db
      .insert(engagements)
      .values(insertEngagement)
      .returning();
    return engagement;
  }

  async updateEngagement(id: string, data: Partial<InsertEngagement>): Promise<Engagement> {
    const [engagement] = await db
      .update(engagements)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(engagements.id, id))
      .returning();
    return engagement;
  }

  async deleteEngagement(id: string): Promise<void> {
    await db.delete(engagements).where(eq(engagements.id, id));
  }

  // Service Invoices (NR billing to clients)
  async getServiceInvoices(companyId?: string): Promise<ServiceInvoice[]> {
    if (companyId) {
      return await db
        .select()
        .from(serviceInvoices)
        .where(eq(serviceInvoices.companyId, companyId))
        .orderBy(desc(serviceInvoices.createdAt));
    }
    return await db
      .select()
      .from(serviceInvoices)
      .orderBy(desc(serviceInvoices.createdAt));
  }

  async getServiceInvoice(id: string): Promise<ServiceInvoice | undefined> {
    const [invoice] = await db
      .select()
      .from(serviceInvoices)
      .where(eq(serviceInvoices.id, id));
    return invoice || undefined;
  }

  async createServiceInvoice(insertInvoice: InsertServiceInvoice): Promise<ServiceInvoice> {
    const [invoice] = await db
      .insert(serviceInvoices)
      .values(insertInvoice)
      .returning();
    return invoice;
  }

  async updateServiceInvoice(id: string, data: Partial<InsertServiceInvoice>): Promise<ServiceInvoice> {
    const [invoice] = await db
      .update(serviceInvoices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(serviceInvoices.id, id))
      .returning();
    return invoice;
  }

  async deleteServiceInvoice(id: string): Promise<void> {
    await db.delete(serviceInvoices).where(eq(serviceInvoices.id, id));
  }

  // Service Invoice Lines
  async getServiceInvoiceLines(serviceInvoiceId: string): Promise<ServiceInvoiceLine[]> {
    return await db
      .select()
      .from(serviceInvoiceLines)
      .where(eq(serviceInvoiceLines.serviceInvoiceId, serviceInvoiceId));
  }

  async createServiceInvoiceLine(insertLine: InsertServiceInvoiceLine): Promise<ServiceInvoiceLine> {
    const [line] = await db
      .insert(serviceInvoiceLines)
      .values(insertLine)
      .returning();
    return line;
  }

  async deleteServiceInvoiceLines(serviceInvoiceId: string): Promise<void> {
    await db.delete(serviceInvoiceLines).where(eq(serviceInvoiceLines.serviceInvoiceId, serviceInvoiceId));
  }

  // FTA Emails
  async getFtaEmails(companyId: string): Promise<FtaEmail[]> {
    return await db
      .select()
      .from(ftaEmails)
      .where(eq(ftaEmails.companyId, companyId))
      .orderBy(desc(ftaEmails.receivedAt));
  }

  async createFtaEmail(insertEmail: InsertFtaEmail): Promise<FtaEmail> {
    const [email] = await db
      .insert(ftaEmails)
      .values(insertEmail)
      .returning();
    return email;
  }

  async updateFtaEmail(id: string, data: Partial<InsertFtaEmail>): Promise<FtaEmail> {
    const [email] = await db
      .update(ftaEmails)
      .set(data)
      .where(eq(ftaEmails.id, id))
      .returning();
    return email;
  }

  // Customer Subscriptions
  async getSubscription(companyId: string): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, companyId));
    return subscription || undefined;
  }

  async createSubscription(insertSubscription: InsertSubscription): Promise<Subscription> {
    const [subscription] = await db
      .insert(subscriptions)
      .values(insertSubscription)
      .returning();
    return subscription;
  }

  async updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription> {
    const [subscription] = await db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return subscription;
  }

  // User type management
  async updateUserType(id: string, userType: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ userType })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getUsersByType(userType: string): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(eq(users.userType, userType))
      .orderBy(desc(users.createdAt));
  }

  async getClientCompanies(): Promise<Company[]> {
    return await db
      .select()
      .from(companies)
      .where(eq(companies.companyType, 'client'))
      .orderBy(desc(companies.createdAt));
  }

  async getCustomerCompanies(): Promise<Company[]> {
    return await db
      .select()
      .from(companies)
      .where(eq(companies.companyType, 'customer'))
      .orderBy(desc(companies.createdAt));
  }

  // Backups
  async getBackupsByCompanyId(companyId: string): Promise<Backup[]> {
    return await db
      .select()
      .from(backups)
      .where(eq(backups.companyId, companyId))
      .orderBy(desc(backups.createdAt));
  }

  async getBackup(id: string): Promise<Backup | undefined> {
    const [backup] = await db.select().from(backups).where(eq(backups.id, id));
    return backup || undefined;
  }

  async createBackup(insertBackup: InsertBackup): Promise<Backup> {
    const [backup] = await db
      .insert(backups)
      .values(insertBackup)
      .returning();
    return backup;
  }

  async updateBackup(id: string, data: Partial<InsertBackup>): Promise<Backup> {
    const [backup] = await db
      .update(backups)
      .set(data)
      .where(eq(backups.id, id))
      .returning();
    return backup;
  }

  async deleteBackup(id: string): Promise<void> {
    await db.delete(backups).where(eq(backups.id, id));
  }

  // AI Conversations
  async createAiConversation(conversation: InsertAiConversation): Promise<AiConversation> {
    const [result] = await db
      .insert(aiConversations)
      .values(conversation)
      .returning();
    return result;
  }

  async getAiConversationsByUserId(userId: string, limit: number = 50): Promise<AiConversation[]> {
    return await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.createdAt))
      .limit(limit);
  }

  async getAiConversationsByCompanyId(companyId: string, limit: number = 50): Promise<AiConversation[]> {
    return await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.companyId, companyId))
      .orderBy(desc(aiConversations.createdAt))
      .limit(limit);
  }

  async getAiConversation(id: string): Promise<AiConversation | undefined> {
    const [conversation] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, id));
    return conversation || undefined;
  }

  async deleteAiConversation(id: string): Promise<void> {
    await db.delete(aiConversations).where(eq(aiConversations.id, id));
  }

  // Recurring Invoices
  async getRecurringInvoicesByCompanyId(companyId: string): Promise<RecurringInvoice[]> {
    return await db
      .select()
      .from(recurringInvoices)
      .where(eq(recurringInvoices.companyId, companyId))
      .orderBy(desc(recurringInvoices.createdAt));
  }

  async getRecurringInvoice(id: string): Promise<RecurringInvoice | undefined> {
    const [item] = await db.select().from(recurringInvoices).where(eq(recurringInvoices.id, id));
    return item || undefined;
  }

  async getDueRecurringInvoices(): Promise<RecurringInvoice[]> {
    return await db
      .select()
      .from(recurringInvoices)
      .where(
        and(
          eq(recurringInvoices.isActive, true),
          lte(recurringInvoices.nextRunDate, new Date())
        )
      );
  }

  async createRecurringInvoice(data: InsertRecurringInvoice): Promise<RecurringInvoice> {
    const [item] = await db
      .insert(recurringInvoices)
      .values(data)
      .returning();
    return item;
  }

  async updateRecurringInvoice(id: string, data: Partial<RecurringInvoice>): Promise<RecurringInvoice> {
    const [item] = await db
      .update(recurringInvoices)
      .set(data)
      .where(eq(recurringInvoices.id, id))
      .returning();
    if (!item) {
      throw new Error('Recurring invoice not found');
    }
    return item;
  }

  async deleteRecurringInvoice(id: string): Promise<void> {
    await db.delete(recurringInvoices).where(eq(recurringInvoices.id, id));
  }

  // Products / Inventory
  async getProductsByCompanyId(companyId: string): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(eq(products.companyId, companyId))
      .orderBy(desc(products.createdAt));
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async createProduct(data: InsertProduct): Promise<Product> {
    const [product] = await db
      .insert(products)
      .values(data)
      .returning();
    return product;
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    const [product] = await db
      .update(products)
      .set(data)
      .where(eq(products.id, id))
      .returning();
    if (!product) {
      throw new Error('Product not found');
    }
    return product;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  // Inventory Movements
  async getInventoryMovementsByProductId(productId: string): Promise<InventoryMovement[]> {
    return await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.productId, productId))
      .orderBy(desc(inventoryMovements.createdAt));
  }

  async getInventoryMovementsByCompanyId(companyId: string): Promise<InventoryMovement[]> {
    return await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.companyId, companyId))
      .orderBy(desc(inventoryMovements.createdAt));
  }

  async createInventoryMovement(data: InsertInventoryMovement): Promise<InventoryMovement> {
    const [movement] = await db
      .insert(inventoryMovements)
      .values(data)
      .returning();
    return movement;
  }

  // Quotes
  async getQuote(id: string): Promise<Quote | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    return quote || undefined;
  }

  async getQuotesByCompanyId(companyId: string): Promise<Quote[]> {
    return await db.select().from(quotes).where(eq(quotes.companyId, companyId));
  }

  async createQuote(quote: InsertQuote): Promise<Quote> {
    const [created] = await db.insert(quotes).values(quote).returning();
    return created;
  }

  async updateQuote(id: string, data: Partial<InsertQuote>): Promise<Quote> {
    const [updated] = await db.update(quotes).set(data).where(eq(quotes.id, id)).returning();
    if (!updated) throw new Error("Quote not found");
    return updated;
  }

  async deleteQuote(id: string): Promise<void> {
    await db.delete(quotes).where(eq(quotes.id, id));
  }

  // Quote Lines
  async createQuoteLine(line: InsertQuoteLine): Promise<QuoteLine> {
    const [created] = await db.insert(quoteLines).values(line).returning();
    return created;
  }

  async getQuoteLinesByQuoteId(quoteId: string): Promise<QuoteLine[]> {
    return await db.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId));
  }

  async deleteQuoteLinesByQuoteId(quoteId: string): Promise<void> {
    await db.delete(quoteLines).where(eq(quoteLines.quoteId, quoteId));
  }

  // Credit Notes
  async getCreditNote(id: string): Promise<CreditNote | undefined> {
    const [note] = await db.select().from(creditNotes).where(eq(creditNotes.id, id));
    return note || undefined;
  }

  async getCreditNotesByCompanyId(companyId: string): Promise<CreditNote[]> {
    return await db.select().from(creditNotes).where(eq(creditNotes.companyId, companyId));
  }

  async createCreditNote(note: InsertCreditNote): Promise<CreditNote> {
    const [created] = await db.insert(creditNotes).values(note).returning();
    return created;
  }

  async updateCreditNote(id: string, data: Partial<InsertCreditNote>): Promise<CreditNote> {
    const [updated] = await db.update(creditNotes).set(data).where(eq(creditNotes.id, id)).returning();
    if (!updated) throw new Error("Credit note not found");
    return updated;
  }

  async deleteCreditNote(id: string): Promise<void> {
    await db.delete(creditNotes).where(eq(creditNotes.id, id));
  }

  // Credit Note Lines
  async createCreditNoteLine(line: InsertCreditNoteLine): Promise<CreditNoteLine> {
    const [created] = await db.insert(creditNoteLines).values(line).returning();
    return created;
  }

  async getCreditNoteLinesByCreditNoteId(creditNoteId: string): Promise<CreditNoteLine[]> {
    return await db.select().from(creditNoteLines).where(eq(creditNoteLines.creditNoteId, creditNoteId));
  }

  async deleteCreditNoteLinesByCreditNoteId(creditNoteId: string): Promise<void> {
    await db.delete(creditNoteLines).where(eq(creditNoteLines.creditNoteId, creditNoteId));
  }

  // Purchase Orders
  async getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    return po || undefined;
  }

  async getPurchaseOrdersByCompanyId(companyId: string): Promise<PurchaseOrder[]> {
    return await db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, companyId));
  }

  async createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [created] = await db.insert(purchaseOrders).values(po).returning();
    return created;
  }

  async updatePurchaseOrder(id: string, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder> {
    const [updated] = await db.update(purchaseOrders).set(data).where(eq(purchaseOrders.id, id)).returning();
    if (!updated) throw new Error("Purchase order not found");
    return updated;
  }

  async deletePurchaseOrder(id: string): Promise<void> {
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  }

  // Purchase Order Lines
  async createPurchaseOrderLine(line: InsertPurchaseOrderLine): Promise<PurchaseOrderLine> {
    const [created] = await db.insert(purchaseOrderLines).values(line).returning();
    return created;
  }

  async getPurchaseOrderLinesByPurchaseOrderId(poId: string): Promise<PurchaseOrderLine[]> {
    return await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, poId));
  }

  async deletePurchaseOrderLinesByPurchaseOrderId(poId: string): Promise<void> {
    await db.delete(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, poId));
  }

  // Invoice Templates
  async getInvoiceTemplate(id: string): Promise<InvoiceTemplate | undefined> {
    const [template] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, id));
    return template || undefined;
  }

  async getInvoiceTemplatesByCompanyId(companyId: string): Promise<InvoiceTemplate[]> {
    return await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.companyId, companyId));
  }

  async createInvoiceTemplate(template: InsertInvoiceTemplate): Promise<InvoiceTemplate> {
    const [created] = await db.insert(invoiceTemplates).values(template).returning();
    return created;
  }

  async updateInvoiceTemplate(id: string, data: Partial<InsertInvoiceTemplate>): Promise<InvoiceTemplate> {
    const [updated] = await db.update(invoiceTemplates).set(data).where(eq(invoiceTemplates.id, id)).returning();
    if (!updated) throw new Error("Invoice template not found");
    return updated;
  }

  async deleteInvoiceTemplate(id: string): Promise<void> {
    await db.delete(invoiceTemplates).where(eq(invoiceTemplates.id, id));
  }

  async getDefaultInvoiceTemplate(companyId: string): Promise<InvoiceTemplate | undefined> {
    const [template] = await db.select().from(invoiceTemplates)
      .where(and(eq(invoiceTemplates.companyId, companyId), eq(invoiceTemplates.isDefault, true)));
    return template || undefined;
  }

  // Bank Connections
  async getBankConnection(id: string): Promise<BankConnection | undefined> {
    const [conn] = await db.select().from(bankConnections).where(eq(bankConnections.id, id));
    return conn || undefined;
  }

  async getBankConnectionsByCompanyId(companyId: string): Promise<BankConnection[]> {
    return await db.select().from(bankConnections).where(eq(bankConnections.companyId, companyId));
  }

  async createBankConnection(connection: InsertBankConnection): Promise<BankConnection> {
    const [created] = await db.insert(bankConnections).values(connection).returning();
    return created;
  }

  async updateBankConnection(id: string, data: Partial<InsertBankConnection>): Promise<BankConnection> {
    const [updated] = await db.update(bankConnections).set(data).where(eq(bankConnections.id, id)).returning();
    if (!updated) throw new Error("Bank connection not found");
    return updated;
  }

  async deleteBankConnection(id: string): Promise<void> {
    await db.delete(bankConnections).where(eq(bankConnections.id, id));
  }

  // Stripe Events
  async getStripeEvent(stripeEventId: string): Promise<StripeEvent | undefined> {
    const [event] = await db.select().from(stripeEvents).where(eq(stripeEvents.stripeEventId, stripeEventId));
    return event || undefined;
  }

  async createStripeEvent(event: InsertStripeEvent): Promise<StripeEvent> {
    const [created] = await db.insert(stripeEvents).values(event).returning();
    return created;
  }

  // Usage Tracking
  async incrementInvoiceCount(companyId: string): Promise<void> {
    await db.update(subscriptions)
      .set({ invoicesCreatedThisMonth: sql`COALESCE(invoices_created_this_month, 0) + 1` })
      .where(eq(subscriptions.companyId, companyId));
  }

  async incrementReceiptCount(companyId: string): Promise<void> {
    await db.update(subscriptions)
      .set({ receiptsCreatedThisMonth: sql`COALESCE(receipts_created_this_month, 0) + 1` })
      .where(eq(subscriptions.companyId, companyId));
  }

  async decrementAiCredits(companyId: string, amount: number = 1): Promise<void> {
    await db.update(subscriptions)
      .set({ aiCreditsUsedThisMonth: sql`COALESCE(ai_credits_used_this_month, 0) + ${amount}` })
      .where(eq(subscriptions.companyId, companyId));
  }

  async resetMonthlyUsage(companyId: string): Promise<void> {
    await db.update(subscriptions)
      .set({
        invoicesCreatedThisMonth: 0,
        receiptsCreatedThisMonth: 0,
        aiCreditsUsedThisMonth: 0,
        usagePeriodStart: new Date(),
      })
      .where(eq(subscriptions.companyId, companyId));
  }

  async getCompanyCountByUserId(userId: string): Promise<number> {
    const result = await db.select().from(companyUsers).where(eq(companyUsers.userId, userId));
    return result.length;
  }

  async getUserCountByCompanyId(companyId: string): Promise<number> {
    const result = await db.select().from(companyUsers).where(eq(companyUsers.companyId, companyId));
    return result.length;
  }

  // Push Subscriptions
  async getPushSubscriptionsByUserId(userId: string): Promise<PushSubscription[]> {
    return await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  async createPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription> {
    const [created] = await db.insert(pushSubscriptions).values(sub).returning();
    return created;
  }

  async deletePushSubscription(id: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
  }

  async deactivatePushSubscription(endpoint: string): Promise<void> {
    await db.update(pushSubscriptions)
      .set({ isActive: false })
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  // Notification Preferences
  async getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined> {
    const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    return prefs || undefined;
  }

  async upsertNotificationPreferences(userId: string, prefs: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences> {
    const existing = await this.getNotificationPreferences(userId);
    if (existing) {
      const [updated] = await db.update(notificationPreferences)
        .set({ ...prefs, updatedAt: new Date() })
        .where(eq(notificationPreferences.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(notificationPreferences)
      .values({ ...prefs, userId })
      .returning();
    return created;
  }

  // ===== Phase 4: Exchange Rates =====
  async getExchangeRatesByCompanyId(companyId: string): Promise<ExchangeRate[]> {
    return await db.select().from(exchangeRates)
      .where(eq(exchangeRates.companyId, companyId))
      .orderBy(desc(exchangeRates.effectiveDate));
  }

  async getExchangeRate(id: string): Promise<ExchangeRate | undefined> {
    const [rate] = await db.select().from(exchangeRates).where(eq(exchangeRates.id, id));
    return rate || undefined;
  }

  async getLatestExchangeRate(companyId: string, fromCurrency: string, toCurrency: string): Promise<ExchangeRate | undefined> {
    const [rate] = await db.select().from(exchangeRates)
      .where(and(
        eq(exchangeRates.companyId, companyId),
        eq(exchangeRates.fromCurrency, fromCurrency),
        eq(exchangeRates.toCurrency, toCurrency)
      ))
      .orderBy(desc(exchangeRates.effectiveDate))
      .limit(1);
    return rate || undefined;
  }

  async createExchangeRate(rate: InsertExchangeRate): Promise<ExchangeRate> {
    const [created] = await db.insert(exchangeRates).values(rate).returning();
    return created;
  }

  async deleteExchangeRate(id: string): Promise<void> {
    await db.delete(exchangeRates).where(eq(exchangeRates.id, id));
  }

  // ===== Phase 5: Employees =====
  async getEmployeesByCompanyId(companyId: string): Promise<Employee[]> {
    return await db.select().from(employees)
      .where(eq(employees.companyId, companyId))
      .orderBy(employees.name);
  }

  async getEmployee(id: string): Promise<Employee | undefined> {
    const [emp] = await db.select().from(employees).where(eq(employees.id, id));
    return emp || undefined;
  }

  async createEmployee(data: InsertEmployee): Promise<Employee> {
    const [created] = await db.insert(employees).values(data).returning();
    return created;
  }

  async updateEmployee(id: string, data: Partial<InsertEmployee>): Promise<Employee> {
    const [updated] = await db.update(employees).set(data).where(eq(employees.id, id)).returning();
    return updated;
  }

  async deleteEmployee(id: string): Promise<void> {
    await db.delete(employees).where(eq(employees.id, id));
  }

  // ===== Phase 5: Payroll Runs =====
  async getPayrollRunsByCompanyId(companyId: string): Promise<PayrollRun[]> {
    return await db.select().from(payrollRuns)
      .where(eq(payrollRuns.companyId, companyId))
      .orderBy(desc(payrollRuns.runDate));
  }

  async getPayrollRun(id: string): Promise<PayrollRun | undefined> {
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id));
    return run || undefined;
  }

  async createPayrollRun(data: InsertPayrollRun): Promise<PayrollRun> {
    const [created] = await db.insert(payrollRuns).values(data).returning();
    return created;
  }

  async updatePayrollRun(id: string, data: Partial<InsertPayrollRun>): Promise<PayrollRun> {
    const [updated] = await db.update(payrollRuns).set(data).where(eq(payrollRuns.id, id)).returning();
    return updated;
  }

  async deletePayrollRun(id: string): Promise<void> {
    await db.delete(payrollRuns).where(eq(payrollRuns.id, id));
  }

  // ===== Phase 5: Payroll Lines =====
  async getPayrollLinesByRunId(runId: string): Promise<PayrollLine[]> {
    return await db.select().from(payrollLines).where(eq(payrollLines.payrollRunId, runId));
  }

  async createPayrollLine(data: InsertPayrollLine): Promise<PayrollLine> {
    const [created] = await db.insert(payrollLines).values(data).returning();
    return created;
  }

  async deletePayrollLinesByRunId(runId: string): Promise<void> {
    await db.delete(payrollLines).where(eq(payrollLines.payrollRunId, runId));
  }

  // ===== Phase 6: Reconciliation Rules =====
  async getReconciliationRulesByCompanyId(companyId: string): Promise<ReconciliationRule[]> {
    return await db.select().from(reconciliationRules)
      .where(eq(reconciliationRules.companyId, companyId))
      .orderBy(reconciliationRules.priority);
  }

  async getReconciliationRule(id: string): Promise<ReconciliationRule | undefined> {
    const [rule] = await db.select().from(reconciliationRules).where(eq(reconciliationRules.id, id));
    return rule || undefined;
  }

  async createReconciliationRule(data: InsertReconciliationRule): Promise<ReconciliationRule> {
    const [created] = await db.insert(reconciliationRules).values(data).returning();
    return created;
  }

  async updateReconciliationRule(id: string, data: Partial<InsertReconciliationRule>): Promise<ReconciliationRule> {
    const [updated] = await db.update(reconciliationRules).set(data).where(eq(reconciliationRules.id, id)).returning();
    return updated;
  }

  async deleteReconciliationRule(id: string): Promise<void> {
    await db.delete(reconciliationRules).where(eq(reconciliationRules.id, id));
  }

  async incrementRuleAppliedCount(id: string): Promise<void> {
    await db.update(reconciliationRules)
      .set({ timesApplied: sql`COALESCE(${reconciliationRules.timesApplied}, 0) + 1` })
      .where(eq(reconciliationRules.id, id));
  }

  // ===== Phase 7: Document Versions =====
  async getDocumentVersions(companyId: string, documentType: string, documentId: string): Promise<DocumentVersion[]> {
    return await db.select().from(documentVersions)
      .where(and(
        eq(documentVersions.companyId, companyId),
        eq(documentVersions.documentType, documentType),
        eq(documentVersions.documentId, documentId)
      ))
      .orderBy(desc(documentVersions.version));
  }

  async createDocumentVersion(data: InsertDocumentVersion): Promise<DocumentVersion> {
    const [created] = await db.insert(documentVersions).values(data).returning();
    return created;
  }

  async getDocumentVersionCount(companyId: string, documentType: string, documentId: string): Promise<number> {
    const result = await db.select().from(documentVersions)
      .where(and(
        eq(documentVersions.companyId, companyId),
        eq(documentVersions.documentType, documentType),
        eq(documentVersions.documentId, documentId)
      ));
    return result.length;
  }

  // ===== Phase 8: API Keys =====
  async getApiKeysByCompanyId(companyId: string): Promise<ApiKey[]> {
    return await db.select().from(apiKeys)
      .where(eq(apiKeys.companyId, companyId))
      .orderBy(desc(apiKeys.createdAt));
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return key || undefined;
  }

  async createApiKey(data: InsertApiKey): Promise<ApiKey> {
    const [created] = await db.insert(apiKeys).values(data).returning();
    return created;
  }

  async updateApiKey(id: string, data: Partial<InsertApiKey>): Promise<ApiKey> {
    const [updated] = await db.update(apiKeys).set(data).where(eq(apiKeys.id, id)).returning();
    return updated;
  }

  async deleteApiKey(id: string): Promise<void> {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  // ===== Phase 8: Webhook Endpoints =====
  async getWebhookEndpointsByCompanyId(companyId: string): Promise<WebhookEndpoint[]> {
    return await db.select().from(webhookEndpoints)
      .where(eq(webhookEndpoints.companyId, companyId))
      .orderBy(desc(webhookEndpoints.createdAt));
  }

  async getWebhookEndpoint(id: string): Promise<WebhookEndpoint | undefined> {
    const [wh] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id));
    return wh || undefined;
  }

  async getActiveWebhookEndpointsForEvent(companyId: string, event: string): Promise<WebhookEndpoint[]> {
    const all = await db.select().from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.companyId, companyId), eq(webhookEndpoints.isActive, true)));
    return all.filter((wh: WebhookEndpoint) => wh.events.split(',').map((e: string) => e.trim()).includes(event));
  }

  async createWebhookEndpoint(data: InsertWebhookEndpoint): Promise<WebhookEndpoint> {
    const [created] = await db.insert(webhookEndpoints).values(data).returning();
    return created;
  }

  async updateWebhookEndpoint(id: string, data: Partial<InsertWebhookEndpoint>): Promise<WebhookEndpoint> {
    const [updated] = await db.update(webhookEndpoints).set(data).where(eq(webhookEndpoints.id, id)).returning();
    return updated;
  }

  async deleteWebhookEndpoint(id: string): Promise<void> {
    await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
  }

  async incrementWebhookFailureCount(id: string): Promise<void> {
    await db.update(webhookEndpoints)
      .set({ failureCount: sql`COALESCE(${webhookEndpoints.failureCount}, 0) + 1` })
      .where(eq(webhookEndpoints.id, id));
  }

  // ===== Phase 8: Webhook Deliveries =====
  async getWebhookDeliveriesByEndpointId(endpointId: string): Promise<WebhookDelivery[]> {
    return await db.select().from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookEndpointId, endpointId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(100);
  }

  async createWebhookDelivery(data: InsertWebhookDelivery): Promise<WebhookDelivery> {
    const [created] = await db.insert(webhookDeliveries).values(data).returning();
    return created;
  }

  // ===== Cost Centers =====
  async getCostCentersByCompanyId(companyId: string): Promise<CostCenter[]> {
    return await db.select().from(costCenters)
      .where(eq(costCenters.companyId, companyId))
      .orderBy(costCenters.code);
  }

  async getCostCenter(id: string): Promise<CostCenter | undefined> {
    const [cc] = await db.select().from(costCenters).where(eq(costCenters.id, id));
    return cc || undefined;
  }

  async createCostCenter(data: InsertCostCenter): Promise<CostCenter> {
    const [created] = await db.insert(costCenters).values(data).returning();
    return created;
  }

  async updateCostCenter(id: string, data: Partial<InsertCostCenter>): Promise<CostCenter> {
    const [updated] = await db.update(costCenters)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(costCenters.id, id)).returning();
    return updated;
  }

  async deleteCostCenter(id: string): Promise<void> {
    await db.delete(costCenters).where(eq(costCenters.id, id));
  }

  // ===== Fixed Asset Categories =====
  async getFixedAssetCategoriesByCompanyId(companyId: string): Promise<FixedAssetCategory[]> {
    return await db.select().from(fixedAssetCategories)
      .where(eq(fixedAssetCategories.companyId, companyId))
      .orderBy(fixedAssetCategories.name);
  }

  async getFixedAssetCategory(id: string): Promise<FixedAssetCategory | undefined> {
    const [cat] = await db.select().from(fixedAssetCategories).where(eq(fixedAssetCategories.id, id));
    return cat || undefined;
  }

  async createFixedAssetCategory(data: InsertFixedAssetCategory): Promise<FixedAssetCategory> {
    const [created] = await db.insert(fixedAssetCategories).values(data).returning();
    return created;
  }

  async updateFixedAssetCategory(id: string, data: Partial<InsertFixedAssetCategory>): Promise<FixedAssetCategory> {
    const [updated] = await db.update(fixedAssetCategories).set(data).where(eq(fixedAssetCategories.id, id)).returning();
    return updated;
  }

  async deleteFixedAssetCategory(id: string): Promise<void> {
    await db.delete(fixedAssetCategories).where(eq(fixedAssetCategories.id, id));
  }

  // ===== Fixed Assets =====
  async getFixedAssetsByCompanyId(companyId: string): Promise<FixedAsset[]> {
    return await db.select().from(fixedAssets)
      .where(eq(fixedAssets.companyId, companyId))
      .orderBy(desc(fixedAssets.createdAt));
  }

  async getFixedAsset(id: string): Promise<FixedAsset | undefined> {
    const [asset] = await db.select().from(fixedAssets).where(eq(fixedAssets.id, id));
    return asset || undefined;
  }

  async createFixedAsset(data: InsertFixedAsset): Promise<FixedAsset> {
    const [created] = await db.insert(fixedAssets).values(data).returning();
    return created;
  }

  async updateFixedAsset(id: string, data: Partial<InsertFixedAsset>): Promise<FixedAsset> {
    const [updated] = await db.update(fixedAssets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(fixedAssets.id, id)).returning();
    return updated;
  }

  async deleteFixedAsset(id: string): Promise<void> {
    // Delete depreciation schedules first (cascade should handle, but be explicit)
    await db.delete(depreciationSchedules).where(eq(depreciationSchedules.fixedAssetId, id));
    await db.delete(fixedAssets).where(eq(fixedAssets.id, id));
  }

  // ===== Depreciation Schedules =====
  async getDepreciationSchedulesByAssetId(assetId: string): Promise<DepreciationSchedule[]> {
    return await db.select().from(depreciationSchedules)
      .where(eq(depreciationSchedules.fixedAssetId, assetId))
      .orderBy(depreciationSchedules.periodStart);
  }

  async getDepreciationSchedule(id: string): Promise<DepreciationSchedule | undefined> {
    const [schedule] = await db.select().from(depreciationSchedules).where(eq(depreciationSchedules.id, id));
    return schedule || undefined;
  }

  async createDepreciationSchedule(data: InsertDepreciationSchedule): Promise<DepreciationSchedule> {
    const [created] = await db.insert(depreciationSchedules).values(data).returning();
    return created;
  }

  async updateDepreciationSchedule(id: string, data: Partial<InsertDepreciationSchedule>): Promise<DepreciationSchedule> {
    const [updated] = await db.update(depreciationSchedules).set(data).where(eq(depreciationSchedules.id, id)).returning();
    return updated;
  }

  async deleteDepreciationSchedulesByAssetId(assetId: string): Promise<void> {
    await db.delete(depreciationSchedules)
      .where(and(
        eq(depreciationSchedules.fixedAssetId, assetId),
        eq(depreciationSchedules.status, 'pending')
      ));
  }

  async getPendingDepreciationSchedules(companyId: string): Promise<DepreciationSchedule[]> {
    const assets = await db.select({ id: fixedAssets.id }).from(fixedAssets)
      .where(and(eq(fixedAssets.companyId, companyId), eq(fixedAssets.status, 'active')));
    if (assets.length === 0) return [];
    const assetIds = assets.map((a: { id: string }) => a.id);
    return await db.select().from(depreciationSchedules)
      .where(and(
        sql`${depreciationSchedules.fixedAssetId} IN (${sql.join(assetIds.map((id: string) => sql`${id}`), sql`, `)})`,
        eq(depreciationSchedules.status, 'pending')
      ))
      .orderBy(depreciationSchedules.periodStart);
  }

  // ===== Bank Connection Updates (Open Banking) =====
  async updateBankConnectionTokens(id: string, data: {
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiresAt?: Date | null;
    consentId?: string | null;
    consentExpiresAt?: Date | null;
    status?: string;
    lastError?: string | null;
  }): Promise<BankConnection> {
    const [updated] = await db.update(bankConnections).set(data).where(eq(bankConnections.id, id)).returning();
    return updated;
  }

  async getBankConnectionsByProvider(companyId: string, provider: string): Promise<BankConnection[]> {
    return await db.select().from(bankConnections)
      .where(and(
        eq(bankConnections.companyId, companyId),
        eq(bankConnections.provider, provider)
      ));
  }

  async getAutoSyncBankConnections(): Promise<BankConnection[]> {
    return await db.select().from(bankConnections)
      .where(and(
        eq(bankConnections.autoSync, true),
        eq(bankConnections.status, 'active'),
        eq(bankConnections.connectionType, 'api')
      ));
  }
}

export const storage = new DatabaseStorage();
