import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/lib/i18n';
import { useDefaultCompany } from '@/hooks/useDefaultCompany';
import { formatCurrency, formatDate } from '@/lib/format';
import { apiRequest } from '@/lib/queryClient';
import { DateRangeFilter, type DateRange } from '@/components/DateRangeFilter';
import { exportToExcel, exportToGoogleSheets, prepareInvoicesForExport } from '@/lib/export';
import { FileText, Download, Palette, XCircle, FileSpreadsheet } from 'lucide-react';
import { SiGooglesheets } from 'react-icons/si';
import type { Invoice, CustomerContact } from '@shared/schema';
import { useInvoiceMutations } from './useInvoiceMutations';
import { InvoiceList } from './InvoiceList';
import { InvoiceFormDialog } from './InvoiceFormDialog';
import { InvoicePaymentDialog } from './InvoicePaymentDialog';
import { InvoiceBrandingTab } from './InvoiceBrandingTab';

export default function InvoicesPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const { company, companyId: selectedCompanyId } = useDefaultCompany();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [activeTab, setActiveTab] = useState('invoices');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [invoiceForPayment, setInvoiceForPayment] = useState<Invoice | null>(null);
  const [similarWarningOpen, setSimilarWarningOpen] = useState(false);
  const [similarInvoices, setSimilarInvoices] = useState<any[]>([]);
  const [pendingInvoiceData, setPendingInvoiceData] = useState<any>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [isExporting, setIsExporting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ['/api/companies', selectedCompanyId, 'invoices'],
    enabled: !!selectedCompanyId,
  });

  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: ['/api/companies', selectedCompanyId, 'accounts'],
    enabled: !!selectedCompanyId,
  });

  const { data: customers = [] } = useQuery<CustomerContact[]>({
    queryKey: ['/api/companies', selectedCompanyId, 'customer-contacts'],
    queryFn: () => apiRequest('GET', `/api/companies/${selectedCompanyId}/customer-contacts`),
    enabled: !!selectedCompanyId,
  });

  const resetForm = () => {
    setEditingInvoice(null);
  };

  const {
    createMutation,
    editMutation,
    updateStatusMutation,
    deleteMutation,
    checkSimilarMutation,
    updateBrandingMutation,
  } = useInvoiceMutations(selectedCompanyId, {
    onCreateSuccess: () => {
      setDialogOpen(false);
      setEditingInvoice(null);
    },
    onEditSuccess: () => {
      setDialogOpen(false);
      setEditingInvoice(null);
    },
    onStatusSuccess: () => {
      setPaymentDialogOpen(false);
      setInvoiceForPayment(null);
    },
  });

  const handleStatusChange = (invoice: Invoice, newStatus: string) => {
    if (newStatus === 'paid' && invoice.status !== 'paid') {
      setInvoiceForPayment(invoice);
      setPaymentDialogOpen(true);
    } else {
      updateStatusMutation.mutate({ id: invoice.id, status: newStatus });
    }
  };

  const handleConfirmPayment = (paymentAccountId: string) => {
    if (!invoiceForPayment) return;
    updateStatusMutation.mutate({
      id: invoiceForPayment.id,
      status: 'paid',
      paymentAccountId,
    });
  };

  const paymentAccounts = accounts.filter(acc => {
    const name = (acc.nameEn || '').toLowerCase();
    const nameAr = (acc.nameAr || '').toLowerCase();
    return (
      acc.type === 'asset' && (
        name.includes('bank') ||
        name.includes('cash') ||
        name.includes('cheque') ||
        nameAr.includes('بنك') ||
        nameAr.includes('نقد') ||
        nameAr.includes('شيك')
      )
    );
  });

  const handleEditInvoice = async (invoice: Invoice) => {
    try {
      const fullInvoice = await apiRequest('GET', `/api/invoices/${invoice.id}`);
      setEditingInvoice(fullInvoice);
      setDialogOpen(true);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'Failed to load invoice details.',
      });
    }
  };

  const performInvoiceSave = async (invoiceData: any, editing: any) => {
    if (editing) {
      await editMutation.mutateAsync({ id: editing.id, data: invoiceData });
    } else {
      await createMutation.mutateAsync(invoiceData);
    }
    setDialogOpen(false);
    resetForm();
  };

  const onFormSubmit = async (data: any, fields: any[]) => {
    try {
      const invoiceData = {
        ...data,
        companyId: selectedCompanyId!,
        lines: fields.map(line => ({
          description: line.description,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          vatRate: Number(line.vatRate),
        })),
      };
      await performInvoiceSave(invoiceData, editingInvoice);
    } catch {
      // Error handled by mutation callbacks
    }
  };

  const filteredInvoices = useMemo(() => {
    if (!invoices || invoices.length === 0) return [];
    if (!dateRange.from && !dateRange.to) return invoices;

    const fromDate = dateRange.from ? startOfDay(dateRange.from) : null;
    const toDate = dateRange.to ? endOfDay(dateRange.to) : null;

    return invoices.filter(invoice => {
      if (!invoice.date) return false;
      const invoiceDate = typeof invoice.date === 'string'
        ? parseISO(invoice.date)
        : new Date(invoice.date);

      if (fromDate && toDate) {
        return isWithinInterval(invoiceDate, { start: fromDate, end: toDate });
      }
      if (fromDate) return invoiceDate >= fromDate;
      if (toDate) return invoiceDate <= toDate;
      return true;
    });
  }, [invoices, dateRange.from, dateRange.to]);

  const handleExportExcel = () => {
    if (!filteredInvoices.length) {
      toast({ variant: 'destructive', title: 'No data', description: 'No invoices to export' });
      return;
    }
    const dateRangeStr = dateRange.from && dateRange.to
      ? `_${format(dateRange.from, 'yyyy-MM-dd')}_to_${format(dateRange.to, 'yyyy-MM-dd')}`
      : '';
    exportToExcel([prepareInvoicesForExport(filteredInvoices, locale)], `invoices${dateRangeStr}`);
    toast({ title: 'Export successful', description: `${filteredInvoices.length} invoices exported to Excel` });
  };

  const handleExportGoogleSheets = async () => {
    if (!selectedCompanyId || !filteredInvoices.length) {
      toast({ variant: 'destructive', title: 'No data', description: 'No invoices to export' });
      return;
    }
    setIsExporting(true);
    const dateRangeStr = dateRange.from && dateRange.to
      ? ` (${format(dateRange.from, 'MMM dd, yyyy')} - ${format(dateRange.to, 'MMM dd, yyyy')})`
      : '';

    const result = await exportToGoogleSheets(
      [prepareInvoicesForExport(filteredInvoices, locale)],
      `Invoices${dateRangeStr}`,
      selectedCompanyId
    );

    setIsExporting(false);

    if (result.success) {
      toast({
        title: 'Export successful',
        description: `${filteredInvoices.length} invoices exported to Google Sheets`
      });
      if (result.spreadsheetUrl) {
        window.open(result.spreadsheetUrl, '_blank');
      }
    } else {
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: result.error || 'Failed to export to Google Sheets'
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">{t.invoices}</h1>
        <p className="text-muted-foreground">Manage invoices and customize their appearance</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="invoices" data-testid="tab-invoices">
            <FileText className="w-4 h-4 mr-2" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="branding" data-testid="tab-branding">
            <Palette className="w-4 h-4 mr-2" />
            Invoice Branding
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-6 mt-0">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-sm font-medium">Filter by date:</span>
                  <DateRangeFilter
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" disabled={isExporting} data-testid="button-export-invoices">
                        <Download className="w-4 h-4 mr-2" />
                        {isExporting ? 'Exporting...' : t.export}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleExportExcel} data-testid="menu-export-invoices-excel">
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Export to Excel
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportGoogleSheets} data-testid="menu-export-invoices-sheets">
                        <SiGooglesheets className="w-4 h-4 mr-2" />
                        Export to Google Sheets
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end flex-wrap gap-4">
            <InvoiceFormDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              editingInvoice={editingInvoice}
              selectedCompanyId={selectedCompanyId}
              isPending={createMutation.isPending || editMutation.isPending || checkSimilarMutation.isPending}
              onSubmit={onFormSubmit}
              onReset={resetForm}
            />
          </div>

          <InvoiceList
            invoices={filteredInvoices}
            isLoading={isLoading}
            company={company}
            customers={customers}
            selectedCompanyId={selectedCompanyId}
            isStatusUpdatePending={updateStatusMutation.isPending}
            isDeletePending={deleteMutation.isPending}
            onEdit={handleEditInvoice}
            onStatusChange={handleStatusChange}
            onDelete={(id) => setDeleteConfirmId(id)}
          />
        </TabsContent>

        <TabsContent value="branding" className="space-y-6 mt-0">
          <InvoiceBrandingTab
            company={company}
            isLoading={isLoading}
            isPending={updateBrandingMutation.isPending}
            onSubmit={(data) => updateBrandingMutation.mutate(data)}
          />
        </TabsContent>
      </Tabs>

      {/* Similar Invoices Warning Dialog */}
      <Dialog open={similarWarningOpen} onOpenChange={setSimilarWarningOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-warning" />
              Similar Invoices Found
            </DialogTitle>
            <DialogDescription>
              We found similar invoices that might be duplicates. Review them before proceeding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {similarInvoices.map((invoice, idx) => (
                <div key={idx} className="p-3 border rounded-md bg-muted/50">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{invoice.number}</p>
                      <p className="text-sm">{invoice.customerName}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(invoice.date, locale)}</p>
                      <Badge variant="outline" className="mt-1">{invoice.status}</Badge>
                    </div>
                    <p className="font-mono font-semibold">
                      {formatCurrency(invoice.total || 0, 'AED', locale)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setSimilarWarningOpen(false);
                  setPendingInvoiceData(null);
                  setSimilarInvoices([]);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  setSimilarWarningOpen(false);
                  if (pendingInvoiceData) {
                    await performInvoiceSave(pendingInvoiceData, editingInvoice);
                  }
                  setPendingInvoiceData(null);
                  setSimilarInvoices([]);
                }}
                className="flex-1"
              >
                Create Anyway
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <InvoicePaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        invoice={invoiceForPayment}
        paymentAccounts={paymentAccounts}
        isPending={updateStatusMutation.isPending}
        onConfirm={handleConfirmPayment}
      />

      <ConfirmDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}
        title="Delete Invoice"
        description="Are you sure you want to delete this invoice? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteConfirmId) {
            deleteMutation.mutate(deleteConfirmId);
            setDeleteConfirmId(null);
          }
        }}
      />
    </div>
  );
}
