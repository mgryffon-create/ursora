import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
export default function PracticeDialog({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: React.ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/75"/><Dialog.Content className="learn-workspace fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%_-_24px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 text-slate-900 sm:p-6"><div className="mb-4 pr-14"><Dialog.Title className="text-lg text-sky-200">{title}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-zinc-400">{description}</Dialog.Description></div><Dialog.Close className="absolute right-3 top-3" aria-label="Close dialog"><X className="h-4 w-4" aria-hidden="true"/></Dialog.Close>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
