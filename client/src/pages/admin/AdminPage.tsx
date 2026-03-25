import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Users, DollarSign, Shield, Plug, Download, RefreshCw, BarChart3 } from 'lucide-react';
import { useAdminData } from './useAdminData';
import { AdminOverview } from './AdminOverview';
import { AdminPricing } from './AdminPricing';
import { AdminUsers } from './AdminUsers';
import { AdminSettings } from './AdminSettings';
import { AdminIntegrations } from './AdminIntegrations';
import { AdminAuditLog } from './AdminAuditLog';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');

  const {
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
  } = useAdminData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage platform settings, users, and subscriptions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="button-export-data">
            <Download className="w-4 h-4 mr-2" />
            Export Data
          </Button>
          <Button variant="outline" size="sm" data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full max-w-4xl">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <BarChart3 className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="pricing" data-testid="tab-pricing">
            <DollarSign className="w-4 h-4 mr-2" />
            Pricing
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-4 h-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations">
            <Plug className="w-4 h-4 mr-2" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            <Shield className="w-4 h-4 mr-2" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <AdminOverview stats={stats} auditLogs={auditLogs} />
        </TabsContent>

        <TabsContent value="pricing" className="space-y-6">
          <AdminPricing plans={plans} plansLoading={plansLoading} />
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <AdminUsers
            users={users}
            usersLoading={usersLoading}
            companies={companies}
            companiesLoading={companiesLoading}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
          />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <AdminSettings settings={settings} settingsLoading={settingsLoading} />
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <AdminIntegrations />
        </TabsContent>

        <TabsContent value="audit" className="space-y-6">
          <AdminAuditLog auditLogs={auditLogs} logsLoading={logsLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
