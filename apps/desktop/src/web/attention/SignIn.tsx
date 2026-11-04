import { createClient } from '@supabase/supabase-js';
import { createSignal, onMount, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { aplicarLengua, t } from '../../lib/i18n';
import { seguirElTema } from '../../lib/theme';
import { Button } from '../../ui/Button';
import '../phrases';
import { AccessRequest } from '../auth/AccessRequest';
import '../../styles/global.css';

export function alphaReturn(value: string | null, base = '/terminus/'): string {
  if (!value || ![base, `${base}inbox`, `${base}m/`, `${base}m/inbox`].includes(value)) return `${base}inbox`;
  return value;
}
export function startSignIn(settings: { supabaseUrl: string; supabaseKey: string; alphaOauth?: boolean }) {
  aplicarLengua(); seguirElTema();
  const client = createClient(settings.supabaseUrl, settings.supabaseKey, { auth: { flowType: 'pkce', detectSessionInUrl: false } });
  const base = import.meta.env.BASE_URL;
  const next = alphaReturn(new URLSearchParams(location.search).get('next'), base);
  function SignIn() {
    const [email, setEmail] = createSignal('');
    const [password, setPassword] = createSignal('');
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal(false);
    onMount(async () => {
      const code = new URLSearchParams(location.search).get('code');
      if (!code) return;
      setBusy(true);
      const result = await client.auth.exchangeCodeForSession(code);
      history.replaceState(null, '', `${base}sign-in?next=${encodeURIComponent(next)}`);
      if (result.error) { setError(true); setBusy(false); }
      else location.assign(next);
    });
    async function signIn(event: Event) {
      event.preventDefault(); setBusy(true); setError(false);
      try {
        const result = await client.auth.signInWithPassword({ email: email().trim(), password: password() });
        setPassword('');
        if (result.error) setError(true); else location.assign(next);
      } catch { setError(true); } finally { setBusy(false); }
    }
    async function provider(value: 'google' | 'azure') {
      setBusy(true); setError(false);
      try {
        const redirectTo = `${location.origin}${base}sign-in?next=${encodeURIComponent(next)}`;
        const result = await client.auth.signInWithOAuth({ provider: value, options: { redirectTo, ...(value === 'azure' ? { scopes: 'email' } : {}) } });
        if (result.error) setError(true);
      } catch { setError(true); } finally { setBusy(false); }
    }
    return <main class="flex h-dvh items-start justify-center overflow-y-auto bg-bg p-6 text-neutral-950"><form onSubmit={e => void signIn(e)} class="mt-12 flex w-full max-w-sm flex-col gap-5"><h1 class="font-display text-3xl font-bold">{t('web.alpha.signin_title')}</h1><p class="text-sm text-neutral-500">{t('web.alpha.signin_hint')}</p><label class="flex flex-col gap-2 text-sm">{t('web.alpha.email')}<input class="rounded-md border border-border bg-surface p-3" type="email" autocomplete="username" required value={email()} onInput={e => setEmail(e.currentTarget.value)}/></label><label class="flex flex-col gap-2 text-sm">{t('web.alpha.password')}<input class="rounded-md border border-border bg-surface p-3" type="password" autocomplete="current-password" required value={password()} onInput={e => setPassword(e.currentTarget.value)}/></label><Show when={error()}><p role="alert" class="text-sm text-error-strong">{t('web.alpha.signin_error')}</p></Show><Button type="submit" disabled={busy()}>{t('web.alpha.signin')}</Button><Show when={settings.alphaOauth}><Button type="button" variant="secondary" disabled={busy()} onClick={() => void provider('google')}>Google</Button><Button type="button" variant="secondary" disabled={busy()} onClick={() => void provider('azure')}>Microsoft</Button></Show><AccessRequest/><a class="text-sm text-primary" href={`${base}inbox`}>{t('web.alpha.back')}</a></form></main>;
  }
  render(() => <SignIn/>, document.getElementById('root') as HTMLElement);
}
