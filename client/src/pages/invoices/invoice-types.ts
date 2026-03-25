import { z } from 'zod';
import type { Invoice, Company, CustomerContact } from '@shared/schema';

export const invoiceLineSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.coerce.number().min(0.01, 'Quantity must be positive'),
  unitPrice: z.coerce.number().min(0, 'Price must be positive'),
  vatRate: z.coerce.number().default(0.05),
});

export const invoiceSchema = z.object({
  companyId: z.string().uuid(),
  number: z.string().min(1, 'Invoice number is required'),
  customerName: z.string().min(1, 'Customer name is required'),
  customerTrn: z.string().optional(),
  date: z.date(),
  currency: z.string().default('AED'),
  lines: z.array(invoiceLineSchema).min(1, 'At least one line item is required'),
});

export const invoiceBrandingSchema = z.object({
  invoiceShowLogo: z.boolean().default(true),
  invoiceShowAddress: z.boolean().default(true),
  invoiceShowPhone: z.boolean().default(true),
  invoiceShowEmail: z.boolean().default(true),
  invoiceShowWebsite: z.boolean().default(false),
  invoiceCustomTitle: z.string().transform(val => val || undefined).optional(),
  invoiceFooterNote: z.string().transform(val => val || undefined).optional(),
});

export type InvoiceFormData = z.infer<typeof invoiceSchema>;
export type InvoiceBrandingFormData = z.infer<typeof invoiceBrandingSchema>;

export type { Invoice, Company, CustomerContact };
