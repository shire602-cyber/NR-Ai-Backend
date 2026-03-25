import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, Loader2, Sparkles, X } from 'lucide-react';
import type { ExtractedData, ProcessedReceipt } from './receipts-types';

interface ReceiptProcessingQueueProps {
  processedReceipts: ProcessedReceipt[];
  isProcessingBulk: boolean;
  onRemoveReceipt: (index: number) => void;
  onUpdateReceiptData: (index: number, updates: Partial<ExtractedData>) => void;
}

export function ReceiptProcessingQueue({
  processedReceipts,
  isProcessingBulk,
  onRemoveReceipt,
  onUpdateReceiptData,
}: ReceiptProcessingQueueProps) {
  if (processedReceipts.length === 0) return null;

  return (
    <div className="space-y-3">
      {processedReceipts.map((receipt, index) => (
        <Card key={index} data-testid={`receipt-card-${index}`}>
          <CardContent className="p-4">
            <div className="flex gap-4">
              {/* Thumbnail */}
              <div className="relative">
                <img
                  src={receipt.preview}
                  alt={`Receipt ${index + 1}`}
                  className="w-24 h-24 object-cover rounded-lg border"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={() => onRemoveReceipt(index)}
                  disabled={isProcessingBulk}
                  data-testid={`button-remove-${index}`}
                  aria-label="Remove receipt"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              {/* Status and Data */}
              <div className="flex-1 space-y-3">
                {receipt.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Pending</Badge>
                    <p className="text-sm text-muted-foreground">
                      Ready to process
                    </p>
                  </div>
                )}

                {receipt.status === 'processing' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing with OCR...
                      </span>
                      <span>{receipt.progress}%</span>
                    </div>
                    <Progress value={receipt.progress} />
                  </div>
                )}

                {receipt.status === 'error' && (
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="w-4 h-4" />
                    <span className="text-sm">{receipt.error}</span>
                  </div>
                )}

                {receipt.status === 'saved' && (
                  <div className="flex items-center gap-2 text-primary">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Successfully saved to database</span>
                  </div>
                )}

                {receipt.status === 'save_error' && (
                  <div className="flex items-center gap-2 text-orange-600">
                    <XCircle className="w-4 h-4" />
                    <span className="text-sm">{receipt.error || 'Failed to save'}</span>
                  </div>
                )}

                {receipt.status === 'completed' && receipt.data && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Merchant</Label>
                      <Input
                        value={receipt.data.merchant || ''}
                        onChange={(e) =>
                          onUpdateReceiptData(index, { merchant: e.target.value })
                        }
                        className="h-8"
                        data-testid={`input-merchant-${index}`}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Date</Label>
                      <Input
                        type="date"
                        value={receipt.data.date || ''}
                        onChange={(e) =>
                          onUpdateReceiptData(index, { date: e.target.value })
                        }
                        className="h-8"
                        data-testid={`input-date-${index}`}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={receipt.data.total || ''}
                        onChange={(e) =>
                          onUpdateReceiptData(index, { total: parseFloat(e.target.value) })
                        }
                        className="h-8"
                        data-testid={`input-amount-${index}`}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Category</Label>
                      <Select
                        value={receipt.data.category}
                        onValueChange={(value) =>
                          onUpdateReceiptData(index, { category: value })
                        }
                      >
                        <SelectTrigger className="h-8" data-testid={`select-category-${index}`}>
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
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
                    </div>

                    {receipt.data.confidence && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">
                          OCR Confidence: {Math.round(receipt.data.confidence * 100)}%
                          {receipt.data.category && (
                            <Badge variant="secondary" className="ml-2">
                              <Sparkles className="w-2 h-2 mr-1" />
                              AI
                            </Badge>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
