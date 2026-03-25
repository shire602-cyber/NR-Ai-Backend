import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/lib/i18n';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { downloadInvoicePDF } from '@/lib/pdf-invoice';
import { MESSAGE_TEMPLATES, fillTemplate, openWhatsApp } from '@/lib/whatsapp-templates';
import { Edit, Download, Trash2, FileCode } from 'lucide-react';
import { SiWhatsapp } from 'react-icons/si';
import type { Invoice, Company, CustomerContact } from './invoice-types';

interface InvoiceActionsProps {
  invoice: Invoice;
  company: Company | undefined;
  customers: CustomerContact[];
  selectedCompanyId: string | undefined;
  isDeletePending: boolean;
  onEdit: (invoice: Invoice) => void;
  onDelete: (id: string) => void;
}

export function InvoiceActions({
  invoice,
  company,
  customers,
  selectedCompanyId,
  isDeletePending,
  onEdit,
  onDelete,
}: InvoiceActionsProps) {
  const { toast } = useToast();
  const { locale } = useTranslation();

  const handleDownloadPDF = async () => {
    try {
      const invoiceDetails = await apiRequest('GET', `/api/invoices/${invoice.id}`);
      const isVATReg = !!(company?.trnVatNumber && company.trnVatNumber.length > 0);
      await downloadInvoicePDF({
        invoiceNumber: invoiceDetails.number,
        date: invoiceDetails.date.toString(),
        customerName: invoiceDetails.customerName,
        customerTRN: invoiceDetails.customerTrn || undefined,
        companyName: company?.name || 'Your Company',
        companyTRN: company?.trnVatNumber || undefined,
        companyAddress: company?.businessAddress || undefined,
        companyPhone: company?.contactPhone || undefined,
        companyEmail: company?.contactEmail || undefined,
        companyWebsite: company?.websiteUrl || undefined,
        companyLogo: company?.logoUrl || undefined,
        lines: invoiceDetails.lines || [],
        subtotal: invoiceDetails.subtotal,
        vatAmount: invoiceDetails.vatAmount,
        total: invoiceDetails.total,
        currency: invoiceDetails.currency,
        locale,
        showLogo: company?.invoiceShowLogo !== undefined ? company.invoiceShowLogo : true,
        showAddress: company?.invoiceShowAddress !== undefined ? company.invoiceShowAddress : true,
        showPhone: company?.invoiceShowPhone !== undefined ? company.invoiceShowPhone : true,
        showEmail: company?.invoiceShowEmail !== undefined ? company.invoiceShowEmail : true,
        showWebsite: company?.invoiceShowWebsite === true ? true : undefined,
        customTitle: company?.invoiceCustomTitle || undefined,
        footerNote: company?.invoiceFooterNote || undefined,
        isVATRegistered: isVATReg,
      });
      toast({ title: 'PDF Downloaded', description: 'Invoice PDF has been downloaded successfully' });
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to generate PDF', variant: 'destructive' });
    }
  };

  const handleWhatsApp = async () => {
    try {
      const customer = customers.find(c => c.name === invoice.customerName);
      if (!customer?.phone) {
        toast({ title: 'No phone number', description: `No phone number found for ${invoice.customerName}. Add one in Customer Contacts.`, variant: 'destructive' });
        return;
      }
      const shareResult = await apiRequest('POST', `/api/invoices/${invoice.id}/share`);
      const shareUrl = `${window.location.origin}${shareResult.shareUrl}`;
      const invoiceDate = new Date(invoice.date);
      const paymentTerms = customer.paymentTerms || 30;
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + paymentTerms);
      const tpl = MESSAGE_TEMPLATES.find(tp => tp.id === 'invoice_with_link');
      const templateStr = locale === 'en' ? (tpl?.template || '') : (tpl?.templateAr || '');
      const message = fillTemplate(templateStr, {
        customer_name: invoice.customerName,
        invoice_number: invoice.number,
        amount: `${invoice.currency} ${Number(invoice.total).toFixed(2)}`,
        due_date: dueDate.toLocaleDateString(locale === 'en' ? 'en-AE' : 'ar-AE'),
        link: shareUrl,
        company_name: company?.name || '',
      });
      apiRequest('POST', '/api/integrations/whatsapp/log-message', { to: customer.phone, message }).catch(() => {});
      openWhatsApp(customer.phone, message);
      if (invoice.status === 'draft') {
        await apiRequest('PATCH', `/api/invoices/${invoice.id}/status`, { status: 'sent' });
        queryClient.invalidateQueries({ queryKey: ['/api/companies', selectedCompanyId, 'invoices'] });
      }
      toast({ title: 'Opening WhatsApp...' });
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to send via WhatsApp', variant: 'destructive' });
    }
  };

  const handleEInvoice = async () => {
    try {
      const result = await apiRequest('POST', `/api/invoices/${invoice.id}/generate-einvoice`);
      toast({ title: 'E-Invoice generated', description: `UUID: ${result.uuid}` });
      queryClient.invalidateQueries({ queryKey: ['/api/companies', selectedCompanyId, 'invoices'] });
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'An error occurred', variant: 'destructive' });
    }
  };

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onEdit(invoice)}
        aria-label="Edit invoice"
        data-testid={`button-edit-invoice-${invoice.id}`}
      >
        <Edit className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDownloadPDF}
        aria-label="Download PDF"
        data-testid={`button-download-pdf-${invoice.id}`}
      >
        <Download className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-success hover:text-success"
        onClick={handleWhatsApp}
        aria-label="Share invoice via WhatsApp"
        data-testid={`button-whatsapp-invoice-${invoice.id}`}
      >
        <SiWhatsapp className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleEInvoice}
        title="Generate E-Invoice"
        aria-label="Generate E-Invoice"
        data-testid={`button-einvoice-${invoice.id}`}
      >
        <FileCode className="w-4 h-4 text-primary" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDelete(invoice.id)}
        disabled={isDeletePending}
        aria-label="Delete invoice"
        data-testid={`button-delete-invoice-${invoice.id}`}
      >
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}
