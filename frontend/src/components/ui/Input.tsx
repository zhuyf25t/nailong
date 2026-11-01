import { forwardRef, type InputHTMLAttributes } from 'react';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`min-h-12 w-full rounded-xl border border-line bg-white/70 px-4 py-3 text-base placeholder:text-muted/60 aria-invalid:border-danger disabled:opacity-60 ${className}`} {...props} />;
});
