import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { useTranslation } from '@/lib/i18n';
import { useDefaultCompany } from '@/hooks/useDefaultCompany';
import { formatCurrency } from '@/lib/format';
import type { Account } from '@shared/schema';
import {
  Plus,
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Receipt,
  BookOpen,
} from 'lucide-react';

interface AccountWithBalance {
  account: Account;
  balance: number;
  debitTotal: number;
  creditTotal: number;
}

const ACCOUNT_TYPE_ORDER = ['asset', 'liability', 'equity', 'income', 'expense'];

const ACCOUNT_TYPE_CONFIG: Record<string, { 
  label: string; 
  labelAr: string;
  icon: typeof Wallet;
  colorClass: string;
  bgClass: string;
}> = {
  asset: { 
    label: 'Assets', 
    labelAr: 'الأصول',
    icon: Wallet,
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    bgClass: 'bg-emerald-50 dark:bg-emerald-900/20'
  },
  liability: { 
    label: 'Liabilities', 
    labelAr: 'الخصوم',
    icon: CreditCard,
    colorClass: 'text-rose-600 dark:text-rose-400',
    bgClass: 'bg-rose-50 dark:bg-rose-900/20'
  },
  equity: { 
    label: 'Equity', 
    labelAr: 'حقوق الملكية',
    icon: PiggyBank,
    colorClass: 'text-violet-600 dark:text-violet-400',
    bgClass: 'bg-violet-50 dark:bg-violet-900/20'
  },
  income: { 
    label: 'Revenue', 
    labelAr: 'الإيرادات',
    icon: TrendingUp,
    colorClass: 'text-primary',
    bgClass: 'bg-primary/10'
  },
  expense: { 
    label: 'Expenses', 
    labelAr: 'المصروفات',
    icon: Receipt,
    colorClass: 'text-warning',
    bgClass: 'bg-warning/10'
  }
};

export default function ChartOfAccounts() {
  const { t, locale } = useTranslation();
  const [, navigate] = useLocation();
  const { companyId: selectedCompanyId } = useDefaultCompany();
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: accountsWithBalances, isLoading } = useQuery<AccountWithBalance[]>({
    queryKey: ['/api/companies', selectedCompanyId, 'accounts-with-balances'],
    enabled: !!selectedCompanyId,
  });

  // Flatten data for DataTable and apply type filter
  const tableData = useMemo(() => {
    if (!accountsWithBalances) return [];
    const filtered = typeFilter === 'all'
      ? accountsWithBalances
      : accountsWithBalances.filter(item => item.account.type === typeFilter);

    return filtered.map(item => ({
      id: item.account.id,
      code: (item.account as any).code || '',
      nameEn: item.account.nameEn,
      nameAr: item.account.nameAr || '',
      type: item.account.type,
      subType: (item.account as any).subType || '',
      balance: item.balance,
      isActive: item.account.isActive,
    }));
  }, [accountsWithBalances, typeFilter]);

  // Totals for summary card
  const typeTotals = useMemo(() => {
    if (!accountsWithBalances) return {} as Record<string, number>;
    const totals: Record<string, number> = {};
    ACCOUNT_TYPE_ORDER.forEach(type => {
      totals[type] = accountsWithBalances
        .filter(item => item.account.type === type)
        .reduce((sum, item) => sum + item.balance, 0);
    });
    return totals;
  }, [accountsWithBalances]);

  const coaColumns: Column<Record<string, unknown>>[] = useMemo(() => [
    { key: 'code', label: 'Code', sortable: true },
    { key: 'nameEn', label: 'Name (English)', sortable: true },
    { key: 'nameAr', label: 'Name (Arabic)', sortable: true },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      render: (row: Record<string, unknown>) => {
        const type = String(row.type || '');
        const config = ACCOUNT_TYPE_CONFIG[type];
        if (!config) return type;
        return (
          <span className={config.colorClass}>
            {locale === 'ar' ? config.labelAr : config.label}
          </span>
        );
      },
    },
    { key: 'subType', label: 'Sub-Type', sortable: true },
    { key: 'balance', label: 'Balance', type: 'financial' as const, sortable: true },
  ], [locale]);

  if (!selectedCompanyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <BookOpen className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Company Selected</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Please select a company from the sidebar to view the Chart of Accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight" data-testid="text-page-title">
            {t.chartOfAccounts}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t.chartOfAccountsDescription}
          </p>
        </div>
        <Button
          size="default"
          data-testid="button-add-account"
          onClick={() => navigate('/journal')}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t.addAccount}
        </Button>
      </div>

      <DataTable<Record<string, unknown>>
        data={tableData}
        columns={coaColumns}
        loading={isLoading}
        searchable
        searchPlaceholder={t.searchAccounts}
        onRowClick={(row) => navigate(`/accounts/${row.id}/ledger`)}
        emptyTitle={t.noAccountsYet || 'No accounts yet'}
        emptyDescription={t.addAccountsToStart || 'Add accounts to get started'}
        emptyIcon={BookOpen}
        actions={
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40" data-testid="select-type-filter">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ACCOUNT_TYPE_ORDER.map((type) => {
                const config = ACCOUNT_TYPE_CONFIG[type];
                return (
                  <SelectItem key={type} value={type}>
                    {locale === 'ar' ? config.labelAr : config.label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        }
      />

      <Card className="mt-6">
        <CardHeader className="py-4">
          <CardTitle className="text-lg">
            {t.balanceSummary}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {ACCOUNT_TYPE_ORDER.map((type) => {
              const config = ACCOUNT_TYPE_CONFIG[type];
              const Icon = config.icon;
              const total = typeTotals[type] || 0;

              return (
                <div
                  key={type}
                  className={`p-4 rounded-lg ${config.bgClass}`}
                  data-testid={`summary-${type}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 ${config.colorClass}`} />
                    <span className="text-sm font-medium">
                      {locale === 'ar' ? config.labelAr : config.label}
                    </span>
                  </div>
                  <p className={`font-mono font-semibold text-lg ${
                    total >= 0 ? 'text-foreground' : 'text-destructive'
                  }`}>
                    {formatCurrency(Math.abs(total))}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
