import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { FileText } from 'lucide-react';
import { InvoiceActions } from './InvoiceActions';
import type { Invoice, Company, CustomerContact } from './invoice-types';

function getStatusBadgeColor(status: string) {
  switch (status) {
    case 'paid': return 'bg-success/10 text-success';
    case 'sent': return 'bg-primary/10 text-primary';
    case 'void': return 'bg-muted text-foreground dark:text-muted-foreground';
    default: return 'bg-warning/10 text-warning';
  }
}

interface InvoiceListProps {
  invoices: Invoice[];
  isLoading: boolean;
  company: Company | undefined;
  customers: CustomerContact[];
  selectedCompanyId: string | undefined;
  isStatusUpdatePending: boolean;
  isDeletePending: boolean;
  onEdit: (invoice: Invoice) => void;
  onStatusChange: (invoice: Invoice, newStatus: string) => void;
  onDelete: (id: string) => void;
}

export function InvoiceList({
  invoices,
  isLoading,
  company,
  customers,
  selectedCompanyId,
  isStatusUpdatePending,
  isDeletePending,
  onEdit,
  onStatusChange,
  onDelete,
}: InvoiceListProps) {
  const { t, locale } = useTranslation();

  const invoiceTableData = useMemo(() => {
    return (invoices || []).map((inv: Invoice) => ({
      ...inv,
      id: inv.id,
      number: inv.number,
      date: inv.date,
      customerName: inv.customerName,
      total: Number(inv.total),
      status: inv.status,
    }));
  }, [invoices]);

  const invoiceColumns: Column<Record<string, unknown>>[] = useMemo(() => [
    { key: 'number', label: t.invoiceNumber, sortable: true },
    { key: 'date', label: t.date, type: 'date' as const, sortable: true },
    { key: 'customerName', label: t.customerName, sortable: true },
    { key: 'total', label: t.total, type: 'financial' as const, sortable: true },
    {
      key: 'status',
      label: t.status,
      sortable: true,
      render: (row: Record<string, unknown>) => {
        const invoice = row as any;
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Select
              value={invoice.status}
              onValueChange={(newStatus) => onStatusChange(invoice, newStatus)}
              disabled={isStatusUpdatePending}
            >
              <SelectTrigger
                className={cn("w-32 border-0", getStatusBadgeColor(invoice.status))}
                data-testid={`select-status-${invoice.id}`}
              >
                <SelectValue>
                  {t[invoice.status as keyof typeof t]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft" data-testid={`status-option-draft-${invoice.id}`}>
                  {t.draft}
                </SelectItem>
                <SelectItem value="sent" data-testid={`status-option-sent-${invoice.id}`}>
                  {t.sent}
                </SelectItem>
                <SelectItem value="paid" data-testid={`status-option-paid-${invoice.id}`}>
                  {t.paid}
                </SelectItem>
                <SelectItem value="void" data-testid={`status-option-void-${invoice.id}`}>
                  {t.void}
                </SelectItem>
              </SelectContent>
            </Select>
            {(invoice as any).einvoiceStatus && (
              <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 bg-primary/10 text-primary border-primary/20">
                E
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row: Record<string, unknown>) => {
        const invoice = row as any;
        return (
          <InvoiceActions
            invoice={invoice}
            company={company}
            customers={customers}
            selectedCompanyId={selectedCompanyId}
            isDeletePending={isDeletePending}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        );
      },
    },
  ], [t, company, customers, selectedCompanyId, isStatusUpdatePending, isDeletePending, onEdit, onStatusChange, onDelete]);

  return (
    <DataTable<Record<string, unknown>>
      data={invoiceTableData}
      columns={invoiceColumns}
      loading={isLoading}
      searchable
      searchPlaceholder="Search invoices..."
      onRowClick={(row) => onEdit(row as any)}
      emptyTitle={t.noData}
      emptyDescription="Create your first invoice to get started."
      emptyIcon={FileText}
    />
  );
}
