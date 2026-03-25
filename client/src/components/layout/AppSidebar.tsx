import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileText,
  BookMarked,
  BarChart3,
  Languages,
  LogOut,
  Receipt,
  Bot,
  Building2,
  FileCheck,
  Users,
  FolderArchive,
  FileStack,
  CalendarDays,
  ListTodo,
  Shield,
  Settings,
  History,
  Database,
  ShoppingCart,
  Plug,
  Wallet,
  ChevronRight,
} from 'lucide-react';
import { useLocation } from 'wouter';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTranslation, useI18n } from '@/lib/i18n';
import { removeToken, getToken } from '@/lib/auth';

// --- Accounting (5 items) ---
const accountingItems = [
  { title: 'dashboard', icon: LayoutDashboard, url: '/dashboard' },
  { title: 'journal', icon: BookMarked, url: '/journal' },
  { title: 'invoices', icon: FileText, url: '/invoices' },
  { title: 'receipts', icon: Receipt, url: '/receipts' },
  { title: 'bankReconciliation', icon: Building2, url: '/bank-reconciliation' },
];

// --- Reports (2 items) ---
const reportsItems = [
  { title: 'reports', icon: BarChart3, url: '/reports' },
  { title: 'vatFiling', icon: FileCheck, url: '/vat-filing' },
];

// --- AI (1 item) ---
const aiItems = [
  { title: 'aiCfo', icon: Bot, url: '/ai-cfo' },
];

// --- Portal sub-items ---
const portalSubItems = [
  { title: 'documentVault', icon: FolderArchive, url: '/document-vault' },
  { title: 'taxReturnArchive', icon: FileStack, url: '/tax-return-archive' },
  { title: 'complianceCalendar', icon: CalendarDays, url: '/compliance-calendar' },
  { title: 'taskCenter', icon: ListTodo, url: '/task-center' },
];

// --- Settings sub-items ---
const settingsSubItems = [
  { title: 'teamManagement', icon: Users, url: '/team' },
  { title: 'integrationsHub', icon: Plug, url: '/integrations-hub' },
  { title: 'history', icon: History, url: '/history' },
  { title: 'backupRestore', icon: Database, url: '/backup-restore' },
];

// --- Admin (1 item) ---
const adminItems = [
  { title: 'adminDashboard', icon: Shield, url: '/admin/dashboard' },
];

// --- Client-portal-only items (for userType === 'client') ---
const clientPortalViewItems = [
  { title: 'documentVault', icon: FolderArchive, url: '/document-vault' },
  { title: 'taxReturnArchive', icon: FileStack, url: '/tax-return-archive' },
  { title: 'complianceCalendar', icon: CalendarDays, url: '/compliance-calendar' },
  { title: 'taskCenter', icon: ListTodo, url: '/task-center' },
];

