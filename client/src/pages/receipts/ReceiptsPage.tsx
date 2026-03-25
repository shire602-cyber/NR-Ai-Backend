import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { useDefaultCompany } from '@/hooks/useDefaultCompany';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { exportToExcel, exportToGoogleSheets, prepareReceiptsForExport } from '@/lib/export';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type { DateRange } from '@/components/DateRangeFilter';
import type { ReceiptFormData } from './receipts-types';
import { useReceiptOCR } from './useReceiptOCR';
import { useReceiptMutations } from './useReceiptMutations';
import { ReceiptUploadZone } from './ReceiptUploadZone';
import { ReceiptProcessingQueue } from './ReceiptProcessingQueue';
import { ReceiptList } from './ReceiptList';
import { ReceiptEditDialog } from './ReceiptEditDialog';
import { ReceiptPostDialog } from './ReceiptPostDialog';
import { ManualExpenseDialog } from './ManualExpenseDialog';
import { SimilarTransactionWarning } from './SimilarTransactionWarning';
import { CreateAccountDialog } from './CreateAccountDialog';

export default function ReceiptsPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const { companyId, isLoading: isLoadingCompany } = useDefaultCompany();

  // Dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<any>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [postingReceipt, setPostingReceipt] = useState<any>(null);
  const [createAccountDialogOpen, setCreateAccountDialogOpen] = useState(false);
  const [newAccountType, setNewAccountType] = useState<'expense' | 'asset'>('expense');
  const [similarWarningOpen, setSimilarWarningOpen] = useState(false);
  const [similarTransactions, setSimilarTransactions] = useState<any[]>([]);
  const [pendingSaveData, setPendingSaveData] = useState<any>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [isExporting, setIsExporting] = useState(false);
  const [manualExpenseDialogOpen, setManualExpenseDialogOpen] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [totalToSave, setTotalToSave] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<any>(null);

  // Queries
  const { data: receipts, isLoading } = useQuery<any[]>({
    queryKey: ['/api/companies', companyId, 'receipts'],
    enabled: !!companyId,
  });

  const { data: accounts } = useQuery<any[]>({
    queryKey: ['/api/companies', companyId, 'accounts'],
    enabled: !!companyId,
  });

  // OCR hook
  const {
    processedReceipts,
    setProcessedReceipts,
    isProcessingBulk,
    handleFilesSelect,
    processAllReceipts,
    removeReceipt,
    updateReceiptData,
    resetForm,
  } = useReceiptOCR(companyId);

  // Mutations hook
  const mutations = useReceiptMutations({
    companyId,
    onEditSuccess: () => {
      setEditDialogOpen(false);
      setEditingReceipt(null);
    },
    onPostSuccess: () => {
      setPostDialogOpen(false);
      setPostingReceipt(null);
    },
    onManualExpenseSuccess: () => {
      setManualExpenseDialogOpen(false);
    },
    onCreateAccountSuccess: (data: any, _accountType: 'expense' | 'asset') => {
      setCreateAccountDialogOpen(false);
    },
  });

  // Handlers
  const handleEditReceipt = useCallback((receipt: any) => {
    setEditingReceipt(receipt);
    setEditDialogOpen(true);
  }, []);

  const handleEditSubmit = useCallback((data: ReceiptFormData) => {
    if (!editingReceipt) return;
    mutations.editMutation.mutate({ id: editingReceipt.id, data });
  }, [editingReceipt, mutations.editMutation]);

  const handleDeleteReceipt = useCallback((receipt: any) => {
    setReceiptToDelete(receipt);
    setDeleteConfirmOpen(true);
  }, []);

  const confirmDeleteReceipt = useCallback(() => {
    if (receiptToDelete) {
      mutations.deleteMutation.mutate(receiptToDelete.id);
    }
    setDeleteConfirmOpen(false);
    setReceiptToDelete(null);
  }, [receiptToDelete, mutations.deleteMutation]);

  const handlePostExpense = useCallback((receipt: any) => {
    setPostingReceipt(receipt);
    setPostDialogOpen(true);
  }, []);

  const handleCreateAccount = useCallback((type: 'expense' | 'asset') => {
    setNewAccountType(type);
    setCreateAccountDialogOpen(true);
  }, []);

  const handleManualExpenseSubmit = useCallback((data: ReceiptFormData) => {
    mutations.manualExpenseMutation.mutate(data);
  }, [mutations.manualExpenseMutation]);

  const savedCount = processedReceipts.filter((r) => r.status === 'saved').length;

  // Save all receipts
  const saveAllReceipts = useCallback(async () => {
    const completedIndices = processedReceipts
      .map((r, i) => ({ receipt: r, index: i }))
      .filter(({ receipt }) => receipt.status === 'completed' && receipt.data);

    if (completedIndices.length === 0) {
      toast({
        title: 'No receipts to save',
        description: 'Please process receipts before saving',
        variant: 'destructive',
      });
      return;
    }

    if (!companyId) {
      toast({
        title: 'Error',
        description: 'Company not found. Please try refreshing the page.',
        variant: 'destructive',
      });
      return;
    }

    // Perform save
    const total = completedIndices.length;
    setTotalToSave(total);
    setIsSavingAll(true);
    let successCount = 0;
    let errorCount = 0;

    for (const { receipt, index } of completedIndices) {
      try {
        const receiptData = {
          companyId: companyId,
          merchant: receipt.data!.merchant || 'Unknown',
          date: receipt.data!.date || new Date().toISOString().split('T')[0],
          amount: Number(receipt.data!.total) || 0,
          vatAmount: receipt.data!.vatAmount ? Number(receipt.data!.vatAmount) : null,
          category: receipt.data!.category || 'Uncategorized',
          currency: receipt.data!.currency || 'AED',
          imageData: receipt.preview,
          rawText: receipt.data!.rawText,
        };

        await apiRequest('POST', `/api/companies/${companyId}/receipts`, receiptData);

        setProcessedReceipts((prev) => {
          const updated = [...prev];
          updated[index] = { ...updated[index], status: 'saved' };
          return updated;
        });

        successCount++;
      } catch (error: any) {
        console.error('Failed to save receipt:', error);
        const errorMessage = error.message || 'Failed to save to database';

        setProcessedReceipts((prev) => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            status: 'save_error',
            error: errorMessage,
          };
          return updated;
        });

        errorCount++;
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['/api/companies', companyId, 'receipts'] });
    setIsSavingAll(false);

    if (successCount > 0) {
      toast({
        title: 'Receipts Saved',
        description: `Successfully saved ${successCount} receipt(s)${errorCount > 0 ? `. ${errorCount} failed` : ''}`,
      });

      if (errorCount === 0) {
        resetForm();
        setTotalToSave(0);
      } else {
        setProcessedReceipts((prev) => prev.filter((r) => r.status !== 'saved'));
      }
    } else {
      toast({
        title: 'Save Failed',
        description: 'Failed to save any receipts. Please try again.',
        variant: 'destructive',
      });
    }
  }, [processedReceipts, companyId, toast, setProcessedReceipts, resetForm]);

  // Export handlers
  const filteredReceiptsForExport = (() => {
    if (!receipts || receipts.length === 0) return [];
    if (!dateRange.from && !dateRange.to) return receipts;
    return receipts;
  })();

  const handleExportExcel = useCallback(() => {
    if (!filteredReceiptsForExport.length) {
      toast({ variant: 'destructive', title: 'No data', description: 'No expenses to export' });
      return;
    }

    const dateRangeStr = dateRange.from && dateRange.to
      ? `_${format(dateRange.from, 'yyyy-MM-dd')}_to_${format(dateRange.to, 'yyyy-MM-dd')}`
      : '';

    exportToExcel([prepareReceiptsForExport(filteredReceiptsForExport, locale)], `expenses${dateRangeStr}`);
    toast({ title: 'Export successful', description: `${filteredReceiptsForExport.length} expenses exported to Excel` });
  }, [filteredReceiptsForExport, dateRange, locale, toast]);

  const handleExportGoogleSheets = useCallback(async () => {
    if (!companyId || !filteredReceiptsForExport.length) {
      toast({ variant: 'destructive', title: 'No data', description: 'No expenses to export' });
      return;
    }

    setIsExporting(true);
    const dateRangeStr = dateRange.from && dateRange.to
      ? ` (${format(dateRange.from, 'MMM dd, yyyy')} - ${format(dateRange.to, 'MMM dd, yyyy')})`
      : '';

    const result = await exportToGoogleSheets(
      [prepareReceiptsForExport(filteredReceiptsForExport, locale)],
      `Expenses${dateRangeStr}`,
      companyId
    );

    setIsExporting(false);

    if (result.success) {
      toast({
        title: 'Export successful',
        description: `${filteredReceiptsForExport.length} expenses exported to Google Sheets`,
      });
      if (result.spreadsheetUrl) {
        window.open(result.spreadsheetUrl, '_blank');
      }
    } else {
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: result.error || 'Failed to export to Google Sheets',
      });
    }
  }, [companyId, filteredReceiptsForExport, dateRange, locale, toast]);

  // Similar transaction warning handlers
  const handleCancelSimilarWarning = useCallback(() => {
    setSimilarWarningOpen(false);
    setPendingSaveData(null);
    setSimilarTransactions([]);
  }, []);

  const handleSaveAnyway = useCallback(async () => {
    setSimilarWarningOpen(false);
    if (pendingSaveData) {
      // Re-trigger save logic
    }
    setPendingSaveData(null);
    setSimilarTransactions([]);
  }, [pendingSaveData]);

  const handleResetForm = useCallback(() => {
    resetForm();
    setIsSavingAll(false);
    setTotalToSave(0);
  }, [resetForm]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Receipt Scanner</h1>
          <p className="text-muted-foreground">
            Upload receipts for AI extraction or enter manually
          </p>
        </div>
        <Button onClick={() => setManualExpenseDialogOpen(true)} data-testid="button-add-manual-expense">
          + Add Expense Manually
        </Button>
      </div>

      {/* Upload Section */}
      <ReceiptUploadZone
        processedReceipts={processedReceipts}
        isProcessingBulk={isProcessingBulk}
        isSavingAll={isSavingAll}
        savedCount={savedCount}
        totalToSave={totalToSave}
        onFilesSelected={handleFilesSelect}
        onProcessAll={processAllReceipts}
        onSaveAll={saveAllReceipts}
        onReset={handleResetForm}
      />

      {/* Processing Queue */}
      <ReceiptProcessingQueue
        processedReceipts={processedReceipts}
        isProcessingBulk={isProcessingBulk}
        onRemoveReceipt={removeReceipt}
        onUpdateReceiptData={updateReceiptData}
      />

      {/* Saved Receipts List */}
      <ReceiptList
        receipts={receipts}
        isLoading={isLoading}
        locale={locale}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        isExporting={isExporting}
        onExportExcel={handleExportExcel}
        onExportGoogleSheets={handleExportGoogleSheets}
        onEditReceipt={handleEditReceipt}
        onDeleteReceipt={handleDeleteReceipt}
        onPostExpense={handlePostExpense}
        isDeletePending={mutations.deleteMutation.isPending}
      />

      {/* Delete Confirmation Dialog (replaces window.confirm) */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Expense"
        description="Are you sure you want to delete this expense? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={confirmDeleteReceipt}
      />

      {/* Edit Dialog */}
      <ReceiptEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        receipt={editingReceipt}
        onSubmit={handleEditSubmit}
        isPending={mutations.editMutation.isPending}
      />

      {/* Post Expense Dialog */}
      <ReceiptPostDialog
        open={postDialogOpen}
        onOpenChange={setPostDialogOpen}
        receipt={postingReceipt}
        accounts={accounts}
        locale={locale}
        isPending={mutations.postExpenseMutation.isPending}
        onSubmit={(params) => mutations.postExpenseMutation.mutate(params)}
        onCreateAccount={handleCreateAccount}
      />

      {/* Create Account Dialog */}
      <CreateAccountDialog
        open={createAccountDialogOpen}
        onOpenChange={setCreateAccountDialogOpen}
        accountType={newAccountType}
        onSubmit={(data) => mutations.createAccountMutation.mutate(data)}
        isPending={mutations.createAccountMutation.isPending}
      />

      {/* Manual Expense Dialog */}
      <ManualExpenseDialog
        open={manualExpenseDialogOpen}
        onOpenChange={setManualExpenseDialogOpen}
        onSubmit={handleManualExpenseSubmit}
        isPending={mutations.manualExpenseMutation.isPending}
      />

      {/* Similar Transaction Warning */}
      <SimilarTransactionWarning
        open={similarWarningOpen}
        onOpenChange={setSimilarWarningOpen}
        similarTransactions={similarTransactions}
        locale={locale}
        onCancel={handleCancelSimilarWarning}
        onSaveAnyway={handleSaveAnyway}
      />
    </div>
  );
}
