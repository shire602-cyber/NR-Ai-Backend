import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { ReceiptFormData } from './receipts-types';

interface UseReceiptMutationsOptions {
  companyId: string | undefined;
  onEditSuccess?: () => void;
  onPostSuccess?: () => void;
  onManualExpenseSuccess?: () => void;
  onCreateAccountSuccess?: (data: any, accountType: 'expense' | 'asset') => void;
}

export function useReceiptMutations({
  companyId,
  onEditSuccess,
  onPostSuccess,
  onManualExpenseSuccess,
  onCreateAccountSuccess,
}: UseReceiptMutationsOptions) {
  const { toast } = useToast();

  const saveReceiptMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', `/api/companies/${companyId}/receipts`, data);
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReceiptFormData }) =>
      apiRequest('PUT', `/api/receipts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', companyId, 'receipts'] });
      toast({
        title: 'Receipt updated successfully',
        description: 'Your receipt has been updated.',
      });
      onEditSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update receipt',
        description: error.message || 'Please try again.',
      });
    },
  });

  const postExpenseMutation = useMutation({
    mutationFn: ({ id, accountId, paymentAccountId }: { id: string; accountId: string; paymentAccountId: string }) =>
      apiRequest('POST', `/api/receipts/${id}/post`, { accountId, paymentAccountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', companyId, 'receipts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/companies', companyId, 'journal-entries'] });
      toast({
        title: 'Expense posted successfully',
        description: 'Journal entry has been created.',
      });
      onPostSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to post expense',
        description: error.message || 'Please try again.',
      });
    },
  });

  const manualExpenseMutation = useMutation({
    mutationFn: async (data: ReceiptFormData) => {
      return apiRequest('POST', `/api/companies/${companyId}/receipts`, {
        merchant: data.merchant,
        date: data.date,
        amount: data.amount,
        vatAmount: data.vatAmount,
        category: data.category,
        currency: data.currency,
        status: 'pending',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', companyId, 'receipts'] });
      toast({
        title: 'Expense created successfully',
        description: 'The expense has been added. You can now post it to the journal.',
      });
      onManualExpenseSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create expense',
        description: error.message || 'Please try again.',
      });
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest('POST', `/api/companies/${companyId}/accounts`, data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', companyId, 'accounts'] });
      toast({
        title: 'Account created successfully',
        description: `${data.nameEn} has been added.`,
      });
      // The callback receives the data and currently-active account type
      // so the parent can set the appropriate account selector
      onCreateAccountSuccess?.(data, 'expense');
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create account',
        description: error.message || 'Please try again.',
      });
    },
  });

  const checkSimilarMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest('POST', `/api/companies/${companyId}/receipts/check-similar`, data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest('DELETE', `/api/receipts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', companyId, 'receipts'] });
      toast({
        title: 'Expense deleted',
        description: 'The expense has been deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to delete expense',
        description: error.message || 'Please try again.',
      });
    },
  });

  return {
    saveReceiptMutation,
    editMutation,
    postExpenseMutation,
    manualExpenseMutation,
    createAccountMutation,
    checkSimilarMutation,
    deleteMutation,
  };
}
