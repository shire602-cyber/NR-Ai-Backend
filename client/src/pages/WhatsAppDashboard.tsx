import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useDefaultCompany } from '@/hooks/useDefaultCompany';
import { useI18n } from '@/lib/i18n';
import {
  MessageCircle,
  Clock,
  Send,
  Users,
  Search,
  ExternalLink,
  Phone,
  Receipt,
  Bell,
  Megaphone,
  Settings2,
  FileText,
  CreditCard,
  CalendarClock,
  ChevronRight,
  Plus,
  Trash2,
} from 'lucide-react';
import { SiWhatsapp } from 'react-icons/si';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { WhatsappMessage, Invoice, CustomerContact } from '@shared/schema';

// ─── Helpers ──────────────────────────────────────────────

function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/[^\d]/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  return cleaned;
}

function openWhatsApp(phone: string, message: string) {
  const formatted = formatPhoneForWhatsApp(phone);
  const encoded = encodeURIComponent(message);
  window.open(`https://wa.me/${formatted}?text=${encoded}`, '_blank');
}

// ─── Message Templates ────────────────────────────────────

interface MessageTemplate {
  id: string;
  name: string;
  nameAr: string;
  icon: typeof Receipt;
  category: 'invoice' | 'payment' | 'reminder' | 'news';
  template: string;
  templateAr: string;
}

const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'invoice_new',
    name: 'New Invoice',
    nameAr: 'فاتورة جديدة',
    icon: FileText,
    category: 'invoice',
    template: `Hello {{customer_name}},

Your invoice {{invoice_number}} for AED {{amount}} has been issued.

Due Date: {{due_date}}

Thank you for your business!
- {{company_name}}`,
    templateAr: `مرحباً {{customer_name}},

تم إصدار فاتورتك {{invoice_number}} بمبلغ {{amount}} درهم.

تاريخ الاستحقاق: {{due_date}}

شكراً لتعاملك معنا!
- {{company_name}}`,
  },
  {
    id: 'payment_reminder',
    name: 'Payment Reminder',
    nameAr: 'تذكير بالدفع',
    icon: CreditCard,
    category: 'payment',
    template: `Hello {{customer_name}},

This is a friendly reminder that invoice {{invoice_number}} for AED {{amount}} is due on {{due_date}}.

Please make payment at your earliest convenience.

Thank you!
- {{company_name}}`,
    templateAr: `مرحباً {{customer_name}},

هذا تذكير ودي بأن الفاتورة {{invoice_number}} بمبلغ {{amount}} درهم مستحقة في {{due_date}}.

يرجى السداد في أقرب وقت ممكن.

شكراً لك!
- {{company_name}}`,
  },
  {
    id: 'payment_overdue',
    name: 'Overdue Payment',
    nameAr: 'دفعة متأخرة',
    icon: CalendarClock,
    category: 'payment',
    template: `Hello {{customer_name}},

Invoice {{invoice_number}} for AED {{amount}} was due on {{due_date}} and is now overdue.

Please arrange payment as soon as possible to avoid any disruption.

Thank you for your attention.
- {{company_name}}`,
    templateAr: `مرحباً {{customer_name}},

الفاتورة {{invoice_number}} بمبلغ {{amount}} درهم كانت مستحقة في {{due_date}} وهي الآن متأخرة.

يرجى ترتيب الدفع في أقرب وقت ممكن.

شكراً لاهتمامك.
- {{company_name}}`,
  },
  {
    id: 'general_reminder',
    name: 'General Reminder',
    nameAr: 'تذكير عام',
    icon: Bell,
    category: 'reminder',
    template: `Hello {{customer_name}},

{{message}}

Best regards,
- {{company_name}}`,
    templateAr: `مرحباً {{customer_name}},

{{message}}

مع أطيب التحيات,
- {{company_name}}`,
  },
  {
    id: 'news_update',
    name: 'News & Announcement',
    nameAr: 'أخبار وإعلان',
    icon: Megaphone,
    category: 'news',
    template: `Hello {{customer_name}},

{{message}}

Best regards,
- {{company_name}}`,
    templateAr: `مرحباً {{customer_name}},

{{message}}

مع أطيب التحيات,
- {{company_name}}`,
  },
];

