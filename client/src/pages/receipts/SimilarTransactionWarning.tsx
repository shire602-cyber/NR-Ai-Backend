import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface SimilarTransactionWarningProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  similarTransactions: any[];
  locale: string;
  onCancel: () => void;
  onSaveAnyway: () => void;
}

export function SimilarTransactionWarning({
  open,
  onOpenChange,
  similarTransactions,
  locale,
  onCancel,
  onSaveAnyway,
}: SimilarTransactionWarningProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-yellow-500" />
            Similar Transactions Found
          </DialogTitle>
          <DialogDescription>
            We found similar transactions that might be duplicates. Review them before proceeding.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {similarTransactions.map((transaction, idx) => (
              <div key={idx} className="p-3 border rounded-md bg-muted/50">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{transaction.merchant || 'Unknown Merchant'}</p>
                    <p className="text-sm text-muted-foreground">{transaction.date}</p>
                    {transaction.category && (
                      <Badge variant="outline" className="mt-1">{transaction.category}</Badge>
                    )}
                  </div>
                  <p className="font-mono font-semibold">
                    {formatCurrency(transaction.amount || 0, 'AED', locale)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onCancel}
              className="flex-1"
              data-testid="button-cancel-similar-warning"
            >
              Cancel
            </Button>
            <Button
              onClick={onSaveAnyway}
              className="flex-1"
              data-testid="button-save-anyway"
            >
              Save Anyway
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
