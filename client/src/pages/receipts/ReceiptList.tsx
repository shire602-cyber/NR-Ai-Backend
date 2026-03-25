import { useMemo } from 'react';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DateRangeFilter, type DateRange } from '@/components/DateRangeFilter';
import { FileText, Download, FileSpreadsheet, CheckCircle2, Edit, Trash2 } from 'lucide-react';
import { SiGooglesheets } from 'react-icons/si';
import { formatCurrency } from '@/lib/format';

interface ReceiptListProps {
  receipts: any[] | undefined;
  isLoading: boolean;
  locale: string;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  isExporting: boolean;
  onExportExcel: () => void;
  onExportGoogleSheets: () => void;
  onEditReceipt: (receipt: any) => void;
  onDeleteReceipt: (receipt: any) => void;
  onPostExpense: (receipt: any) => void;
  isDeletePending: boolean;
}

export function ReceiptList({
  receipts,
  isLoading,
  locale,
  dateRange,
  onDateRangeChange,
  isExporting,
  onExportExcel,
  onExportGoogleSheets,
  onEditReceipt,
  onDeleteReceipt,
  onPostExpense,
  isDeletePending,
}: ReceiptListProps) {
  const filteredReceipts = useMemo(() => {
    if (!receipts || receipts.length === 0) return [];
    if (!dateRange.from && !dateRange.to) return receipts;

    const fromDate = dateRange.from ? startOfDay(dateRange.from) : null;
    const toDate = dateRange.to ? endOfDay(dateRange.to) : null;

    return receipts.filter((receipt: any) => {
      if (!receipt.date) return false;

      const receiptDate = typeof receipt.date === 'string'
        ? parseISO(receipt.date)
        : new Date(receipt.date);

      if (fromDate && toDate) {
        return isWithinInterval(receiptDate, { start: fromDate, end: toDate });
      }
      if (fromDate) {
        return receiptDate >= fromDate;
      }
      if (toDate) {
        return receiptDate <= toDate;
      }
      return true;
    });
  }, [receipts, dateRange.from, dateRange.to]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle>Recent Expenses</CardTitle>
            <CardDescription>Previously scanned and saved expenses</CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={isExporting} data-testid="button-export-expenses">
                <Download className="w-4 h-4 mr-2" />
                {isExporting ? 'Exporting...' : 'Export'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExportExcel} data-testid="menu-export-expenses-excel">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportGoogleSheets} data-testid="menu-export-expenses-sheets">
                <SiGooglesheets className="w-4 h-4 mr-2" />
                Export to Google Sheets
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap pb-4 border-b">
          <span className="text-sm font-medium">Filter by date:</span>
          <DateRangeFilter
            dateRange={dateRange}
            onDateRangeChange={onDateRangeChange}
          />
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredReceipts && filteredReceipts.length > 0 ? (
          <div className="space-y-2">
            {filteredReceipts.map((receipt: any) => (
              <div
                key={receipt.id}
                className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                data-testid={`receipt-${receipt.id}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium">{receipt.merchant || 'Unknown Merchant'}</p>
                    <p className="text-sm text-muted-foreground">{receipt.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-mono font-semibold">
                      {formatCurrency(receipt.amount || 0, 'AED', locale)}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline">
                        {receipt.category || 'Uncategorized'}
                      </Badge>
                      {receipt.posted && (
                        <Badge variant="default" className="bg-green-600">
                          Posted
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!receipt.posted && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => onPostExpense(receipt)}
                        data-testid={`button-post-receipt-${receipt.id}`}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Post
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditReceipt(receipt)}
                      data-testid={`button-edit-receipt-${receipt.id}`}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteReceipt(receipt)}
                      disabled={isDeletePending}
                      aria-label="Delete receipt"
                      data-testid={`button-delete-receipt-${receipt.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            No receipts yet. Upload your first receipt above!
          </p>
        )}
      </CardContent>
    </Card>
  );
}