// ─── Rules ────────────────────────────────────────────────

interface WhatsAppRule {
  id: string;
  name: string;
  type: 'before_due' | 'on_due' | 'after_due' | 'on_invoice';
  daysOffset: number; // negative = before, 0 = on, positive = after
  templateId: string;
  enabled: boolean;
}

const DEFAULT_RULES: WhatsAppRule[] = [
  { id: 'rule_1', name: 'Invoice Created', type: 'on_invoice', daysOffset: 0, templateId: 'invoice_new', enabled: true },
  { id: 'rule_2', name: '3 days before due', type: 'before_due', daysOffset: -3, templateId: 'payment_reminder', enabled: true },
  { id: 'rule_3', name: 'On due date', type: 'on_due', daysOffset: 0, templateId: 'payment_reminder', enabled: true },
  { id: 'rule_4', name: '7 days overdue', type: 'after_due', daysOffset: 7, templateId: 'payment_overdue', enabled: false },
];

// ─── Component ────────────────────────────────────────────

export default function WhatsAppDashboard() {
  const { locale } = useI18n();
  const { toast } = useToast();
  const { company: currentCompany } = useDefaultCompany();
  const isRTL = locale === 'ar';
  const en = locale === 'en';

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showBroadcastDialog, setShowBroadcastDialog] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedInvoice, setSelectedInvoice] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [rules, setRules] = useState<WhatsAppRule[]>(DEFAULT_RULES);

  // Data queries
  const { data: messages = [], isLoading: messagesLoading } = useQuery<WhatsappMessage[]>({
    queryKey: ['/api/integrations/whatsapp/messages'],
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['/api/companies', currentCompany?.id, 'invoices'],
    queryFn: () => apiRequest('GET', `/api/companies/${currentCompany?.id}/invoices`),
    enabled: !!currentCompany?.id,
  });

  const { data: customers = [] } = useQuery<CustomerContact[]>({
    queryKey: ['/api/companies', currentCompany?.id, 'customer-contacts'],
    queryFn: () => apiRequest('GET', `/api/companies/${currentCompany?.id}/customer-contacts`),
    enabled: !!currentCompany?.id,
  });

  // Filter messages
  const filteredMessages = messages.filter(msg => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      msg.content?.toLowerCase().includes(q) ||
      msg.to?.toLowerCase().includes(q) ||
      msg.from?.toLowerCase().includes(q)
    );
  });

  // Helpers
  const getCustomerName = (phone: string) => {
    const customer = customers.find(c => c.phone === phone);
    return customer?.name || phone;
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(en ? 'en-AE' : 'ar-AE', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const fillTemplate = (templateStr: string, data: Record<string, string>) => {
    let result = templateStr;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  };

  const logAndOpen = (phone: string, message: string) => {
    apiRequest('POST', '/api/integrations/whatsapp/log-message', { to: phone, message }).catch(() => {});
    openWhatsApp(phone, message);
    toast({ title: en ? 'Opening WhatsApp...' : 'جاري فتح واتساب...' });
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/whatsapp/messages'] });
    }, 1000);
  };

  // ─── Handlers ───────────────────────────────────────────

  const handleSendMessage = () => {
    let phone = sendTo;
    if (selectedCustomer) {
      const cust = customers.find(c => c.id === selectedCustomer);
      if (cust?.phone) phone = cust.phone;
      else {
        toast({ title: en ? 'No phone number' : 'لا يوجد رقم', variant: 'destructive' });
        return;
      }
    }
    if (!phone.trim()) { toast({ title: en ? 'Phone required' : 'رقم الهاتف مطلوب', variant: 'destructive' }); return; }
    if (!sendMessage.trim()) { toast({ title: en ? 'Message required' : 'الرسالة مطلوبة', variant: 'destructive' }); return; }

    logAndOpen(phone, sendMessage);
    setSendTo(''); setSendMessage(''); setSelectedCustomer(''); setSelectedTemplate('');
    setShowSendDialog(false);
  };

  const handleSendInvoice = () => {
    if (!selectedInvoice) { toast({ title: en ? 'Select an invoice' : 'اختر فاتورة', variant: 'destructive' }); return; }
    const inv = invoices.find(i => i.id === selectedInvoice);
    if (!inv) return;
    const cust = customers.find(c => c.name === inv.customerName);
    if (!cust?.phone) { toast({ title: en ? 'No phone number' : 'لا يوجد رقم', variant: 'destructive' }); return; }

    const invoiceDate = new Date(inv.date);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + (cust.paymentTerms || 30));

    const tpl = MESSAGE_TEMPLATES.find(t => t.id === (selectedTemplate || 'invoice_new'));
    const templateStr = en ? (tpl?.template || '') : (tpl?.templateAr || '');
    const message = fillTemplate(templateStr, {
      customer_name: inv.customerName || 'Customer',
      invoice_number: inv.number,
      amount: `AED ${inv.total.toFixed(2)}`,
      due_date: dueDate.toLocaleDateString(en ? 'en-AE' : 'ar-AE'),
      company_name: currentCompany?.name || 'Our Company',
    });

    logAndOpen(cust.phone, message);
    setSelectedInvoice(''); setSelectedTemplate(''); setShowInvoiceDialog(false);
  };

  const handleBroadcast = () => {
    if (!broadcastMessage.trim()) { toast({ title: en ? 'Message required' : 'الرسالة مطلوبة', variant: 'destructive' }); return; }
    const withPhone = customers.filter(c => c.phone);
    if (withPhone.length === 0) { toast({ title: en ? 'No customers with phone numbers' : 'لا يوجد عملاء بأرقام', variant: 'destructive' }); return; }

    // Open WhatsApp for each customer one by one
    withPhone.forEach((cust, i) => {
      const tpl = MESSAGE_TEMPLATES.find(t => t.id === 'news_update');
      const templateStr = en ? (tpl?.template || '') : (tpl?.templateAr || '');
      const msg = fillTemplate(templateStr, {
        customer_name: cust.name,
        message: broadcastMessage,
        company_name: currentCompany?.name || 'Our Company',
      });

      apiRequest('POST', '/api/integrations/whatsapp/log-message', { to: cust.phone, message: msg }).catch(() => {});

      // Stagger opening to avoid browser blocking popups
      setTimeout(() => openWhatsApp(cust.phone!, msg), i * 800);
    });

    toast({ title: en ? `Opening WhatsApp for ${withPhone.length} customer(s)...` : `جاري فتح واتساب لـ ${withPhone.length} عميل...` });
    setBroadcastMessage(''); setShowBroadcastDialog(false);
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/whatsapp/messages'] });
    }, withPhone.length * 800 + 1000);
  };

  const handleQuickMessage = (customer: CustomerContact) => {
    if (!customer.phone) { toast({ title: en ? 'No phone number' : 'لا يوجد رقم', variant: 'destructive' }); return; }
    setSelectedCustomer(customer.id);
    setSendTo(customer.phone);
    setSendMessage('');
    setShowSendDialog(true);
  };

  const toggleRule = (ruleId: string) => {
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r));
    // Save rules to backend
    apiRequest('POST', '/api/integrations/whatsapp/save-rules', {
      rules: rules.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r),
    }).catch(() => {});
  };

  const applyTemplate = (templateId: string) => {
    const tpl = MESSAGE_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;

    const custName = selectedCustomer
      ? customers.find(c => c.id === selectedCustomer)?.name || ''
      : '';

    const templateStr = en ? tpl.template : tpl.templateAr;
    const msg = fillTemplate(templateStr, {
      customer_name: custName || (en ? '[Customer Name]' : '[اسم العميل]'),
      message: en ? '[Your message here]' : '[رسالتك هنا]',
      company_name: currentCompany?.name || 'Our Company',
      invoice_number: '[INV-XXX]',
      amount: '[AED X,XXX.XX]',
      due_date: '[Date]',
    });
    setSendMessage(msg);
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className={`container max-w-6xl mx-auto py-6 px-4 space-y-6 ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
            <SiWhatsapp className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{en ? 'WhatsApp' : 'واتساب'}</h1>
            <p className="text-sm text-muted-foreground">
              {en ? 'Send messages, invoices & reminders via your personal WhatsApp' : 'أرسل رسائل وفواتير وتذكيرات عبر واتساب الشخصي'}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Broadcast */}
          <Dialog open={showBroadcastDialog} onOpenChange={setShowBroadcastDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-broadcast">
                <Megaphone className="w-4 h-4 mr-2" />
                {en ? 'Broadcast News' : 'بث أخبار'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{en ? 'Broadcast to All Clients' : 'بث لجميع العملاء'}</DialogTitle>
                <DialogDescription>
                  {en
                    ? `Send a news or announcement to all ${customers.filter(c => c.phone).length} customer(s) with phone numbers`
                    : `أرسل خبر أو إعلان لجميع ${customers.filter(c => c.phone).length} عميل لديهم أرقام هواتف`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  placeholder={en ? 'Type your announcement...' : 'اكتب إعلانك...'}
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  rows={5}
                  data-testid="input-broadcast"
                />
                <p className="text-xs text-muted-foreground">
                  {en
                    ? 'This will open WhatsApp for each customer. Your browser may ask to allow popups.'
                    : 'سيتم فتح واتساب لكل عميل. قد يطلب المتصفح السماح بالنوافذ المنبثقة.'}
                </p>
                <Button onClick={handleBroadcast} className="w-full bg-green-600 hover:bg-green-700" data-testid="button-send-broadcast">
                  <Megaphone className="w-4 h-4 mr-2" />
                  {en ? `Send to ${customers.filter(c => c.phone).length} Client(s)` : `إرسال لـ ${customers.filter(c => c.phone).length} عميل`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Invoice Reminder */}
          <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-send-invoice">
                <Receipt className="w-4 h-4 mr-2" />
                {en ? 'Invoice Reminder' : 'تذكير فاتورة'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{en ? 'Send Invoice Reminder' : 'إرسال تذكير فاتورة'}</DialogTitle>
                <DialogDescription>
                  {en ? 'Select an invoice and template to send via WhatsApp' : 'اختر فاتورة وقالب للإرسال عبر واتساب'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="mb-1.5 block">{en ? 'Invoice' : 'الفاتورة'}</Label>
                  <Select value={selectedInvoice} onValueChange={setSelectedInvoice}>
                    <SelectTrigger data-testid="select-invoice">
                      <SelectValue placeholder={en ? 'Select an invoice' : 'اختر فاتورة'} />
                    </SelectTrigger>
                    <SelectContent>
                      {invoices
                        .filter(inv => inv.status !== 'paid')
                        .map(inv => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.number} - {inv.customerName} - AED {inv.total.toFixed(2)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-1.5 block">{en ? 'Template' : 'القالب'}</Label>
                  <Select value={selectedTemplate || 'invoice_new'} onValueChange={setSelectedTemplate}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MESSAGE_TEMPLATES.filter(t => ['invoice', 'payment'].includes(t.category)).map(tpl => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {en ? tpl.name : tpl.nameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedInvoice && (() => {
                  const inv = invoices.find(i => i.id === selectedInvoice);
                  const cust = inv ? customers.find(c => c.name === inv.customerName) : null;
                  return inv ? (
                    <div className="p-3 rounded-lg bg-muted text-sm space-y-1">
                      <p><strong>{en ? 'Customer' : 'العميل'}:</strong> {inv.customerName}</p>
                      <p><strong>{en ? 'Amount' : 'المبلغ'}:</strong> AED {inv.total.toFixed(2)}</p>
                      <p><strong>{en ? 'Phone' : 'الهاتف'}:</strong> {cust?.phone || (en ? 'No phone' : 'لا يوجد رقم')}</p>
                    </div>
                  ) : null;
                })()}

                <Button onClick={handleSendInvoice} className="w-full bg-green-600 hover:bg-green-700" data-testid="button-open-whatsapp-invoice">
                  <SiWhatsapp className="w-4 h-4 mr-2" />
                  {en ? 'Open in WhatsApp' : 'فتح في واتساب'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Send Message */}
          <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
            <DialogTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700" data-testid="button-send-message">
                <Send className="w-4 h-4 mr-2" />
                {en ? 'Send Message' : 'إرسال رسالة'}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{en ? 'Send WhatsApp Message' : 'إرسال رسالة واتساب'}</DialogTitle>
                <DialogDescription>
                  {en ? 'Compose a message — it will open in your WhatsApp app' : 'اكتب رسالة — ستفتح في تطبيق واتساب'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="mb-1.5 block">{en ? 'Customer' : 'العميل'}</Label>
                  <Select value={selectedCustomer} onValueChange={(val) => {
                    setSelectedCustomer(val);
                    const cust = customers.find(c => c.id === val);
                    if (cust?.phone) setSendTo(cust.phone);
                  }}>
                    <SelectTrigger data-testid="select-customer">
                      <SelectValue placeholder={en ? 'Select a customer' : 'اختر عميل'} />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.filter(c => c.phone).map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.phone})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-1.5 block">{en ? 'Or enter phone number' : 'أو أدخل رقم الهاتف'}</Label>
                  <Input
                    placeholder={en ? 'e.g. 971501234567' : 'مثال: 971501234567'}
                    value={sendTo}
                    onChange={(e) => { setSendTo(e.target.value); setSelectedCustomer(''); }}
                    data-testid="input-phone"
                  />
                </div>

                <div>
                  <Label className="mb-1.5 block">{en ? 'Template (optional)' : 'قالب (اختياري)'}</Label>
                  <Select value={selectedTemplate} onValueChange={(val) => { setSelectedTemplate(val); applyTemplate(val); }}>
                    <SelectTrigger>
                      <SelectValue placeholder={en ? 'Choose a template...' : 'اختر قالب...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {MESSAGE_TEMPLATES.map(tpl => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {en ? tpl.name : tpl.nameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-1.5 block">{en ? 'Message' : 'الرسالة'}</Label>
                  <Textarea
                    placeholder={en ? 'Type your message...' : 'اكتب رسالتك...'}
                    value={sendMessage}
                    onChange={(e) => setSendMessage(e.target.value)}
                    rows={6}
                    data-testid="input-message"
                  />
                </div>

                <Button onClick={handleSendMessage} className="w-full bg-green-600 hover:bg-green-700" data-testid="button-open-whatsapp">
                  <SiWhatsapp className="w-4 h-4 mr-2" />
                  {en ? 'Open in WhatsApp' : 'فتح في واتساب'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="messages" className="w-full">
        <TabsList>
          <TabsTrigger value="messages">
            <MessageCircle className="w-4 h-4 mr-1.5" />
            {en ? 'Messages' : 'الرسائل'}
          </TabsTrigger>
          <TabsTrigger value="customers">
            <Users className="w-4 h-4 mr-1.5" />
            {en ? 'Customers' : 'العملاء'}
          </TabsTrigger>
          <TabsTrigger value="rules">
            <Settings2 className="w-4 h-4 mr-1.5" />
            {en ? 'Rules' : 'القواعد'}
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="w-4 h-4 mr-1.5" />
            {en ? 'Templates' : 'القوالب'}
          </TabsTrigger>
        </TabsList>

        {/* ─── Messages Tab ─────────────────────────────── */}
        <TabsContent value="messages" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={en ? 'Search messages...' : 'بحث في الرسائل...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>

          {messagesLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
          ) : filteredMessages.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                  <SiWhatsapp className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{en ? 'No messages yet' : 'لا توجد رسائل بعد'}</h3>
                <p className="text-muted-foreground mb-6 max-w-md">
                  {en ? 'Start by sending a message, invoice reminder, or broadcast to your clients' : 'ابدأ بإرسال رسالة أو تذكير فاتورة أو بث لعملائك'}
                </p>
                <Button onClick={() => setShowSendDialog(true)} className="bg-green-600 hover:bg-green-700">
                  <Send className="w-4 h-4 mr-2" />
                  {en ? 'Send Message' : 'إرسال رسالة'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredMessages
                .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
                .map((msg) => (
                  <Card key={msg.id} className="hover:bg-accent/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                            <SiWhatsapp className="w-5 h-5 text-green-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">
                                {msg.direction === 'outbound'
                                  ? `→ ${getCustomerName(msg.to || '')}`
                                  : `← ${getCustomerName(msg.from || '')}`}
                              </span>
                              <Badge variant={msg.direction === 'outbound' ? 'default' : 'secondary'} className="text-xs">
                                {msg.direction === 'outbound' ? (en ? 'Sent' : 'مرسل') : (en ? 'Received' : 'مستلم')}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-line">{msg.content}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {msg.createdAt ? formatTime(String(msg.createdAt)) : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                        {msg.to && (
                          <Button variant="ghost" size="sm" className="text-green-600 shrink-0" onClick={() => openWhatsApp(msg.to!, '')}>
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Customers Tab ────────────────────────────── */}
        <TabsContent value="customers">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customers.map((customer) => (
              <Card key={customer.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{customer.name}</p>
                      {customer.phone ? (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {customer.phone}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">{en ? 'No phone' : 'لا يوجد رقم'}</p>
                      )}
                    </div>
                    {customer.phone && (
                      <Button variant="ghost" size="sm" className="text-green-600 shrink-0" onClick={() => handleQuickMessage(customer)}>
                        <SiWhatsapp className="w-5 h-5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {customers.length === 0 && (
              <Card className="col-span-full border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">
                    {en ? 'No customers yet. Add contacts to message them via WhatsApp.' : 'لا يوجد عملاء بعد. أضف جهات اتصال لمراسلتهم عبر واتساب.'}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ─── Rules Tab ────────────────────────────────── */}
        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{en ? 'Reminder Rules' : 'قواعد التذكيرات'}</CardTitle>
              <CardDescription>
                {en
                  ? 'Configure when WhatsApp reminders should be triggered. When a rule matches, you\'ll be prompted to send via WhatsApp.'
                  : 'حدد متى يجب تفعيل تذكيرات واتساب. عند تطابق قاعدة، سيتم إعلامك للإرسال عبر واتساب.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rules.map((rule) => {
                const tpl = MESSAGE_TEMPLATES.find(t => t.id === rule.templateId);
                const Icon = tpl?.icon || Bell;
                return (
                  <div key={rule.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${rule.enabled ? 'bg-green-500/10' : 'bg-muted'}`}>
                        <Icon className={`w-5 h-5 ${rule.enabled ? 'text-green-600' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{rule.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {en ? 'Template' : 'القالب'}: {en ? tpl?.name : tpl?.nameAr}
                          {rule.type === 'before_due' && ` • ${Math.abs(rule.daysOffset)} ${en ? 'days before due' : 'أيام قبل الاستحقاق'}`}
                          {rule.type === 'on_due' && ` • ${en ? 'On due date' : 'في تاريخ الاستحقاق'}`}
                          {rule.type === 'after_due' && ` • ${rule.daysOffset} ${en ? 'days after due' : 'أيام بعد الاستحقاق'}`}
                          {rule.type === 'on_invoice' && ` • ${en ? 'When invoice is created' : 'عند إنشاء الفاتورة'}`}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleRule(rule.id)}
                      data-testid={`switch-rule-${rule.id}`}
                    />
                  </div>
                );
              })}

              <div className="pt-2">
                <p className="text-xs text-muted-foreground">
                  {en
                    ? '* Rules will prompt you to send messages — they open WhatsApp on your device. No messages are sent automatically.'
                    : '* القواعد ستطلب منك إرسال الرسائل — تفتح واتساب على جهازك. لا يتم إرسال رسائل تلقائياً.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Templates Tab ────────────────────────────── */}
        <TabsContent value="templates" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MESSAGE_TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <Card key={tpl.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{en ? tpl.name : tpl.nameAr}</CardTitle>
                        <Badge variant="outline" className="text-xs mt-1">
                          {tpl.category === 'invoice' ? (en ? 'Invoice' : 'فاتورة') :
                           tpl.category === 'payment' ? (en ? 'Payment' : 'دفع') :
                           tpl.category === 'reminder' ? (en ? 'Reminder' : 'تذكير') :
                           (en ? 'News' : 'أخبار')}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans bg-muted/50 p-3 rounded-lg max-h-32 overflow-y-auto">
                      {en ? tpl.template : tpl.templateAr}
                    </pre>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => {
                        setSelectedTemplate(tpl.id);
                        applyTemplate(tpl.id);
                        setShowSendDialog(true);
                      }}
                    >
                      <Send className="w-3 h-3 mr-1.5" />
                      {en ? 'Use Template' : 'استخدم القالب'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
