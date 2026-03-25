import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { receiptSchema, type ReceiptFormData } from './receipts-types';

interface ReceiptEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: any | null;
  onSubmit: (data: ReceiptFormData) => void;
  isPending: boolean;
}

export function ReceiptEditDialog({
  open,
  onOpenChange,
  receipt,
  onSubmit,
  isPending,
}: ReceiptEditDialogProps) {
  const form = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      merchant: '',
      date: '',
      amount: 0,
      vatAmount: null,
      category: '',
      currency: 'AED',
    },
  });

  useEffect(() => {
    if (receipt) {
      form.reset({
        merchant: receipt.merchant || '',
        date: receipt.date || '',
        amount: receipt.amount || 0,
        vatAmount: receipt.vatAmount || null,
        category: receipt.category || '',
        currency: receipt.currency || 'AED',
      });
    }
  }, [receipt, form]);

  const handleSubmit = (data: ReceiptFormData) => {
    const cleanedData = {
      ...data,
      amount: Number(data.amount),
      category: data.category === '' ? null : data.category,
      vatAmount: data.vatAmount === 0 || data.vatAmount === null || isNaN(data.vatAmount as number) ? null : Number(data.vatAmount),
    };
    onSubmit(cleanedData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Receipt</DialogTitle>
          <DialogDescription>
            Update receipt details
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="merchant"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Merchant</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-edit-merchant" />
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
                    <Input {...field} type="date" data-testid="input-edit-date" />
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
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      className="font-mono"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : '')}
                      data-testid="input-edit-amount"
                    />
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
                    <Input {...field} type="number" step="0.01" className="font-mono" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} data-testid="input-edit-vat" />
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
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Office Supplies">Office Supplies</SelectItem>
                      <SelectItem value="Meals & Entertainment">Meals & Entertainment</SelectItem>
                      <SelectItem value="Travel">Travel</SelectItem>
                      <SelectItem value="Utilities">Utilities</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Software">Software</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="flex-1" data-testid="button-submit-edit-receipt">
                {isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
