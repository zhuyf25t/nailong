import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Leaf, LoaderCircle } from 'lucide-react';
import { LoginPlayerAPI } from '../../apis/player/LoginPlayerAPI.ts';
import { RegisterPlayerAPI } from '../../apis/player/RegisterPlayerAPI.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Input } from '../../components/ui/Input.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { ApiError } from '../../system/api/ApiError.ts';
import { useSession } from '../../system/session/SessionProvider.tsx';
import { AuthRequest } from './functions/AuthRequest.ts';
import { normalizeUsername, validateAuthDraft } from './functions/validateAuthDraft.ts';
import type { AuthDraft } from './objects/AuthDraft.ts';
import type { AuthFormState } from './objects/AuthFormState.ts';

export interface AuthModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAuthenticated?: () => void;
}

export function AuthModal({ open, onOpenChange, onAuthenticated }: AuthModalProps) {
  const { acceptAuth } = useSession();
  const prefix = useId();
  const usernameInput = useRef<HTMLInputElement>(null);
  const [request] = useState(() => new AuthRequest());
  const [draft, setDraft] = useState<AuthDraft>({ mode: 'login', username: '', password: '', confirmPassword: '' });
  const [form, setForm] = useState<AuthFormState>({ kind: 'editing' });
  const [showPassword, setShowPassword] = useState(false);
  const busy = form.kind === 'submitting';
  const errors = form.kind === 'invalid' || form.kind === 'failed' ? form.errors ?? {} : {};

  useEffect(() => {
    if (!open) {
      request.cancel();
      setDraft(previous => ({ ...previous, password: '', confirmPassword: '' }));
      setForm({ kind: 'editing' });
      setShowPassword(false);
      return;
    }
    const timer = window.setTimeout(() => { usernameInput.current?.focus(); }, 0);
    return () => { window.clearTimeout(timer); request.cancel(); };
  }, [open, request]);

  function changeOpen(nextOpen: boolean): void {
    if (!nextOpen) request.cancel();
    onOpenChange(nextOpen);
  }

  function changeMode(mode: AuthDraft['mode']): void {
    if (busy) return;
    request.cancel();
    setDraft(previous => ({ ...previous, mode, password: '', confirmPassword: '' }));
    setForm({ kind: 'editing' });
    setShowPassword(false);
  }

  function changeField(field: 'username' | 'password' | 'confirmPassword', value: string): void {
    setDraft(previous => ({ ...previous, [field]: value }));
    if (form.kind !== 'editing') setForm({ kind: 'editing' });
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || busy) return;
    event.preventDefault();
    const mode = event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : draft.mode === 'login' ? 'register' : 'login';
    changeMode(mode);
    document.getElementById(`${prefix}-${mode}-tab`)?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const validation = validateAuthDraft(draft);
    if (Object.keys(validation).length > 0) {
      setForm({ kind: 'invalid', errors: validation });
      const field = validation.username ? 'username' : validation.password ? 'password' : 'confirmPassword';
      document.getElementById(`${prefix}-${field}`)?.focus();
      return;
    }
    setForm({ kind: 'submitting' });
    const username = normalizeUsername(draft.username);
    try {
      await request.run(
        signal => draft.mode === 'register'
          ? new RegisterPlayerAPI(username, draft.password, username).send({ signal })
          : new LoginPlayerAPI(username, draft.password).send({ signal }),
        response => {
          acceptAuth(response);
          setDraft(previous => ({ ...previous, password: '', confirmPassword: '' }));
          setForm({ kind: 'editing' });
          // Continue before closing: the parent clears pending intent on close.
          onAuthenticated?.();
          onOpenChange(false);
        },
      );
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === 'conflict' && draft.mode === 'register') {
        setForm({ kind: 'failed', message: '这个账号已经有人使用了，换一个试试，或切换到登录。', errors: { username: '账号已被使用。' } });
        usernameInput.current?.focus();
      } else if (error instanceof ApiError && (error.code === 'unauthorized' || error.kind === 'auth')) {
        setForm({ kind: 'failed', message: '账号或密码不正确，请检查后再试。' });
      } else if (error instanceof ApiError && error.kind === 'network') {
        setForm({ kind: 'failed', message: '暂时没有连上花谷服务，请检查网络后重试。' });
      } else {
        setForm({ kind: 'failed', message: '暂时无法完成。请确认浏览器允许此网站保存登录状态，然后重试。' });
      }
    }
  }

  return <Modal open={open} onOpenChange={changeOpen} title="先给这次冒险起个名字" description="登录后，花谷会记住你的每一次挑战。">
    <div className="mb-6 flex items-center gap-3 rounded-2xl bg-primary/5 px-4 py-3 text-sm text-primary">
      <Leaf aria-hidden="true" size={21} className="shrink-0" />
      <span>躲开红光，留下属于你的通关记录。</span>
    </div>

    <div role="tablist" aria-label="账号操作" className="mb-6 grid grid-cols-2 gap-1 rounded-2xl bg-ink/5 p-1">
      {(['login', 'register'] as const).map(mode => <button
        key={mode}
        id={`${prefix}-${mode}-tab`}
        type="button"
        role="tab"
        aria-selected={draft.mode === mode}
        aria-controls={`${prefix}-panel`}
        tabIndex={draft.mode === mode ? 0 : -1}
        disabled={busy}
        onKeyDown={moveTab}
        onClick={() => changeMode(mode)}
        className={`min-h-11 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${draft.mode === mode ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
      >{mode === 'login' ? '登录' : '注册新账号'}</button>)}
    </div>

    <div id={`${prefix}-panel`} role="tabpanel" aria-labelledby={`${prefix}-${draft.mode}-tab`}>
      <form onSubmit={event => { void submit(event); }} noValidate aria-busy={busy} className="space-y-5">
        <div>
          <label htmlFor={`${prefix}-username`} className="mb-2 block text-sm font-semibold">账号</label>
          <Input ref={usernameInput} id={`${prefix}-username`} name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={draft.username} onChange={event => changeField('username', event.target.value)} disabled={busy} aria-invalid={Boolean(errors.username)} aria-describedby={`${prefix}-username-${errors.username ? 'error' : 'hint'}`} placeholder="例如 flower_hero" />
          {errors.username ? <p id={`${prefix}-username-error`} className="mt-2 text-sm text-danger">{errors.username}</p> : <p id={`${prefix}-username-hint`} className="mt-2 text-xs leading-5 text-muted">3–24 位英文字母、数字或下划线，不区分大小写。</p>}
        </div>

        <div>
          <label htmlFor={`${prefix}-password`} className="mb-2 block text-sm font-semibold">密码</label>
          <div className="relative">
            <Input id={`${prefix}-password`} name="password" type={showPassword ? 'text' : 'password'} autoComplete={draft.mode === 'login' ? 'current-password' : 'new-password'} value={draft.password} onChange={event => changeField('password', event.target.value)} disabled={busy} className="pr-14" aria-invalid={Boolean(errors.password)} aria-describedby={`${prefix}-password-${errors.password ? 'error' : 'hint'}`} />
            <button type="button" onClick={() => setShowPassword(value => !value)} disabled={busy} aria-label={showPassword ? '隐藏密码' : '显示密码'} aria-pressed={showPassword} className="absolute inset-y-0 right-1 flex w-11 items-center justify-center rounded-xl text-muted hover:text-ink disabled:opacity-60">
              {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
            </button>
          </div>
          {errors.password ? <p id={`${prefix}-password-error`} className="mt-2 text-sm text-danger">{errors.password}</p> : <p id={`${prefix}-password-hint`} className="mt-2 text-xs leading-5 text-muted">至少 8 个字符。</p>}
        </div>

        {draft.mode === 'register' && <div>
          <label htmlFor={`${prefix}-confirmPassword`} className="mb-2 block text-sm font-semibold">确认密码</label>
          <Input id={`${prefix}-confirmPassword`} name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={draft.confirmPassword} onChange={event => changeField('confirmPassword', event.target.value)} disabled={busy} aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? `${prefix}-confirm-error` : undefined} />
          {errors.confirmPassword && <p id={`${prefix}-confirm-error`} className="mt-2 text-sm text-danger">{errors.confirmPassword}</p>}
        </div>}

        {form.kind === 'failed' && <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger">{form.message}</p>}
        {form.kind === 'invalid' && <p role="alert" className="sr-only">表单有需要修正的内容，请查看字段旁的说明。</p>}

        <div className="space-y-2 pt-1">
          <Button type="submit" disabled={busy} className="min-h-14 w-full text-base">
            {busy ? <><LoaderCircle aria-hidden="true" size={19} className="animate-spin motion-reduce:animate-none" />{draft.mode === 'login' ? '正在登录…' : '正在创建…'}</> : <>{draft.mode === 'login' ? '登录，继续冒险' : '创建账号，出发'}<ArrowRight aria-hidden="true" size={19} /></>}
          </Button>
          <Button variant="ghost" onClick={() => changeOpen(false)} className="w-full">先逛逛花谷</Button>
        </div>
      </form>
    </div>
  </Modal>;
}
