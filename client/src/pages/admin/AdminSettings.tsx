import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Save, Loader2 } from 'lucide-react';
import type { AdminSetting } from '@shared/schema';

interface AdminSettingsProps {
  settings: AdminSetting[];
  settingsLoading: boolean;
}

export function AdminSettings({ settings, settingsLoading }: AdminSettingsProps) {
  const { toast } = useToast();

  const [systemSettings, setSystemSettings] = useState({
    defaultCurrency: 'AED',
    defaultVatRate: '5',
    freeAiCredits: '50',
    trialPeriod: '14',
    aiCategorization: true,
    ocrScanning: true,
    whatsappIntegration: false,
    smartAssistant: true,
    referralProgram: true,
    supportEmail: '',
    fromEmail: '',
    sendWelcomeEmail: true,
    paymentReminders: true,
  });

  useEffect(() => {
    if (settings.length > 0) {
      const settingsMap = settings.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {} as Record<string, string>);

      setSystemSettings(prev => ({
        ...prev,
        defaultCurrency: settingsMap['system.defaultCurrency'] || prev.defaultCurrency,
        defaultVatRate: settingsMap['system.defaultVatRate'] || prev.defaultVatRate,
        freeAiCredits: settingsMap['system.freeAiCredits'] || prev.freeAiCredits,
        trialPeriod: settingsMap['system.trialPeriod'] || prev.trialPeriod,
        aiCategorization: 'feature.aiCategorization' in settingsMap
          ? settingsMap['feature.aiCategorization'] === 'true'
          : prev.aiCategorization,
        ocrScanning: 'feature.ocrScanning' in settingsMap
          ? settingsMap['feature.ocrScanning'] === 'true'
          : prev.ocrScanning,
        whatsappIntegration: 'feature.whatsappIntegration' in settingsMap
          ? settingsMap['feature.whatsappIntegration'] === 'true'
          : prev.whatsappIntegration,
        smartAssistant: 'feature.smartAssistant' in settingsMap
          ? settingsMap['feature.smartAssistant'] === 'true'
          : prev.smartAssistant,
        referralProgram: 'feature.referralProgram' in settingsMap
          ? settingsMap['feature.referralProgram'] === 'true'
          : prev.referralProgram,
        supportEmail: settingsMap['notification.supportEmail'] || prev.supportEmail,
        fromEmail: settingsMap['notification.fromEmail'] || prev.fromEmail,
        sendWelcomeEmail: 'notification.sendWelcomeEmail' in settingsMap
          ? settingsMap['notification.sendWelcomeEmail'] === 'true'
          : prev.sendWelcomeEmail,
        paymentReminders: 'notification.paymentReminders' in settingsMap
          ? settingsMap['notification.paymentReminders'] === 'true'
          : prev.paymentReminders,
      }));
    }
  }, [settings]);

  const saveSystemSettingsMutation = useMutation({
    mutationFn: async (settingsToSave: typeof systemSettings) => {
      const settingsArr = [
        { key: 'system.defaultCurrency', value: settingsToSave.defaultCurrency },
        { key: 'system.defaultVatRate', value: settingsToSave.defaultVatRate },
        { key: 'system.freeAiCredits', value: settingsToSave.freeAiCredits },
        { key: 'system.trialPeriod', value: settingsToSave.trialPeriod },
        { key: 'feature.aiCategorization', value: settingsToSave.aiCategorization.toString() },
        { key: 'feature.ocrScanning', value: settingsToSave.ocrScanning.toString() },
        { key: 'feature.whatsappIntegration', value: settingsToSave.whatsappIntegration.toString() },
        { key: 'feature.smartAssistant', value: settingsToSave.smartAssistant.toString() },
        { key: 'feature.referralProgram', value: settingsToSave.referralProgram.toString() },
        { key: 'notification.supportEmail', value: settingsToSave.supportEmail },
        { key: 'notification.fromEmail', value: settingsToSave.fromEmail },
        { key: 'notification.sendWelcomeEmail', value: settingsToSave.sendWelcomeEmail.toString() },
        { key: 'notification.paymentReminders', value: settingsToSave.paymentReminders.toString() },
      ];
      await Promise.all(
        settingsArr.map(setting => apiRequest('PUT', '/api/admin/settings', setting))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({ title: 'System settings saved successfully' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to save settings',
        description: error?.message || 'Please try again'
      });
    },
  });

  if (settingsLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Feature Toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feature Toggles</CardTitle>
          <CardDescription>Enable or disable platform features</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">AI Transaction Categorization</p>
              <p className="text-sm text-muted-foreground">Use AI to automatically categorize transactions</p>
            </div>
            <Switch
              checked={systemSettings.aiCategorization}
              onCheckedChange={(checked) => setSystemSettings(prev => ({ ...prev, aiCategorization: checked }))}
              data-testid="switch-ai-categorization"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">OCR Receipt Scanning</p>
              <p className="text-sm text-muted-foreground">Extract data from receipt images</p>
            </div>
            <Switch
              checked={systemSettings.ocrScanning}
              onCheckedChange={(checked) => setSystemSettings(prev => ({ ...prev, ocrScanning: checked }))}
              data-testid="switch-ocr-scanning"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">WhatsApp Integration</p>
              <p className="text-sm text-muted-foreground">Allow WhatsApp receipt ingestion</p>
            </div>
            <Switch
              checked={systemSettings.whatsappIntegration}
              onCheckedChange={(checked) => setSystemSettings(prev => ({ ...prev, whatsappIntegration: checked }))}
              data-testid="switch-whatsapp-integration"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Smart Assistant</p>
              <p className="text-sm text-muted-foreground">Natural language financial queries</p>
            </div>
            <Switch
              checked={systemSettings.smartAssistant}
              onCheckedChange={(checked) => setSystemSettings(prev => ({ ...prev, smartAssistant: checked }))}
              data-testid="switch-smart-assistant"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Referral Program</p>
              <p className="text-sm text-muted-foreground">Enable user referral rewards</p>
            </div>
            <Switch
              checked={systemSettings.referralProgram}
              onCheckedChange={(checked) => setSystemSettings(prev => ({ ...prev, referralProgram: checked }))}
              data-testid="switch-referral-program"
            />
          </div>
        </CardContent>
      </Card>

      {/* System Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Settings</CardTitle>
          <CardDescription>Configure platform-wide settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default Currency</Label>
              <Select
                value={systemSettings.defaultCurrency}
                onValueChange={(value) => setSystemSettings(prev => ({ ...prev, defaultCurrency: value }))}
              >
                <SelectTrigger data-testid="select-default-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AED">AED (UAE Dirham)</SelectItem>
                  <SelectItem value="USD">USD (US Dollar)</SelectItem>
                  <SelectItem value="EUR">EUR (Euro)</SelectItem>
                  <SelectItem value="GBP">GBP (British Pound)</SelectItem>
                  <SelectItem value="SAR">SAR (Saudi Riyal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default VAT Rate (%)</Label>
              <Input
                type="number"
                value={systemSettings.defaultVatRate}
                onChange={(e) => setSystemSettings(prev => ({ ...prev, defaultVatRate: e.target.value }))}
                data-testid="input-vat-rate"
              />
            </div>
            <div className="space-y-2">
              <Label>AI Credits Per Free User</Label>
              <Input
                type="number"
                value={systemSettings.freeAiCredits}
                onChange={(e) => setSystemSettings(prev => ({ ...prev, freeAiCredits: e.target.value }))}
                data-testid="input-free-ai-credits"
              />
            </div>
            <div className="space-y-2">
              <Label>Trial Period (Days)</Label>
              <Input
                type="number"
                value={systemSettings.trialPeriod}
                onChange={(e) => setSystemSettings(prev => ({ ...prev, trialPeriod: e.target.value }))}
                data-testid="input-trial-period"
              />
            </div>
          </div>
          <Button
            className="mt-4"
            data-testid="button-save-system-settings"
            onClick={() => saveSystemSettingsMutation.mutate(systemSettings)}
            disabled={saveSystemSettingsMutation.isPending}
          >
            {saveSystemSettingsMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Email/Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification Settings</CardTitle>
          <CardDescription>Configure email and notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Support Email</Label>
            <Input
              type="email"
              placeholder="support@muhasib.ai"
              value={systemSettings.supportEmail}
              onChange={(e) => setSystemSettings(prev => ({ ...prev, supportEmail: e.target.value }))}
              data-testid="input-support-email"
            />
          </div>
          <div className="space-y-2">
            <Label>From Email (Notifications)</Label>
            <Input
              type="email"
              placeholder="noreply@muhasib.ai"
              value={systemSettings.fromEmail}
              onChange={(e) => setSystemSettings(prev => ({ ...prev, fromEmail: e.target.value }))}
              data-testid="input-from-email"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Send Welcome Email</p>
              <p className="text-sm text-muted-foreground">Email new users upon registration</p>
            </div>
            <Switch
              checked={systemSettings.sendWelcomeEmail}
              onCheckedChange={(checked) => setSystemSettings(prev => ({ ...prev, sendWelcomeEmail: checked }))}
              data-testid="switch-welcome-email"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Payment Reminder Emails</p>
              <p className="text-sm text-muted-foreground">Send late payment reminders</p>
            </div>
            <Switch
              checked={systemSettings.paymentReminders}
              onCheckedChange={(checked) => setSystemSettings(prev => ({ ...prev, paymentReminders: checked }))}
              data-testid="switch-payment-reminders"
            />
          </div>
          <Button
            className="mt-4"
            onClick={() => saveSystemSettingsMutation.mutate(systemSettings)}
            disabled={saveSystemSettingsMutation.isPending}
          >
            {saveSystemSettingsMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Notification Settings
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