type SidebarItem = { title: string; icon: React.ComponentType<{ className?: string }>; url: string };

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { t, locale } = useTranslation();
  const { setLocale } = useI18n();
  const [portalOpen, setPortalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Check user status directly from token - no state needed
  const checkUserStatus = (): {
    isAdmin: boolean;
    userType: 'admin' | 'client' | 'customer';
    needsRelogin: boolean
  } => {
    try {
      const token = getToken();
      if (!token) {
        return { isAdmin: false, userType: 'customer', needsRelogin: false };
      }
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { isAdmin: false, userType: 'customer', needsRelogin: false };
      }
      const payload = JSON.parse(atob(parts[1]));

      // If token doesn't have isAdmin field, it's an old token - needs re-login
      if (payload.isAdmin === undefined) {
        return { isAdmin: false, userType: 'customer', needsRelogin: true };
      }

      return {
        isAdmin: payload.isAdmin === true,
        userType: payload.userType || 'customer',
        needsRelogin: false
      };
    } catch (error) {
      return { isAdmin: false, userType: 'customer', needsRelogin: false };
    }
  };

  // Check user status on every render
  const { isAdmin, userType, needsRelogin } = checkUserStatus();

  // Handle old token logout in useEffect (can't update state during render)
  useEffect(() => {
    if (needsRelogin) {
      console.log('[Admin Check] Old token detected - forcing re-login to get updated token');
      removeToken();
      setLocation('/');
    }
  }, [needsRelogin, setLocation]);

  // Auto-expand collapsibles when a sub-item is active
  useEffect(() => {
    if (portalSubItems.some(item => location === item.url || location.startsWith(item.url + '/'))) {
      setPortalOpen(true);
    }
    if (settingsSubItems.some(item => location === item.url || location.startsWith(item.url + '/'))) {
      setSettingsOpen(true);
    }
  }, [location]);

  const handleLogout = () => {
    removeToken();
    setLocation('/');
  };

  const toggleLanguage = () => {
    setLocale(locale === 'en' ? 'ar' : 'en');
  };

  const isActive = (url: string) => location === url || location.startsWith(url + '/');

  const renderMenuItem = (item: SidebarItem) => {
    const Icon = item.icon;
    const active = isActive(item.url);
    const label = (t as any)[item.title] || item.title;

    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton
          isActive={active}
          onClick={() => setLocation(item.url)}
          data-testid={`link-${item.title}`}
          className="transition-colors duration-150 hover:bg-accent"
        >
          <Icon className="w-4 h-4" />
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderCollapsibleGroup = (
    label: string,
    icon: React.ComponentType<{ className?: string }>,
    parentUrl: string,
    subItems: SidebarItem[],
    open: boolean,
    onOpenChange: (open: boolean) => void,
  ) => {
    const Icon = icon;
    const anyChildActive = subItems.some(item => isActive(item.url));
    return (
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              isActive={anyChildActive}
              onClick={() => {
                onOpenChange(!open);
                setLocation(parentUrl);
              }}
              className="transition-colors duration-150 hover:bg-accent"
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              <ChevronRight
                className={`ml-auto w-4 h-4 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
              />
            </SidebarMenuButton>
          </CollapsibleTrigger>
        </SidebarMenuItem>
        <CollapsibleContent>
          <SidebarMenu className="ml-4 border-l pl-2">
            {subItems.map(renderMenuItem)}
          </SidebarMenu>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-semibold text-sm">Muhasib.ai</div>
            <div className="text-xs text-muted-foreground">
              {t.smartAccounting || 'Smart Accounting'}
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Client Portal View - Simplified view for NR-managed clients */}
        {userType === 'client' && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>
                {t.overview || 'Overview'}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {renderMenuItem({ title: 'dashboard', icon: LayoutDashboard, url: '/dashboard' })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>
                {t.myPortal || 'My Portal'}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {clientPortalViewItems.map(renderMenuItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>
                {t.reportsSection || 'Reports'}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {reportsItems.map(renderMenuItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {/* Customer/Admin View - Collapsed ~12 items */}
        {(userType === 'customer' || userType === 'admin') && (
          <>
            {/* Accounting (5) */}
            <SidebarGroup>
              <SidebarGroupLabel>
                {t.accounting || 'Accounting'}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {accountingItems.map(renderMenuItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Reports (2) */}
            <SidebarGroup>
              <SidebarGroupLabel>
                {t.reportsSection || 'Reports'}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {reportsItems.map(renderMenuItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* AI (1) */}
            <SidebarGroup>
              <SidebarGroupLabel>
                {t.aiTools || 'AI Tools'}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {aiItems.map(renderMenuItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Portal (1 with expandable sub-items) */}
            <SidebarGroup>
              <SidebarGroupLabel>
                {t.clientPortal || 'Client Portal'}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {renderCollapsibleGroup(
                    t.clientPortal || 'Client Portal',
                    FolderArchive,
                    '/document-vault',
                    portalSubItems,
                    portalOpen,
                    setPortalOpen,
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Settings (1 with expandable sub-items) */}
            <SidebarGroup>
              <SidebarGroupLabel>
                {t.settings || 'Settings'}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {renderCollapsibleGroup(
                    t.settings || 'Settings',
                    Settings,
                    '/team',
                    settingsSubItems,
                    settingsOpen,
                    setSettingsOpen,
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {/* Admin Panel - Only for admin users */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-primary">
              <Shield className="w-3 h-3 mr-1 inline" />
              {t.adminPanel || 'Admin Panel'}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map(renderMenuItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1 justify-start transition-colors duration-150 hover:bg-accent"
            onClick={toggleLanguage}
            data-testid="button-language-toggle"
          >
            <Languages className="w-4 h-4 mr-2" />
            {locale === 'en' ? 'Arabic' : 'English'}
          </Button>
          <ThemeToggle />
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors duration-150"
          onClick={handleLogout}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {t.logout || 'Logout'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
