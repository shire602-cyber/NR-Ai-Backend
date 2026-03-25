import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Save, Info } from 'lucide-react';
import { invoiceBrandingSchema, type InvoiceBrandingFormData, type Company } from './invoice-types';

interface InvoiceBrandingTabProps {
  company: Company | undefined;
  isLoading: boolean;
  isPending: boolean;
  onSubmit: (data: InvoiceBrandingFormData) => void;
}

export function InvoiceBrandingTab({ company, isLoading, isPending, onSubmit }: InvoiceBrandingTabProps) {
  const isVATRegistered = company?.trnVatNumber && company?.trnVatNumber.length > 0;

  const brandingForm = useForm<InvoiceBrandingFormData>({
    resolver: zodResolver(invoiceBrandingSchema),
    defaultValues: {
      invoiceShowLogo: true,
      invoiceShowAddress: true,
      invoiceShowPhone: true,
      invoiceShowEmail: true,
      invoiceShowWebsite: false,
      invoiceCustomTitle: '',
      invoiceFooterNote: '',
    },
  });

  useEffect(() => {
    if (company) {
      brandingForm.reset({
        invoiceShowLogo: company.invoiceShowLogo ?? true,
        invoiceShowAddress: company.invoiceShowAddress ?? true,
        invoiceShowPhone: company.invoiceShowPhone ?? true,
        invoiceShowEmail: company.invoiceShowEmail ?? true,
        invoiceShowWebsite: company.invoiceShowWebsite ?? false,
        invoiceCustomTitle: company.invoiceCustomTitle || '',
        invoiceFooterNote: company.invoiceFooterNote || '',
      });
    }
  }, [company, brandingForm]);

  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  if (!company) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Company not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {isVATRegistered && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Your company is VAT registered. All invoices will automatically display your TRN ({company.trnVatNumber})
            and be labeled as "Tax Invoice" to comply with UAE FTA requirements.
          </AlertDescription>
        </Alert>
      )}

      <Form {...brandingForm}>
        <form onSubmit={brandingForm.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Company Details Display
              </CardTitle>
              <CardDescription>
                Choose which company information to display on invoices
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={brandingForm.control}
                name="invoiceShowLogo"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Show Company Logo</FormLabel>
                      <FormDescription>
                        Display your company logo at the top of invoices
                        {!company.logoUrl && (
                          <span className="block text-xs text-warning mt-1">
                            Note: Set your logo in Company Profile first
                          </span>
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!company.logoUrl}
                        data-testid="switch-show-logo"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={brandingForm.control}
                name="invoiceShowAddress"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Show Business Address</FormLabel>
                      <FormDescription>
                        Display your business address on invoices
                        {!company.businessAddress && (
                          <span className="block text-xs text-warning mt-1">
                            Note: Set your address in Company Profile first
                          </span>
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!company.businessAddress}
                        data-testid="switch-show-address"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={brandingForm.control}
                name="invoiceShowPhone"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Show Phone Number</FormLabel>
                      <FormDescription>
                        Display your business phone number on invoices
                        {!company.contactPhone && (
                          <span className="block text-xs text-warning mt-1">
                            Note: Set your phone in Company Profile first
                          </span>
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!company.contactPhone}
                        data-testid="switch-show-phone"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={brandingForm.control}
                name="invoiceShowEmail"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Show Email Address</FormLabel>
                      <FormDescription>
                        Display your business email on invoices
                        {!company.contactEmail && (
                          <span className="block text-xs text-warning mt-1">
                            Note: Set your email in Company Profile first
                          </span>
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!company.contactEmail}
                        data-testid="switch-show-email"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={brandingForm.control}
                name="invoiceShowWebsite"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Show Website</FormLabel>
                      <FormDescription>
                        Display your website URL on invoices
                        {!company.websiteUrl && (
                          <span className="block text-xs text-warning mt-1">
                            Note: Set your website in Company Profile first
                          </span>
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!company.websiteUrl}
                        data-testid="switch-show-website"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice Customization</CardTitle>
              <CardDescription>
                Customize the appearance and text of your invoices
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={brandingForm.control}
                name="invoiceCustomTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={isVATRegistered ? "Tax Invoice (default)" : "Invoice (default)"}
                        {...field}
                        data-testid="input-invoice-title"
                      />
                    </FormControl>
                    <FormDescription>
                      {isVATRegistered
                        ? 'For VAT-registered companies, invoices default to "Tax Invoice". You can customize this, but it must comply with FTA regulations.'
                        : 'Custom title for your invoices. Leave blank to use "Invoice".'
                      }
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={brandingForm.control}
                name="invoiceFooterNote"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Footer Note</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Thank you for your business"
                        className="resize-none"
                        rows={3}
                        {...field}
                        data-testid="textarea-footer-note"
                      />
                    </FormControl>
                    <FormDescription>
                      Add a custom message at the bottom of your invoices (e.g., payment terms, thank you message)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isPending}
              data-testid="button-save-branding"
            >
              <Save className="w-4 h-4 mr-2" />
              {isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
