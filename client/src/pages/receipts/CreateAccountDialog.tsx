import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountType: 'expense' | 'asset';
  onSubmit: (data: { code: string; nameEn: string; nameAr: string; type: string; isActive: boolean }) => void;
  isPending: boolean;
}

export function CreateAccountDialog({
  open,
  onOpenChange,
  accountType,
  onSubmit,
  isPending,
}: CreateAccountDialogProps) {
  const { toast } = useToast();
  const [newAccountCode, setNewAccountCode] = useState('');
  const [newAccountName, setNewAccountName] = useState('');

  const handleSubmit = () => {
    if (!newAccountCode.trim() || !newAccountName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Please enter both account code and name.',
      });
      return;
    }
    onSubmit({
      code: newAccountCode.trim(),
      nameEn: newAccountName.trim(),
      nameAr: newAccountName.trim(),
      type: accountType,
      isActive: true,
    });
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setNewAccountCode('');
      setNewAccountName('');
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Account</DialogTitle>
          <DialogDescription>
            Add a new {accountType === 'expense' ? 'expense' : 'payment'} account
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-code">Account Code</Label>
            <Input
              id="account-code"
              value={newAccountCode}
              onChange={(e) => setNewAccountCode(e.target.value)}
              placeholder="e.g., 5220"
              data-testid="input-account-code"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-name">Account Name</Label>
            <Input
              id="account-name"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder="e.g., Travel Expenses"
              data-testid="input-account-name"
            />
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
              disabled={isPending || !newAccountCode.trim() || !newAccountName.trim()}
              className="flex-1"
              data-testid="button-create-account-submit"
            >
              {isPending ? 'Creating...' : 'Create Account'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
