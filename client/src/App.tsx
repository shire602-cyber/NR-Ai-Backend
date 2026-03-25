import { useEffect, useState, useCallback } from 'react';
import { Switch, Route, useLocation, Link } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from '@/components/ThemeProvider';
import { CommandPalette } from '@/components/CommandPalette';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { useI18n } from '@/lib/i18n';
import { getToken } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { User, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// Pages
import NotFound from '@/pages/not-found';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import Accounts from '@/pages/Accounts';
import ChartOfAccounts from '@/pages/ChartOfAccounts';
import AccountLedger from '@/pages/AccountLedger';
import Invoices from '@/pages/Invoices';
import Journal from '@/pages/Journal';
import JournalEntryDetail from '@/pages/JournalEntryDetail';
import Reports from '@/pages/Reports';
import AICFO from '@/pages/AICFO';
import AIChat from '@/pages/AIChat';
import Receipts from '@/pages/Receipts';
import CustomerContacts from '@/pages/CustomerContacts';
import Landing from '@/pages/Landing';
import Services from '@/pages/Services';
import CompanyProfile from '@/pages/CompanyProfile';
import Integrations from '@/pages/Integrations';
import WhatsAppDashboard from '@/pages/WhatsAppDashboard';
import AIFeatures from '@/pages/AIFeatures';
import SmartAssistant from '@/pages/SmartAssistant';
import AdvancedAnalytics from '@/pages/AdvancedAnalytics';
import IntegrationsHub from '@/pages/IntegrationsHub';
import Notifications from '@/pages/Notifications';
import Reminders from '@/pages/Reminders';
import Referrals from '@/pages/Referrals';
import Feedback from '@/pages/Feedback';
import Analytics from '@/pages/Analytics';
import Admin from '@/pages/Admin';
import BankReconciliation from '@/pages/BankReconciliation';
import VATFiling from '@/pages/VATFiling';
import CorporateTax from '@/pages/CorporateTax';
import TeamManagement from '@/pages/TeamManagement';
import AdvancedReports from '@/pages/AdvancedReports';
import DocumentVault from '@/pages/DocumentVault';
import TaxReturnArchive from '@/pages/TaxReturnArchive';
import ComplianceCalendar from '@/pages/ComplianceCalendar';
import TaskCenter from '@/pages/TaskCenter';
import UAENewsFeed from '@/pages/UAENewsFeed';
import AdminDashboard from '@/pages/AdminDashboard';
import ClientManagement from '@/pages/ClientManagement';
import UserInvitations from '@/pages/UserInvitations';
import ActivityLogs from '@/pages/ActivityLogs';
import AdminDocuments from '@/pages/AdminDocuments';
import ClientImport from '@/pages/ClientImport';
import ClientDocuments from '@/pages/ClientDocuments';
import ClientTasks from '@/pages/ClientTasks';
import ClientDetails from '@/pages/ClientDetails';
import History from '@/pages/History';
import BackupRestore from '@/pages/BackupRestore';
import PublicInvoiceView from '@/pages/PublicInvoiceView';
import CustomerPortal from '@/pages/CustomerPortal';
import RecurringInvoices from '@/pages/RecurringInvoices';
import Inventory from '@/pages/Inventory';

// Components
import { OnboardingWizard } from '@/components/Onboarding';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const openCommandPalette = useCallback(() => setCommandOpen(true), []);
  const style = {
    '--sidebar-width': '16rem',
    '--sidebar-width-icon': '3rem',
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md">Skip to main content</a>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between p-4 border-b bg-background sticky top-0 z-10">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex items-center gap-2 text-muted-foreground transition-colors duration-150 hover:bg-accent"
                onClick={openCommandPalette}
                data-testid="button-command-palette"
              >
                <Search className="w-4 h-4" />
                <span>Search...</span>
                <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  Ctrl+K
                </kbd>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden transition-colors duration-150 hover:bg-accent"
                onClick={openCommandPalette}
                aria-label="Search"
              >
                <Search className="w-4 h-4" />
              </Button>
              <Link href="/company-profile">
                <Button variant="ghost" size="sm" data-testid="button-profile" className="transition-colors duration-150 hover:bg-accent">
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </Button>
              </Link>
            </div>
          </header>
          <main id="main-content" className="flex-1 overflow-auto p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={location}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <KeyboardShortcuts onOpenCommandPalette={openCommandPalette} />
      <OnboardingWizard />
    </SidebarProvider>
  );
}

