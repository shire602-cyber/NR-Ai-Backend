import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/format';

interface ReceiptPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: any | null;
  accounts: any[] | undefined;
  locale: string;
  isPending: boolean;
  onSubmit: (params: { id: string; accountId: string; paymentAccountId: string }) => void;
  onCreateAccount: (type: 'expense' | 'asset') => void;
}

export function ReceiptPostDialog({
  open,
  onOpenChange,
  receipt,
  accounts,
  locale,
  isPending,
  onSubmit,
  onCreateAccount,
}: ReceiptPostDialogProps) {
  const { toast } = useToast();
  const [selectedExpenseAccount, setSelectedExpenseAccount] = useState<string>('');
  const [selectedPaymentAccount, setSelectedPaymentAccount] = useState<string>('');

  const handleSubmit = () => {
    if (!receipt || !selectedExpenseAccount || !selectedPaymentAccount) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Please select both expense and payment accounts.',
      });
      return;
    }

    onSubmit({
      id: receipt.id,
      accountId: selectedExpenseAccount,
      paymentAccountId: selectedPaymentAccount,
    });
  };

  // Reset selections when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedExpenseAccount('');
      setSelectedPaymentAccount('');
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post Expense to Journal</DialogTitle>
          <DialogDescription>
            Select accounts to create journal entry for this expense
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {receipt && (
            <div className="p-4 rounded-md bg-muted">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">{receipt.merchant || 'Unknown Merchant'}</p>
                  <p className="text-sm text-muted-foreground">{receipt.date}</p>
                </div>
                <p className="font-mono font-semibold text-lg">
                  {formatCurrency((receipt.amount || 0) + (receipt.vatAmount || 0), 'AED', locale)}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="expense-account">Expense Account (Debit)</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onCreateAccount('expense')}
                data-testid="button-create-expense-account"
              >
                + Create
              </Button>
            </div>
            <Select value={selectedExpenseAccount} onValueChange={setSelectedExpenseAccount}>
              <SelectTrigger id="expense-account" data-testid="select-expense-account">
                <SelectValue placeholder="Select expense account" />
              </SelectTrigger>
              <SelectContent>
                {accounts?.filter(acc => acc.type === 'expense').map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {locale === 'ar' && account.nameAr ? account.nameAr : account.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The account that will be debited (increased) for this expense
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="payment-account">Payment Account (Credit)</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onCreateAccount('asset')}
                data-testid="button-create-payment-account"
              >
                + Create
              </Button>
            </div>
            <Select value={selectedPaymentAccount} onValueChange={setSelectedPaymentAccount}>
              <SelectTrigger id="payment-account" data-testid="select-payment-account">
                <SelectValue placeholder="Select payment account" />
              </SelectTrigger>
              <SelectContent>
                {accounts?.filter(acc => acc.type === 'asset').map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {locale === 'ar' && account.nameAr ? account.nameAr : account.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The cash or bank account that was used to pay (will be credited/decreased)
            </p>
          </div>

          <div className="p-4 rounded-md border bg-card">
            <p className="text-sm font-medium mb-2">Journal Entry Preview:</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Dr. {accounts?.find(a => a.id === selectedExpenseAccount)?.nameEn || 'Expense Account'}</span>
                <span>{formatCurrency((receipt?.amount || 0) + (receipt?.vatAmount || 0), 'AED', locale)}</span>
              </div>
              <div className="flex justify-between pl-4">
                <span>Cr. {accounts?.find(a => a.id === selectedPaymentAccount)?.nameEn || 'Payment Account'}</span>
                <span>{formatCurrency((receipt?.amount || 0) + (receipt?.vatAmount || 0), 'AED', locale)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="flex-1"
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !selectedExpenseAccount || !selectedPaymentAccount}
              className="flex-1"
              data-testid="button-submit-post-expense"
            >
              {isPending ? 'Posting...' : 'Post to Journal'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
