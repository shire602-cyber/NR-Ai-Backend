import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Bell, CreditCard, FileText, RefreshCw, Save } from 'lucide-react';

export function AdminIntegrations() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-8 h-8 bg-[#6772e5] rounded flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-white" />
            </div>
            Stripe Integration
          </CardTitle>
          <CardDescription>Payment processing and subscription billing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Status</span>
            <Badge variant="outline" className="bg-warning/10 text-warning">Not Configured</Badge>
          </div>
          <div className="space-y-2">
            <Label>Stripe Public Key</Label>
            <Input type="password" placeholder="pk_live_..." data-testid="input-stripe-public" />
          </div>
          <div className="space-y-2">
            <Label>Stripe Secret Key</Label>
            <Input type="password" placeholder="sk_live_..." data-testid="input-stripe-secret" />
          </div>
          <Button className="w-full" data-testid="button-save-stripe">
            <Save className="w-4 h-4 mr-2" />
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-8 h-8 bg-[#25D366] rounded flex items-center justify-center">
              <Bell className="w-4 h-4 text-white" />
            </div>
            WhatsApp
          </CardTitle>
          <CardDescription>Send messages via your personal WhatsApp</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Status</span>
            <Badge variant="outline" className="bg-success/10 text-success">Active</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            WhatsApp messaging works through your personal WhatsApp — no API setup needed.
            Go to the WhatsApp page to send messages and invoice reminders directly.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.location.href = '/whatsapp'}
          >
            Go to WhatsApp
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            OpenAI Integration
          </CardTitle>
          <CardDescription>AI-powered features and categorization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Status</span>
            <Badge variant="outline" className="bg-success/10 text-success">Connected</Badge>
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input type="password" placeholder="sk-..." data-testid="input-openai-key" />
          </div>
          <div className="space-y-2">
            <Label>Model</Label>
            <Select defaultValue="gpt-4o">
              <SelectTrigger data-testid="select-openai-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o">GPT-4o (Recommended)</SelectItem>
                <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" data-testid="button-save-openai">
            <Save className="w-4 h-4 mr-2" />
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-8 h-8 bg-[#34A853] rounded flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            Google Sheets
          </CardTitle>
          <CardDescription>Export data to Google Sheets</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Status</span>
            <Badge variant="outline" className="bg-success/10 text-success">Connected</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Google Sheets integration is configured and ready to use.
          </p>
          <Button variant="outline" className="w-full" data-testid="button-test-sheets">
            <RefreshCw className="w-4 h-4 mr-2" />
            Test Connection
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
