import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Plus, AlertCircle } from 'lucide-react';
import type { Invoice } from './invoice-types';

interface InvoicePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  paymentAccounts: any[];
  isPending: boolean;
  onConfirm: (paymentAccountId: string) => void;
}

export function InvoicePaymentDialog({
  open,
  onOpenChange,
  invoice,
  paymentAccounts,
  isPending,
  onConfirm,
}: InvoicePaymentDialogProps) {
  const { locale } = useTranslation();
  const [selectedPaymentAccount, setSelectedPaymentAccount] = useState<string>('');

  const handleConfirm = () => {
    if (selectedPaymentAccount) {
      onConfirm(selectedPaymentAccount);
      setSelectedPaymentAccount('');
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setSelectedPaymentAccount('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Payment Account</DialogTitle>
          <DialogDescription>
            Choose where the payment for invoice {invoice?.number} was deposited
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {paymentAccounts.length > 0 ? (
            <div className="space-y-2">
              {paymentAccounts.map((account) => (
                <Card
                  key={account.id}
                  className={cn(
                    "cursor-pointer transition-all hover-elevate",
                    selectedPaymentAccount === account.id && "ring-2 ring-primary"
                  )}
                  onClick={() => setSelectedPaymentAccount(account.id)}
                  data-testid={`select-payment-account-${account.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">
                          {locale === 'ar' && account.nameAr ? account.nameAr : account.nameEn}
                        </div>
                        <div className="text-sm text-muted-foreground font-mono">
                          {account.code}
                        </div>
                      </div>
                      {selectedPaymentAccount === account.id && (
                        <div className="text-primary">&#10003;</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You need to create at least one bank or cash account before marking invoices as paid.
                </AlertDescription>
              </Alert>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  window.location.href = '/chart-of-accounts';
                }}
                className="w-full"
                data-testid="button-create-payment-account"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Bank/Cash Account
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex-1"
            data-testid="button-cancel-payment"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedPaymentAccount || isPending}
            className="flex-1"
            data-testid="button-confirm-payment"
          >
            {isPending ? 'Processing...' : 'Mark as Paid'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
