import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { receiptSchema, type ReceiptFormData } from './receipts-types';

interface ManualExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ReceiptFormData) => void;
  isPending: boolean;
}

export function ManualExpenseDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: ManualExpenseDialogProps) {
  const form = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      merchant: '',
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      vatAmount: null,
      category: '',
      currency: 'AED',
    },
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset({
        merchant: '',
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        vatAmount: null,
        category: '',
        currency: 'AED',
      });
    }
  }, [open, form]);

  const handleSubmit = (data: ReceiptFormData) => {
    onSubmit({
      ...data,
      amount: Number(data.amount),
      vatAmount: data.vatAmount === 0 || data.vatAmount === null || isNaN(data.vatAmount as number) ? null : Number(data.vatAmount),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Expense Manually</DialogTitle>
          <DialogDescription>
            Enter expense details without OCR scanning
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="merchant"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Merchant/Vendor</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Office Depot" {...field} data-testid="input-manual-merchant" />
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
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-manual-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (AED)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-manual-amount" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vatAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>VAT Amount (Optional)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} data-testid="input-manual-vat" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Office Supplies" {...field} value={field.value ?? ''} data-testid="input-manual-category" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="flex-1" data-testid="button-submit-manual-expense">
                {isPending ? 'Creating...' : 'Create Expense'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
