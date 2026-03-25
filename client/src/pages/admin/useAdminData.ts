import { useQuery } from '@tanstack/react-query';
import type { AdminSetting, SubscriptionPlan, User, Company, AuditLog } from '@shared/schema';

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalCompanies: number;
  totalInvoices: number;
  totalReceipts: number;
  monthlyRevenue: number;
  aiCreditsUsed: number;
}

export function useAdminData() {
  const { data: settings = [], isLoading: settingsLoading } = useQuery<AdminSetting[]>({
    queryKey: ['/api/admin/settings'],
  });

  const { data: plans = [], isLoading: plansLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ['/api/admin/plans'],
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
  });

  const { data: companies = [], isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ['/api/admin/companies'],
  });

  const { data: auditLogs = [], isLoading: logsLoading } = useQuery<AuditLog[]>({
    queryKey: ['/api/admin/audit-logs'],
  });

  const { data: stats } = useQuery<AdminStats>({
    queryKey: ['/api/admin/stats'],
  });

  return {
    settings,
    settingsLoading,
    plans,
    plansLoading,
    users,
    usersLoading,
    companies,
    companiesLoading,
    auditLogs,
    logsLoading,
    stats,
  };
}
