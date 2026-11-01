import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
export function StatusPanel({ title, children, busy = false }: { title: string; children?: ReactNode; busy?: boolean }) {
  return <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-6 py-20 text-center" aria-live="polite" aria-busy={busy}>
    {busy && <LoaderCircle className="animate-spin text-primary" size={28} aria-hidden />}
    <h1 className="text-2xl font-bold">{title}</h1><div className="space-y-4 text-sm leading-7 text-muted">{children}</div>
  </section>;
}
