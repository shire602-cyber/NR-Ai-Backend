/**
 * Immutable account code constants.
 * Codes must match those defined in server/defaultChartOfAccounts.ts.
 * Used for reliable account resolution instead of fragile nameEn string matching.
 */
export const ACCOUNT_CODES = {
  CASH: "1010",
  BANK_ACCOUNTS: "1020",
  ACCOUNTS_RECEIVABLE: "1040",
  VAT_RECEIVABLE_INPUT: "1050",
  ACCOUNTS_PAYABLE: "2010",
  VAT_PAYABLE_OUTPUT: "2020",
  INVENTORY: "1070",
  ACCUMULATED_DEPRECIATION: "1240",
  RETAINED_EARNINGS: "3020",
  PRODUCT_SALES: "4010",
  SERVICE_REVENUE: "4020",
  COGS: "5130",
  DEPRECIATION_EXPENSE: "5100",
  SALARY_EXPENSE: "5020",
  SALARIES_PAYABLE: "2030",
  FIXED_ASSETS: "1210",
  GAIN_ON_DISPOSAL: "4080",
  LOSS_ON_DISPOSAL: "5140",
  GENERAL_EXPENSES: "5150",
  UNREALIZED_FX_GAIN: "4090",
  UNREALIZED_FX_LOSS: "5160",
} as const;
