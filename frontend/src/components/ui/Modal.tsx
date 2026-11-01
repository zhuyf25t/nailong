import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
export function Modal({ open, onOpenChange, title, description, children, closeable = true }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description?: string; children: ReactNode; closeable?: boolean;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[#143b35]/45 backdrop-blur-sm" />
      <Dialog.Content onOpenAutoFocus={() => { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={event => { if (previousFocus.current?.isConnected) { event.preventDefault(); previousFocus.current.focus({ preventScroll: true }); } }} onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (!closeable) event.preventDefault(); }} className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-white/70 bg-surface p-6 shadow-2xl sm:p-8">
        <Dialog.Title className="pr-8 text-2xl font-bold tracking-tight">{title}</Dialog.Title>
        <Dialog.Description className={description ? 'mt-2 text-sm leading-6 text-muted' : 'sr-only'}>{description ?? (typeof title === 'string' ? title : '详情与操作')}</Dialog.Description>
        {closeable && <Dialog.Close className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full text-muted hover:bg-ink/5" aria-label="关闭"><X size={20} /></Dialog.Close>}
        <div className="mt-6">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
