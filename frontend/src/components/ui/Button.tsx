import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}
const variants = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-[0_5px_0_#103f3920]',
  secondary: 'border border-line bg-surface text-ink hover:bg-white',
  ghost: 'text-muted hover:bg-ink/5 hover:text-ink',
  danger: 'bg-danger text-white hover:bg-[#9e362b]',
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', className = '', type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`} {...props} />;
});
