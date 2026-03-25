import { useCallback } from 'react';
import { useLocation } from 'wouter';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';

interface KeyboardShortcutsProps {
  onOpenCommandPalette: () => void;
}

export function KeyboardShortcuts({ onOpenCommandPalette }: KeyboardShortcutsProps) {
  const [, setLocation] = useLocation();

  const goToInvoices = useCallback(() => setLocation('/invoices'), [setLocation]);
  const goToJournal = useCallback(() => setLocation('/journal'), [setLocation]);
  const goToReceipts = useCallback(() => setLocation('/receipts'), [setLocation]);

  // Ctrl+K → open command palette
  useKeyboardShortcut({ key: 'k', ctrlKey: true, callback: onOpenCommandPalette });

  // Ctrl+I → /invoices
  useKeyboardShortcut({ key: 'i', ctrlKey: true, callback: goToInvoices });

  // Ctrl+J → /journal
  useKeyboardShortcut({ key: 'j', ctrlKey: true, callback: goToJournal });

  // Ctrl+R → /receipts
  useKeyboardShortcut({ key: 'r', ctrlKey: true, callback: goToReceipts });

  return null;
}