function Router() {
  const [location, setLocation] = useLocation();
  const token = getToken();
  
  // Redirect authenticated users from landing to dashboard
  useEffect(() => {
    if (location === '/' && token) {
      setLocation('/dashboard');
    }
  }, [location, token, setLocation]);
  
  // Guard: authenticated users at root - wait for redirect
  if (location === '/' && token) {
    return null;
  }
  
  // Landing page (public only)
  if (location === '/' && !token) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Landing />
        </motion.div>
      </AnimatePresence>
    );
  }
  
  // Public routes (no sidebar)
  if (location === '/login' || location === '/register' || location === '/services' || location.startsWith('/view/invoice/') || location.startsWith('/portal/')) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={location}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3 }}
        >
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/services" component={Services} />
        <Route path="/view/invoice/:token" component={PublicInvoiceView} />
        <Route path="/portal/:token" component={CustomerPortal} />
      </Switch>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Protected routes (with sidebar)
  return (
    <ProtectedRoute>
      <ProtectedLayout>
        <Switch>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/company-profile" component={CompanyProfile} />
          <Route path="/accounts" component={Accounts} />
          <Route path="/chart-of-accounts" component={ChartOfAccounts} />
          <Route path="/accounts/:id/ledger" component={AccountLedger} />
          <Route path="/invoices" component={Invoices} />
          <Route path="/recurring-invoices" component={RecurringInvoices} />
          <Route path="/journal" component={Journal} />
          <Route path="/journal/:id" component={JournalEntryDetail} />
          <Route path="/reports" component={Reports} />
          <Route path="/receipts" component={Receipts} />
          <Route path="/contacts" component={CustomerContacts} />
          <Route path="/inventory" component={Inventory} />
          <Route path="/ai-cfo" component={AICFO} />
          <Route path="/ai-features" component={AIFeatures} />
          <Route path="/smart-assistant" component={SmartAssistant} />
          <Route path="/ai-chat" component={AIChat} />
          <Route path="/advanced-analytics" component={AdvancedAnalytics} />
          <Route path="/integrations" component={Integrations} />
          <Route path="/integrations-hub" component={IntegrationsHub} />
          <Route path="/whatsapp" component={WhatsAppDashboard} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/reminders" component={Reminders} />
          <Route path="/referrals" component={Referrals} />
          <Route path="/feedback" component={Feedback} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/admin" component={Admin} />
          <Route path="/bank-reconciliation" component={BankReconciliation} />
          <Route path="/vat-filing" component={VATFiling} />
          <Route path="/corporate-tax" component={CorporateTax} />
          <Route path="/team" component={TeamManagement} />
          <Route path="/history" component={History} />
          <Route path="/backup-restore" component={BackupRestore} />
          <Route path="/advanced-reports" component={AdvancedReports} />
          <Route path="/document-vault" component={DocumentVault} />
          <Route path="/tax-return-archive" component={TaxReturnArchive} />
          <Route path="/compliance-calendar" component={ComplianceCalendar} />
          <Route path="/task-center" component={TaskCenter} />
          <Route path="/news-feed" component={UAENewsFeed} />
          
          {/* Admin Routes */}
          <Route path="/admin/dashboard" component={AdminDashboard} />
          <Route path="/admin/clients" component={ClientManagement} />
          <Route path="/admin/clients/:id" component={ClientDetails} />
          <Route path="/admin/clients/:id/documents" component={ClientDocuments} />
          <Route path="/admin/clients/:id/tasks" component={ClientTasks} />
          <Route path="/admin/documents" component={AdminDocuments} />
          <Route path="/admin/invitations" component={UserInvitations} />
          <Route path="/admin/import" component={ClientImport} />
          <Route path="/admin/activity-logs" component={ActivityLogs} />
          <Route path="/admin/users" component={Admin} />
          <Route path="/admin" component={Admin} />
          
          <Route component={NotFound} />
        </Switch>
      </ProtectedLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  const { locale, setLocale } = useI18n();

  useEffect(() => {
    // Initialize locale settings
    setLocale(locale);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
