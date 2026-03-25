import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n';
import { useDefaultCompany } from '@/hooks/useDefaultCompany';
import { formatCurrency } from '@/lib/format';
import { PageHeader } from '@/components/shared/PageHeader';
import { AttentionPanel } from './dashboard/AttentionPanel';
import { FinancialSummaryCards } from './dashboard/FinancialSummaryCards';
import { RevenueExpenseChart } from './dashboard/RevenueExpenseChart';
import { ExpenseBreakdownChart } from './dashboard/ExpenseBreakdownChart';
import { RecentActivity } from './dashboard/RecentActivity';
import { QuickActions } from './dashboard/QuickActions';

export default function Dashboard() {
  const { t, locale } = useTranslation();
  const { companyId: selectedCompanyId } = useDefaultCompany();

  // --- Data queries (preserved from original) ---

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ['/api/companies', selectedCompanyId, 'dashboard/stats'],
    enabled: !!selectedCompanyId,
    retry: 1,
  });

  const { data: recentInvoices, isLoading: invoicesLoading } = useQuery<any[]>({
    queryKey: ['/api/companies', selectedCompanyId, 'invoices'],
    enabled: !!selectedCompanyId,
  });

  const { data: journalEntries, isLoading: journalLoading } = useQuery<any[]>({
    queryKey: ['/api/companies', selectedCompanyId, 'journal'],
    enabled: !!selectedCompanyId,
  });

  const { data: expenseData, isLoading: expenseLoading } = useQuery<any[]>({
    queryKey: ['/api/companies', selectedCompanyId, 'dashboard/expense-breakdown'],
    enabled: !!selectedCompanyId,
  });

  const { data: monthlyTrends, isLoading: trendsLoading } = useQuery<any[]>({
    queryKey: ['/api/companies', selectedCompanyId, 'dashboard/monthly-trends'],
    enabled: !!selectedCompanyId,
  });

  // --- Derived data ---

  const revenueValue = stats?.revenue || 0;
  const expensesValue = stats?.expenses || 0;
  const netProfitValue = revenueValue - expensesValue;
  const outstandingValue = stats?.outstanding || 0;

  const overdueInvoices = (recentInvoices || []).filter((inv: any) => {
    if (inv.status !== 'sent') return false;
    const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
    return dueDate ? dueDate < new Date() : false;
  }).length;

  const pendingJournalEntries = (journalEntries || []).filter(
    (entry: any) => entry.status === 'draft'
  ).length;

  const currentDate = new Date().toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });

  const fmt = (val: number) => formatCurrency(val, 'AED', locale);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader title={t.dashboard} description={currentDate} />

      {/* Attention panel (conditionally rendered) */}
      <AttentionPanel
        overdueInvoices={overdueInvoices}
        pendingJournalEntries={pendingJournalEntries}
      />

      {/* Financial summary cards */}
      <FinancialSummaryCards
        revenue={fmt(revenueValue)}
        expenses={fmt(expensesValue)}
        netProfit={fmt(netProfitValue)}
        outstanding={fmt(outstandingValue)}
        isLoading={statsLoading}
      />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueExpenseChart
          data={monthlyTrends}
          isLoading={trendsLoading}
          formatValue={(v) => fmt(v)}
        />
        <ExpenseBreakdownChart
          data={expenseData}
          isLoading={expenseLoading}
          formatValue={(v) => fmt(v)}
        />
      </div>

      {/* Recent activity feed */}
      <RecentActivity
        invoices={recentInvoices}
        journalEntries={journalEntries}
        isLoading={invoicesLoading || journalLoading}
        locale={locale}
      />

      {/* Quick actions */}
      <QuickActions />
    </div>
  );
}
