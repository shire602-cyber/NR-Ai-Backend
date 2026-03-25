import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useTranslation } from '@/lib/i18n';
import type { InvoiceFormData, InvoiceBrandingFormData } from './invoice-types';

export function useInvoiceMutations(
  selectedCompanyId: string | undefined,
  callbacks: {
    onCreateSuccess: () => void;
    onEditSuccess: () => void;
    onStatusSuccess: () => void;
    onDeleteSuccess?: () => void;
  }
) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const createMutation = useMutation({
    mutationFn: (data: InvoiceFormData) =>
      apiRequest('POST', `/api/companies/${selectedCompanyId}/invoices`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', selectedCompanyId, 'invoices'] });
      toast({
        title: 'Invoice created',
        description: 'Your invoice has been created with VAT calculation.',
      });
      callbacks.onCreateSuccess();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create invoice',
        description: error?.message || 'Please try again.',
      });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: InvoiceFormData }) =>
      apiRequest('PUT', `/api/invoices/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', selectedCompanyId, 'invoices'] });
      toast({
        title: 'Invoice updated successfully',
        description: 'Your invoice has been updated.',
      });
      callbacks.onEditSuccess();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update invoice',
        description: error?.message || 'Please try again.',
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, paymentAccountId }: { id: string; status: string; paymentAccountId?: string }) =>
      apiRequest('PATCH', `/api/invoices/${id}/status`, { status, paymentAccountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', selectedCompanyId, 'invoices'] });
      toast({
        title: 'Status updated',
        description: 'Invoice status has been updated successfully.',
      });
      callbacks.onStatusSuccess();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update status',
        description: error?.message || 'Please try again.',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', selectedCompanyId, 'invoices'] });
      toast({
        title: t.invoiceDeleted,
        description: t.invoiceDeletedDesc,
      });
      callbacks.onDeleteSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: t.deleteFailed,
        description: error?.message || t.tryAgain,
      });
    },
  });

  const checkSimilarMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest('POST', `/api/companies/${selectedCompanyId}/invoices/check-similar`, data),
  });

  const updateBrandingMutation = useMutation({
    mutationFn: (data: InvoiceBrandingFormData) => {
      return apiRequest('PATCH', `/api/companies/${selectedCompanyId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', selectedCompanyId] });
      queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
      toast({
        title: 'Invoice branding updated',
        description: 'Your invoice customization settings have been saved successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update branding',
        description: error?.message || 'Please try again.',
      });
    },
  });

  return {
    createMutation,
    editMutation,
    updateStatusMutation,
    deleteMutation,
    checkSimilarMutation,
    updateBrandingMutation,
  };
}
