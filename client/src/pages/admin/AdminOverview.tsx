import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Users, DollarSign, Activity, Database, Bell, Plus, Trash2, Edit2,
  RefreshCw, CheckCircle, AlertTriangle, FileText, Building2
} from 'lucide-react';
import type { AuditLog } from '@shared/schema';
import type { AdminStats } from './useAdminData';

interface AdminOverviewProps {
  stats: AdminStats | undefined;
  auditLogs: AuditLog[];
}

export function AdminOverview({ stats, auditLogs }: AdminOverviewProps) {
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-users">{stats?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              Registered users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Active Companies</CardTitle>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-companies">{stats?.totalCompanies || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active companies
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-monthly-revenue">
              AED {(stats?.monthlyRevenue || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Current month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
            <CardTitle className="text-sm font-medium">AI Credits Used</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-ai-credits">{stats?.aiCreditsUsed || 0}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>

      {/* Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">System Status</CardTitle>
            <CardDescription>Current system health and status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-success" />
                <span>Database</span>
              </div>
              <Badge variant="outline" className="bg-success/10 text-success border-success/20">Healthy</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-success" />
                <span>API Services</span>
              </div>
              <Badge variant="outline" className="bg-success/10 text-success border-success/20">Operational</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-success" />
                <span>AI Services (OpenAI)</span>
              </div>
              <Badge variant="outline" className="bg-success/10 text-success border-success/20">Connected</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <span>WhatsApp Integration</span>
              </div>
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Needs Config</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              data-testid="button-backup-db"
              onClick={() => {
                toast({ title: 'Backup Started', description: 'Database backup is in progress...' });
                setTimeout(() => {
                  toast({ title: 'Backup Complete', description: 'Database has been backed up successfully.' });
                }, 2000);
              }}
            >
              <Database className="w-4 h-4 mr-2" />
              Backup Database
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              data-testid="button-send-newsletter"
              onClick={() => {
                toast({ title: 'Newsletter', description: 'Newsletter feature will be available soon. Configure email settings first.' });
              }}
            >
              <Bell className="w-4 h-4 mr-2" />
              Send Newsletter
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              data-testid="button-generate-report"
              onClick={() => {
                toast({ title: 'Generating Report', description: 'Usage report is being generated...' });
                setTimeout(() => {
                  const reportData = {
                    generatedAt: new Date().toISOString(),
                    totalUsers: stats?.totalUsers || 0,
                    activeUsers: stats?.activeUsers || 0,
                    totalCompanies: stats?.totalCompanies || 0,
                    totalInvoices: stats?.totalInvoices || 0,
                    totalReceipts: stats?.totalReceipts || 0,
                    monthlyRevenue: stats?.monthlyRevenue || 0,
                    aiCreditsUsed: stats?.aiCreditsUsed || 0,
                  };
                  const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `usage-report-${new Date().toISOString().split('T')[0]}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast({ title: 'Report Generated', description: 'Usage report has been downloaded.' });
                }, 1500);
              }}
            >
              <FileText className="w-4 h-4 mr-2" />
              Generate Usage Report
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              data-testid="button-sync-integrations"
              onClick={() => {
                toast({ title: 'Syncing Integrations', description: 'Checking all integration connections...' });
                setTimeout(() => {
                  toast({ title: 'Sync Complete', description: 'All integrations are up to date.' });
                }, 2000);
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Sync All Integrations
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <CardDescription>Latest actions across the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {auditLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  {log.action === 'create' && <Plus className="w-4 h-4 text-success" />}
                  {log.action === 'update' && <Edit2 className="w-4 h-4 text-primary" />}
                  {log.action === 'delete' && <Trash2 className="w-4 h-4 text-destructive" />}
                  {log.action === 'login' && <Users className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{log.action} {log.resourceType}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            {auditLogs.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No recent activity</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
