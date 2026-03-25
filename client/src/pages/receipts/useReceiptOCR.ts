import { useState, useCallback } from 'react';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';
import type { ExtractedData, ProcessedReceipt } from './receipts-types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function parseReceiptText(text: string): ExtractedData {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  let merchant = '';
  let date = '';
  let total = 0;
  let vatAmount = 0;

  // Extract merchant (usually first or second non-empty line)
  if (lines.length > 0) {
    merchant = lines[0].trim();
    if (merchant.length < 3 && lines.length > 1) {
      merchant = lines[1].trim();
    }
  }

  // Extract total - try multiple patterns
  const totalPatterns = [
    /(?:total|amount|grand total|net total)[:\s]*(?:AED|aed|dhs)?\s*([\d,]+\.?\d*)/i,
    /(?:AED|aed|dhs)[:\s]*([\d,]+\.?\d*)[\s]*(?:total)?/i,
    /([\d,]+\.?\d*)[:\s]*(?:AED|aed|dhs)/i,
  ];

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (value > 0 && value < 1000000) {
        total = value;
        break;
      }
    }
  }

  // Extract VAT
  const vatPatterns = [
    /(?:vat|tax|gst)[:\s]*(?:AED|aed|dhs)?\s*([\d,]+\.?\d*)/i,
    /(?:5%|5\s*%)[:\s]*(?:AED|aed|dhs)?\s*([\d,]+\.?\d*)/i,
  ];

  for (const pattern of vatPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (value > 0 && value < total) {
        vatAmount = value;
        break;
      }
    }
  }

  // If no VAT found but we have a total, check subtotal
  if (total > 0 && vatAmount === 0) {
    const subtotalPattern = /(?:subtotal|sub total|sub-total)[:\s]*(?:AED|aed|dhs)?\s*([\d,]+\.?\d*)/i;
    const subtotalMatch = text.match(subtotalPattern);
    if (subtotalMatch) {
      const subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ''));
      vatAmount = total - subtotal;
    }
  }

  // Extract date
  const datePatterns = [
    /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/,
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}/,
    /\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4}/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      date = match[0];
      break;
    }
  }

  if (!date) {
    date = new Date().toISOString().split('T')[0];
  }

  return {
    merchant: merchant || 'Unknown Merchant',
    date,
    total,
    vatAmount,
    currency: 'AED',
    rawText: text,
    confidence: 0.85,
  };
}

async function categorizeWithAI(companyId: string, data: ExtractedData): Promise<string | null> {
  try {
    const response = await fetch(apiUrl('/api/ai/categorize'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        companyId,
        description: `${data.merchant || 'Unknown'} - ${data.total} ${data.currency}`,
        amount: data.total,
        currency: data.currency || 'AED',
      }),
    });

    if (response.ok) {
      const result = await response.json();
      return result.suggestedAccountName || result.category;
    }
  } catch (error) {
    console.error('AI categorization failed:', error);
  }
  return null;
}

async function convertPdfToImage(file: File): Promise<{ blob: Blob; preview: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const scale = 2;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({
    canvasContext: context,
    viewport: viewport,
    canvas: canvas,
  } as any).promise;

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const preview = canvas.toDataURL('image/png');
      resolve({ blob: blob!, preview });
    }, 'image/png');
  });
}

export function useReceiptOCR(companyId: string | undefined) {
  const { toast } = useToast();
  const [processedReceipts, setProcessedReceipts] = useState<ProcessedReceipt[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  const handleFilesSelect = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';

      if (!isImage && !isPdf) {
        toast({
          title: 'Invalid file',
          description: `${file.name} must be an image or PDF file`,
          variant: 'destructive',
        });
        continue;
      }

      if (isPdf) {
        try {
          toast({
            title: 'Converting PDF',
            description: `Processing first page of ${file.name}...`,
          });

          const { blob, preview } = await convertPdfToImage(file);
          const imageFile = new File([blob], file.name.replace('.pdf', '.png'), { type: 'image/png' });

          setProcessedReceipts((prev) => [
            ...prev,
            { file: imageFile, preview, status: 'pending', progress: 0 },
          ]);

          toast({
            title: 'PDF converted',
            description: `${file.name} converted successfully. Only the first page is processed.`,
          });
        } catch (error: any) {
          console.error('PDF conversion error:', error);
          toast({
            title: 'PDF conversion failed',
            description: `Could not convert ${file.name}. Please upload an image instead (JPG, PNG, HEIC).`,
            variant: 'destructive',
          });
        }
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const preview = e.target?.result as string;
          setProcessedReceipts((prev) => [
            ...prev,
            { file, preview, status: 'pending', progress: 0 },
          ]);
        };
        reader.readAsDataURL(file);
      }
    }
  }, [toast]);

  const processReceipt = useCallback(async (index: number) => {
    const receipt = processedReceipts[index];
    if (!receipt) return;

    setProcessedReceipts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status: 'processing', progress: 0 };
      return updated;
    });

    try {
      const result = await Tesseract.recognize(receipt.file, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProcessedReceipts((prev) => {
              const updated = [...prev];
              updated[index] = { ...updated[index], progress: Math.round(m.progress * 100) };
              return updated;
            });
          }
        },
      });

      const text = result.data.text;

      if (!text || text.trim().length < 10) {
        throw new Error('Could not extract readable text from image. Try a clearer photo.');
      }

      const parsed = parseReceiptText(text);

      if (!parsed.merchant && !parsed.total) {
        parsed.merchant = 'Unknown Merchant';
        parsed.total = 0;
      }

      if ((parsed.merchant || parsed.total) && companyId) {
        try {
          const category = await categorizeWithAI(companyId, parsed);
          if (category) {
            parsed.category = category;
          }
        } catch (aiError) {
          console.error('AI categorization failed, continuing without it:', aiError);
        }
      }

      setProcessedReceipts((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status: 'completed', data: parsed, progress: 100 };
        return updated;
      });

    } catch (error: any) {
      console.error('OCR processing error:', error);
      setProcessedReceipts((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          status: 'error',
          error: error?.message || 'OCR processing failed. Try a clearer image.',
          progress: 0,
        };
        return updated;
      });
    }
  }, [processedReceipts, companyId]);

  const processAllReceipts = useCallback(async () => {
    setIsProcessingBulk(true);

    for (let i = 0; i < processedReceipts.length; i++) {
      if (processedReceipts[i].status === 'pending') {
        await processReceipt(i);
      }
    }

    setIsProcessingBulk(false);
    toast({
      title: 'Processing Complete',
      description: `Processed ${processedReceipts.length} receipt(s)`,
    });
  }, [processedReceipts, processReceipt, toast]);

  const removeReceipt = useCallback((index: number) => {
    setProcessedReceipts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateReceiptData = useCallback((index: number, updates: Partial<ExtractedData>) => {
    setProcessedReceipts((prev) => {
      const updated = [...prev];
      if (updated[index].data) {
        updated[index] = {
          ...updated[index],
          data: { ...updated[index].data!, ...updates },
        };
      }
      return updated;
    });
  }, []);

  const resetForm = useCallback(() => {
    setProcessedReceipts([]);
    setIsProcessingBulk(false);
  }, []);

  return {
    processedReceipts,
    setProcessedReceipts,
    isProcessingBulk,
    handleFilesSelect,
    processAllReceipts,
    removeReceipt,
    updateReceiptData,
    resetForm,
  };
}
