import {
  LayoutDashboard,
  BookMarked,
  FileText,
  Receipt,
  BarChart3,
  FileCheck,
  Bot,
  FolderArchive,
  Building2,
  Users,
  Plug,
  Sun,
  Moon,
  Languages,
  Plus,
  ScanLine,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useTheme } from 'next-themes';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command';
import { useI18n } from '@/lib/i18n';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useI18n();

  const navigate = (url: string) => {
    setLocation(url);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Pages">
          <CommandItem onSelect={() => navigate('/dashboard')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => navigate('/journal')}>
            <BookMarked className="mr-2 h-4 w-4" />
            Journal
            <CommandShortcut>Ctrl+J</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => navigate('/invoices')}>
            <FileText className="mr-2 h-4 w-4" />
            Invoices
            <CommandShortcut>Ctrl+I</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => navigate('/receipts')}>
            <Receipt className="mr-2 h-4 w-4" />
            Expenses
            <CommandShortcut>Ctrl+R</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => navigate('/reports')}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Financial Reports
          </CommandItem>
          <CommandItem onSelect={() => navigate('/vat-filing')}>
            <FileCheck className="mr-2 h-4 w-4" />
            VAT Filing
          </CommandItem>
          <CommandItem onSelect={() => navigate('/bank-reconciliation')}>
            <Building2 className="mr-2 h-4 w-4" />
            Bank Reconciliation
          </CommandItem>
          <CommandItem onSelect={() => navigate('/ai-cfo')}>
            <Bot className="mr-2 h-4 w-4" />
            AI Assistant
          </CommandItem>
          <CommandItem onSelect={() => navigate('/document-vault')}>
            <FolderArchive className="mr-2 h-4 w-4" />
            Document Vault
          </CommandItem>
          <CommandItem onSelect={() => navigate('/team')}>
            <Users className="mr-2 h-4 w-4" />
            Team Management
          </CommandItem>
          <CommandItem onSelect={() => navigate('/integrations-hub')}>
            <Plug className="mr-2 h-4 w-4" />
            Integrations Hub
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => navigate('/invoices')}>
            <Plus className="mr-2 h-4 w-4" />
            New Invoice
          </CommandItem>
          <CommandItem onSelect={() => navigate('/journal')}>
            <Plus className="mr-2 h-4 w-4" />
            New Journal Entry
          </CommandItem>
          <CommandItem onSelect={() => navigate('/receipts')}>
            <ScanLine className="mr-2 h-4 w-4" />
            Scan Receipt
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Settings">
          <CommandItem
            onSelect={() => {
              setTheme(theme === 'dark' ? 'light' : 'dark');
              onOpenChange(false);
            }}
          >
            {theme === 'dark' ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Toggle Theme
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setLocale(locale === 'en' ? 'ar' : 'en');
              onOpenChange(false);
            }}
          >
            <Languages className="mr-2 h-4 w-4" />
            Switch Language ({locale === 'en' ? 'Arabic' : 'English'})
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
