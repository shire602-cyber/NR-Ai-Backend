import { createLogger } from '../config/logger';

const log = createLogger('asp-einvoice');

/**
 * ASP (Accredited Service Provider) configuration for Peppol e-invoicing.
 * Provider-agnostic — works with any ASP that accepts UBL 2.1 XML via REST.
 */
export interface ASPConfig {
  provider: 'peppol_access_point' | 'storecove' | 'pagero' | 'basware' | 'custom';
  apiUrl: string;
  apiKey: string;
  senderId: string; // Peppol participant ID
  testMode: boolean;
}

export interface TransmissionResult {
  success: boolean;
  transmissionId: string;
  timestamp: string;
  recipientId?: string;
  status: 'sent' | 'delivered' | 'failed' | 'pending';
  errorMessage?: string;
  rawResponse?: unknown;
}

export interface EInvoiceSubmission {
  invoiceId: string;
  companyId: string;
  xml: string;
  recipientId?: string;       // Peppol ID of receiver (buyer)
  recipientScheme?: string;   // e.g., 'AE:TRN' for UAE TRN-based routing
}

export const aspEInvoiceService = {
  /**
   * Build ASP config from environment variables.
   * Returns null when the ASP integration is not configured.
   */
  getConfig(): ASPConfig | null {
    const provider = process.env.ASP_PROVIDER;
    const apiUrl = process.env.ASP_API_URL;
    const apiKey = process.env.ASP_API_KEY;
    const senderId = process.env.ASP_SENDER_ID;

    if (!provider || !apiUrl || !apiKey) return null;

    return {
      provider: provider as ASPConfig['provider'],
      apiUrl,
      apiKey,
      senderId: senderId || '',
      testMode: process.env.ASP_TEST_MODE === 'true',
    };
  },

  /**
   * Validate UBL 2.1 XML against PINT AE requirements before submission.
   */
  async validateXml(xml: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Required UBL 2.1 elements
    if (!xml.includes('cbc:UBLVersionID'))          errors.push('Missing UBLVersionID');
    if (!xml.includes('cbc:CustomizationID'))       errors.push('Missing CustomizationID');
    if (!xml.includes('cbc:ProfileID'))             errors.push('Missing ProfileID');
    if (!xml.includes('cac:AccountingSupplierParty')) errors.push('Missing AccountingSupplierParty');
    if (!xml.includes('cac:AccountingCustomerParty')) errors.push('Missing AccountingCustomerParty');
    if (!xml.includes('cac:TaxTotal'))              errors.push('Missing TaxTotal');
    if (!xml.includes('cac:LegalMonetaryTotal'))    errors.push('Missing LegalMonetaryTotal');
    if (!xml.includes('cac:InvoiceLine'))           errors.push('Missing InvoiceLine');

    // PINT AE specific references
    if (!xml.includes('urn:cen.eu:en16931:2017'))   errors.push('Missing EN16931 customization reference');
    if (!xml.includes('urn:fdc:peppol.eu'))         errors.push('Missing Peppol profile reference');

    // UAE country code
    if (!xml.includes('>AE<'))                      errors.push('Missing UAE country code (AE)');

    return { valid: errors.length === 0, errors };
  },

  /**
   * Submit an invoice to the configured ASP.
   * Validates XML first, then transmits via the ASP REST API.
   */
  async submitInvoice(submission: EInvoiceSubmission): Promise<TransmissionResult> {
    const config = this.getConfig();
    if (!config) {
      return {
        success: false,
        transmissionId: '',
        timestamp: new Date().toISOString(),
        status: 'failed',
        errorMessage: 'ASP not configured. Set ASP_PROVIDER, ASP_API_URL, ASP_API_KEY environment variables.',
      };
    }

    // Validate XML first
    const validation = await this.validateXml(submission.xml);
    if (!validation.valid) {
      return {
        success: false,
        transmissionId: '',
        timestamp: new Date().toISOString(),
        status: 'failed',
        errorMessage: `XML validation failed: ${validation.errors.join(', ')}`,
      };
    }

    try {
      log.info({ invoiceId: submission.invoiceId, provider: config.provider, testMode: config.testMode }, 'Submitting invoice to ASP');

      const response = await fetch(`${config.apiUrl}/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Authorization': `Bearer ${config.apiKey}`,
          'X-Sender-ID': config.senderId,
          ...(submission.recipientId ? { 'X-Recipient-ID': submission.recipientId } : {}),
          ...(submission.recipientScheme ? { 'X-Recipient-Scheme': submission.recipientScheme } : {}),
          ...(config.testMode ? { 'X-Test-Mode': 'true' } : {}),
        },
        body: submission.xml,
      });

      const responseText = await response.text();
      let responseData: Record<string, unknown>;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      if (response.ok) {
        log.info({ invoiceId: submission.invoiceId, status: response.status }, 'Invoice submitted to ASP successfully');
        return {
          success: true,
          transmissionId: (responseData.transmissionId as string) || (responseData.id as string) || `TX-${Date.now()}`,
          timestamp: new Date().toISOString(),
          recipientId: submission.recipientId,
          status: 'sent',
          rawResponse: responseData,
        };
      } else {
        log.warn({ invoiceId: submission.invoiceId, status: response.status, body: responseData }, 'ASP rejected invoice');
        return {
          success: false,
          transmissionId: '',
          timestamp: new Date().toISOString(),
          status: 'failed',
          errorMessage: (responseData.message as string) || (responseData.error as string) || `ASP returned ${response.status}`,
          rawResponse: responseData,
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error connecting to ASP';
      log.error({ invoiceId: submission.invoiceId, error: message }, 'Failed to connect to ASP');
      return {
        success: false,
        transmissionId: '',
        timestamp: new Date().toISOString(),
        status: 'failed',
        errorMessage: message,
      };
    }
  },

  /**
   * Poll the ASP for the current delivery status of a previously submitted invoice.
   */
  async checkStatus(transmissionId: string): Promise<TransmissionResult> {
    const config = this.getConfig();
    if (!config) {
      return {
        success: false,
        transmissionId,
        timestamp: new Date().toISOString(),
        status: 'failed',
        errorMessage: 'ASP not configured',
      };
    }

    try {
      const response = await fetch(`${config.apiUrl}/invoices/${transmissionId}/status`, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      });
      const data = await response.json() as Record<string, unknown>;
      return {
        success: true,
        transmissionId,
        timestamp: new Date().toISOString(),
        status: (data.status as TransmissionResult['status']) || 'pending',
        rawResponse: data,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to check status';
      return {
        success: false,
        transmissionId,
        timestamp: new Date().toISOString(),
        status: 'failed',
        errorMessage: message,
      };
    }
  },
};
