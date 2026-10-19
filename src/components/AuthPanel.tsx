import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Lock, Mail, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/api';
import { reportError } from '@/lib/errors';
import db from '@/lib/db';
import { LEGAL_VERSION } from '@/lib/legal';
import { AgreementAcceptance } from '@/components/AgreementAcceptance';
import { FullLockup } from '@/brand';

export const AuthPanel: React.FC<{ onClose?: () => void; initialMode?: 'signin' | 'signup' }> = ({
  onClose, initialMode = 'signup',
}) => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState(() => typeof window !== 'undefined' ? (window.localStorage.getItem('ursora_saved_email') ?? '') : '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() =>
    typeof window === 'undefined' ? true : window.localStorage.getItem('ursora_remember_login') !== 'false'
  );
  const [busy, setBusy] = useState(false);
  const [agreed,setAgreed]=useState(false);
  const [recovery,setRecovery]=useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (remember && email.trim()) {
      window.localStorage.setItem('ursora_saved_email', email.trim());
    } else if (!remember) {
      window.localStorage.removeItem('ursora_saved_email');
    }
  }, [email, remember]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if(recovery){setBusy(true);try{const result=await db.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+'/account/recovery'});if(result.error)throw result.error;setNotice('If an account can receive recovery email, a password reset link will be sent. Check your inbox and spam folder.')}catch{setNotice('Recovery requests are temporarily unavailable. Try again later or contact support.')}finally{setBusy(false)}return;}
    if(mode==='signup'&&!agreed){setError('Agree to the User Agreement before creating an account.');return;}
    if (password.length < (mode==='signup'?12:8)) {
      setError('Choose a password of at least 12 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await signUp(email.trim(), password, agreed);
        track('form_submit', { form: 'ursora-signup' });
        if (needsConfirmation) {
          setNotice('Account created. Confirm your email address, then sign in.');
          setMode('signin');
        }
      } else {
        await signIn(email.trim(), password, remember);
        if (typeof window !== 'undefined') {
          if (remember) window.localStorage.setItem('ursora_saved_email', email.trim());
          else window.localStorage.removeItem('ursora_saved_email');
        }
        track('form_submit', { form: 'ursora-signin' });
      }
    } catch (err) {
      // PHASE C1 — never interpolate a caught value directly; it renders as [object Object].
      setError(reportError('auth', err, 'Sign-in could not be completed. Check the email and password, then try again.'));

    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative w-full max-w-md rounded-md border border-zinc-800 bg-[#14171c] p-5 shadow-2xl">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <div className="mb-4">
        <FullLockup className="h-14" />
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400/80">
        {mode === 'signup' ? 'Create account' : 'Welcome back'}
      </div>
      <h2 className="mt-1.5 text-lg font-semibold text-zinc-100">
        {mode === 'signup' ? 'Create your URSORA account' : 'Sign in to URSORA'}

      </h2>
      <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
        Sign in with your email address. URSORA stores your activity and authorized financial imports; authorized operators and providers may access records as described in the Privacy Notice.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div>
          <label htmlFor="sf-email" className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Email
          </label>
          <div className="mt-1 flex items-center gap-2 rounded-sm border border-zinc-800 bg-black/40 px-2.5 focus-within:border-sky-500/60">
            <Mail className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
            <input
              id="sf-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
              placeholder="trader@desk.com"
            />
          </div>
        </div>
        {!recovery&&<div>
          <label htmlFor="sf-password" className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Password
          </label>
          <div className="mt-1 flex items-center gap-2 rounded-sm border border-zinc-800 bg-black/40 px-2.5 focus-within:border-sky-500/60">
            <Lock className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
            <input
              id="sf-password"
              type="password"
              required
              minLength={mode==='signup'?12:8}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
              placeholder={mode==='signup'?"At least 12 characters":"Your password"}
            />
          </div>
        </div>}

        {mode==='signup'&&!recovery&&<AgreementAcceptance checked={agreed} onChange={setAgreed} termsUrl={'/legal?version='+LEGAL_VERSION} privacyUrl={'/legal?version='+LEGAL_VERSION}/> }
        {mode === 'signin' && !recovery && (
          <label className="flex cursor-pointer items-start gap-2 rounded-sm border border-zinc-800 bg-black/20 p-2.5">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-sky-500"
            />
            <span>
              <span className="block text-[12px] text-zinc-300">Remember me</span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-zinc-600">
                Keep me signed in on this site and remember my email.
              </span>
            </span>
          </label>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-sm border border-red-500/40 bg-red-500/10 p-2 text-[12px] text-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="rounded-sm border border-sky-500/40 bg-sky-500/10 p-2 text-[12px] text-sky-200">{notice}</div>
        )}

        <Button type="submit" disabled={busy||(mode==='signup'&&!agreed&&!recovery)} className="w-full gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          {recovery?'Send recovery link':mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      {mode==='signin'&&<button type="button" onClick={()=>{setRecovery(v=>!v);setError(null);setNotice(null)}} className="mt-3 w-full text-sky-300">{recovery?'Back to sign in':'Forgot password or sign-in email?'}</button>}
      {recovery&&<p className="mt-2 text-sm text-zinc-300">Your username is your email address. If you cannot remember it or cannot access your inbox, contact mgryffon@icloud.com. We will verify ownership; never send your password.</p>}
      <button
        type="button"
        onClick={() => {
          setRecovery(false);setAgreed(false);
          setMode(mode === 'signup' ? 'signin' : 'signup');
          setError(null);
          setNotice(null);
        }}
        className="mt-3 w-full text-center text-[12px] text-zinc-500 transition-colors hover:text-sky-300"
      >
        {mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
      </button>

      <p className="mt-3 text-xs"><a href="/legal" target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">User Agreement & Privacy Notice (new tab)</a></p>
      <p className="mt-4 border-t border-zinc-800 pt-3 text-[10px] leading-relaxed text-zinc-600">
        URSORA uses connected provider data where available and labels observed, delayed, derived, inferred, simulated,
        and unavailable information separately. Research tool only — not investment advice.
      </p>

    </div>
  );
};

export default AuthPanel;
