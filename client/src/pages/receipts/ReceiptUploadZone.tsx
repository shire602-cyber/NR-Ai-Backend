import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Camera, CheckCircle2, Sparkles, Loader2, Trash2 } from 'lucide-react';
import type { ProcessedReceipt } from './receipts-types';

interface ReceiptUploadZoneProps {
  processedReceipts: ProcessedReceipt[];
  isProcessingBulk: boolean;
  isSavingAll: boolean;
  savedCount: number;
  totalToSave: number;
  onFilesSelected: (files: FileList | File[]) => void;
  onProcessAll: () => void;
  onSaveAll: () => void;
  onReset: () => void;
}

export function ReceiptUploadZone({
  processedReceipts,
  isProcessingBulk,
  isSavingAll,
  savedCount,
  totalToSave,
  onFilesSelected,
  onProcessAll,
  onSaveAll,
  onReset,
}: ReceiptUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const pendingCount = processedReceipts.filter((r) => r.status === 'pending').length;
  const processingCount = processedReceipts.filter((r) => r.status === 'processing').length;
  const completedCount = processedReceipts.filter((r) => r.status === 'completed').length;
  const localSavedCount = processedReceipts.filter((r) => r.status === 'saved').length;
  const errorCount = processedReceipts.filter((r) => r.status === 'error').length;
  const saveErrorCount = processedReceipts.filter((r) => r.status === 'save_error').length;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFilesSelected(files);
    }
  }, [onFilesSelected]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Upload Receipts
        </CardTitle>
        <CardDescription>
          Drag & drop receipt images or click to browse (supports bulk upload)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-all
            ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}
            ${processedReceipts.length > 0 ? 'border-green-500 bg-green-500/5' : ''}
            hover:border-primary hover:bg-accent/50 cursor-pointer
          `}
          onClick={() => document.getElementById('file-input')?.click()}
          data-testid="drop-zone"
        >
          <input
            id="file-input"
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) onFilesSelected(files);
            }}
            data-testid="input-file"
          />

          {processedReceipts.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <span>{processedReceipts.length} image(s) loaded</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Click or drop more images to add them
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-primary" />
                </div>
              </div>
              <div>
                <p className="text-lg font-medium">Drop your receipts here</p>
                <p className="text-sm text-muted-foreground mt-1">
                  or click to browse files (multiple selection supported)
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Supports: JPG, PNG, HEIC, PDF - Bulk upload enabled
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {processedReceipts.length > 0 && (
          <div className="flex gap-2">
            <Button
              onClick={onProcessAll}
              disabled={isProcessingBulk || pendingCount === 0}
              className="flex-1"
              size="lg"
              data-testid="button-process-all"
            >
              {isProcessingBulk ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Process All Receipts ({pendingCount})
                </>
              )}
            </Button>

            <Button
              onClick={onSaveAll}
              disabled={completedCount === 0 || isSavingAll || isProcessingBulk}
              className="flex-1"
              size="lg"
              data-testid="button-save-all"
            >
              {isSavingAll ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving ({savedCount}/{totalToSave})...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Save All ({completedCount})
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={onReset}
              disabled={isProcessingBulk}
              aria-label="Clear all receipts"
              data-testid="button-reset"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Status Summary */}
        {processedReceipts.length > 0 && (
          <div className="flex flex-wrap gap-2 text-sm">
            {pendingCount > 0 && (
              <Badge variant="outline">{pendingCount} pending</Badge>
            )}
            {processingCount > 0 && (
              <Badge variant="outline">{processingCount} processing</Badge>
            )}
            {completedCount > 0 && (
              <Badge variant="outline" className="bg-green-500/10 border-green-500">
                {completedCount} ready to save
              </Badge>
            )}
            {localSavedCount > 0 && (
              <Badge variant="outline" className="bg-blue-500/10 border-blue-500">
                {localSavedCount} saved
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="outline" className="bg-red-500/10 border-red-500">
                {errorCount} OCR errors
              </Badge>
            )}
            {saveErrorCount > 0 && (
              <Badge variant="outline" className="bg-orange-500/10 border-orange-500">
                {saveErrorCount} save failed
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
