import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/lib/i18n';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Plus, CalendarIcon, Trash2 } from 'lucide-react';
import { invoiceSchema, type InvoiceFormData, type Invoice } from './invoice-types';

interface InvoiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingInvoice: Invoice | null;
  selectedCompanyId: string | undefined;
  isPending: boolean;
  onSubmit: (data: InvoiceFormData, fields: any[]) => void;
  onReset: () => void;
}

export function InvoiceFormDialog({
  open,
  onOpenChange,
  editingInvoice,
  selectedCompanyId,
  isPending,
  onSubmit,
  onReset,
}: InvoiceFormDialogProps) {
  const { t, locale } = useTranslation();

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      companyId: selectedCompanyId || '',
      number: `INV-${Date.now()}`,
      customerName: '',
      customerTrn: '',
      date: new Date(),
      currency: 'AED',
      lines: [{ description: '', quantity: 1, unitPrice: 0, vatRate: 0.05 }],
    },
  });

  useEffect(() => {
    if (selectedCompanyId) {
      form.setValue('companyId', selectedCompanyId);
    }
  }, [selectedCompanyId, form]);

  useEffect(() => {
    if (editingInvoice) {
      form.reset({
        companyId: editingInvoice.companyId,
        number: editingInvoice.number,
        customerName: editingInvoice.customerName,
        customerTrn: (editingInvoice as any).customerTrn || '',
        date: new Date(editingInvoice.date),
        currency: editingInvoice.currency,
        lines: (editingInvoice as any).lines || [{ description: '', quantity: 1, unitPrice: 0, vatRate: 0.05 }],
      });
    }
  }, [editingInvoice, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const watchLines = form.watch('lines');
  const subtotal = watchLines.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0);
  const vatAmount = watchLines.reduce((sum, line) => sum + (line.quantity * line.unitPrice * line.vatRate), 0);
  const total = subtotal + vatAmount;

  const handleFormSubmit = (data: InvoiceFormData) => {
    onSubmit(data, fields);
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      onReset();
      form.reset({
        companyId: selectedCompanyId,
        number: `INV-${Date.now()}`,
        customerName: '',
        customerTrn: '',
        date: new Date(),
        currency: 'AED',
        lines: [{ description: '', quantity: 1, unitPrice: 0, vatRate: 0.05 }],
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-invoice">
          <Plus className="w-4 h-4 mr-2" />
          {t.newInvoice}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingInvoice ? 'Edit Invoice' : t.newInvoice}</DialogTitle>
          <DialogDescription>
            {editingInvoice ? 'Update invoice details' : 'Create a new invoice with automatic VAT calculation'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.invoiceNumber}</FormLabel>
                    <FormControl>
                      <Input {...field} className="font-mono" data-testid="input-invoice-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.date}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                            data-testid="button-date-picker"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.customerName}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-customer-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerTrn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.customerTRN}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Optional" className="font-mono" data-testid="input-customer-trn" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Line Items</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ description: '', quantity: 1, unitPrice: 0, vatRate: 0.05 })}
                  data-testid="button-add-line"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t.addLine}
                </Button>
              </div>

              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start p-3 border rounded-md">
                  <div className="col-span-3">
                    <FormField
                      control={form.control}
                      name={`lines.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input {...field} placeholder={t.description} data-testid={`input-line-description-${index}`} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name={`lines.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Qty"
                              className="font-mono"
                              value={field.value ?? ''}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : '')}
                              data-testid={`input-line-quantity-${index}`}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name={`lines.${index}.unitPrice`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Price"
                              className="font-mono"
                              value={field.value ?? ''}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : '')}
                              data-testid={`input-line-price-${index}`}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name={`lines.${index}.vatRate`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Select value={String(field.value * 100)} onValueChange={(val) => field.onChange(parseFloat(val) / 100)}>
                              <SelectTrigger className="font-mono" data-testid={`select-line-vat-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">0%</SelectItem>
                                <SelectItem value="5">5%</SelectItem>
                                <SelectItem value="10">10%</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="h-10 flex items-center justify-end font-mono text-sm">
                      {formatCurrency((watchLines[index]?.quantity || 0) * (watchLines[index]?.unitPrice || 0) * (1 + (watchLines[index]?.vatRate || 0)), 'AED', locale)}
                    </div>
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        aria-label="Remove line item"
                        data-testid={`button-remove-line-${index}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t.subtotal}</span>
                <span className="font-mono font-medium">{formatCurrency(subtotal, 'AED', locale)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {t.vat} ({subtotal > 0 ? `${(vatAmount / subtotal * 100).toFixed(1)}%` : '0.0%'})
                </span>
                <span className="font-mono font-medium">{formatCurrency(vatAmount, 'AED', locale)}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold pt-2 border-t">
                <span>{t.total}</span>
                <span className="font-mono">{formatCurrency(total, 'AED', locale)}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} className="flex-1">
                {t.cancel}
              </Button>
              <Button type="submit" disabled={isPending} className="flex-1" data-testid="button-submit-invoice">
                {isPending ? t.loading : t.save}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
