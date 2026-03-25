import { useEffect } from "react";

interface ShortcutOptions {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  callback: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcut({
  key,
  ctrlKey,
  shiftKey,
  metaKey,
  callback,
  enabled = true,
}: ShortcutOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Don't trigger in input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (
        e.key.toLowerCase() === key.toLowerCase() &&
        !!e.ctrlKey === !!ctrlKey &&
        !!e.shiftKey === !!shiftKey &&
        !!e.metaKey === !!metaKey
      ) {
        e.preventDefault();
        callback();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [key, ctrlKey, shiftKey, metaKey, callback, enabled]);
}
