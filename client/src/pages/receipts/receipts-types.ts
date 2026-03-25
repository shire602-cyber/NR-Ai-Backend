import { z } from 'zod';

export interface ExtractedData {
  merchant?: string;
  date?: string;
  total?: number;
  vatAmount?: number;
  currency?: string;
  rawText: string;
  category?: string;
  confidence?: number;
}

export interface ProcessedReceipt {
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'completed' | 'saved' | 'error' | 'save_error';
  progress: number;
  data?: ExtractedData;
  error?: string;
}

export const receiptSchema = z.object({
  merchant: z.string().min(1, 'Merchant name is required'),
  date: z.string().min(1, 'Date is required'),
  amount: z.coerce.number().min(0, 'Amount must be positive'),
  vatAmount: z.coerce.number().nullable(),
  category: z.string().nullable(),
  currency: z.string().default('AED'),
});

export type ReceiptFormData = z.infer<typeof receiptSchema>;
