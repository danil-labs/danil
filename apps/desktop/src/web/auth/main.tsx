import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { render } from "solid-js/web";
import { aplicarLengua, t } from "../../lib/i18n";
import { seguirElTema } from "../../lib/theme";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import "../phrases";
import { authClient, authFailure } from "./client";
import { authDestination } from "./return";
import { AccessRequest } from "./AccessRequest";
import { WorkosAuthPage } from "./workos";

export function startAuth(settings: { supabaseUrl: string; supabaseKey: string; workos?: boolean }, root: HTMLElement) {
  aplicarLengua();
  seguirElTema();
  const base = import.meta.env.BASE_URL;
  const params = new URLSearchParams(window.location.search);
  const next = authDestination(params.get("next"), window.location.origin, base);
  if (settings.workos) {
    render(() => <WorkosAuthPage base={base} next={next} error={params.get("error")} />, root);
    return;
  }
  const callback = new URL(`${base}auth`, window.location.origin);
  callback.searchParams.set("next", next);
  const configured = !!settings.supabaseUrl && !!settings.supabaseKey;
  const client = configured ? authClient(settings.supabaseUrl, settings.supabaseKey) : null;

  function AuthPage() {
    const [email, setEmail] = createSignal("");
    const [password, setPassword] = createSignal("");
    const [busy, setBusy] = createSignal(true);
    const [pending, setPending] = createSignal(false);
    const [resent, setResent] = createSignal(false);
    const [error, setError] = createSignal("");
    let heading: HTMLHeadingElement | undefined;
    createEffect(() => {
      if (pending()) queueMicrotask(() => heading?.focus());
    });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.location.replace(next);
    };
    const clean = () => window.history.replaceState(null, "", `${callback.pathname}${callback.search}`);
    let unsubscribe: (() => void) | undefined;
    onCleanup(() => unsubscribe?.());

    onMount(() => {
      void (async () => {
        try {
          if (!client) {
            setError("unconfigured");
            return;
          }
          const { error: initialization } = await client.auth.initialize();
          const fragment = new URLSearchParams(window.location.hash.slice(1));
          if (initialization || params.has("error") || fragment.has("error")) {
            setError("callback_failed");
            return;
          }
          const tokenHash = params.get("token_hash");
          const type = params.get("type");
          if (tokenHash && (type === "email" || type === "signup")) {
            const { error: verification } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
            if (verification) {
              setError("callback_failed");
              return;
            }
          }
          if (params.has("code") && new URLSearchParams(window.location.search).has("code")) {
            setError("callback_failed");
            return;
          }
          const { data, error: sessionError } = await client.auth.getSession();
          if (sessionError) setError("callback_failed");
          else if (data.session) finish();
          else if (params.has("code") || tokenHash || fragment.has("access_token")) setError("callback_failed");
          const { data: listener } = client.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_IN" && session) finish();
          });
          unsubscribe = () => listener.subscription.unsubscribe();
        } catch {
          setError("failed");
        } finally {
          clean();
          setBusy(false);
        }
      })();
    });

    async function submit() {
      if (!client || busy()) return;
      setBusy(true);
      setError("");
      try {
        const credentials = { email: email().trim(), password: password() };
        const result = await client.auth.signInWithPassword(credentials);
        if (result.error) {
          setError(authFailure(result.error));
          if (result.error.code === "email_not_confirmed") setPending(true);
        } else if (result.data.session) finish();
        else setPending(true);
      } catch {
        setError("failed");
      } finally {
        setPassword("");
        setBusy(false);
      }
    }

    async function provider(provider: "google" | "azure") {
      if (!client || busy()) return;
      setBusy(true);
      setError("");
      try {
        const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: callback.toString(), ...(provider === "azure" ? { scopes: "email" } : {}) } });
        if (error) setError(authFailure(error));
      } catch {
        setError("failed");
      } finally {
        setBusy(false);
      }
    }

    async function resend() {
      if (!client || busy()) return;
      setBusy(true);
      setError("");
      setResent(false);
      try {
        const { error } = await client.auth.resend({ type: "signup", email: email().trim(), options: { emailRedirectTo: callback.toString() } });
        if (error) setError(authFailure(error));
        else setResent(true);
      } catch {
        setError("failed");
      } finally {
        setBusy(false);
      }
    }

    return (
      <main class="flex h-full flex-col items-center overflow-y-auto bg-bg px-6 py-10 text-neutral-950" data-web-auth={pending() ? "confirmation" : "signin"} aria-busy={busy()}>
        <div class="grid w-full max-w-sm gap-6">
          <h1 class="m-0 text-3xl font-display font-bold tracking-[-0.03em]">{t("common.brand_name")}</h1>
          <div class="grid gap-2">
            <h2 ref={heading} tabIndex={-1} class="m-0 text-xl font-semibold">{pending() ? t("web.auth.check_email") : t("web.auth.signin_title")}</h2>
            <p class="m-0 text-sm text-neutral-500" role="status">{pending() ? t("web.auth.confirm_hint", { email: email().trim() }) : t("web.auth.identity_hint")}</p>
          </div>
          <Show when={!pending()} fallback={
            <div class="grid gap-3">
              <Button class="min-h-11" disabled={busy() || !client} onClick={() => void resend()}>{t("web.auth.resend")}</Button>
              <Button class="min-h-11" variant="ghost" disabled={busy()} onClick={() => { setPending(false); setError(""); setResent(false); }}>{t("web.auth.other_email")}</Button>
              <Show when={resent()}><p class="m-0 text-sm text-neutral-500" role="status">{t("web.auth.resent")}</p></Show>
            </div>
          }>
            <div class="grid gap-3">
              <Button class="min-h-11 border-neutral-500" variant="secondary" disabled={busy() || !client} onClick={() => void provider("google")}>{t("web.auth.google")}</Button>
              <Button class="min-h-11 border-neutral-500" variant="secondary" disabled={busy() || !client} onClick={() => void provider("azure")}>{t("web.auth.microsoft")}</Button>
            </div>
            <p class="m-0 text-center text-sm text-neutral-500">{t("web.auth.or_email")}</p>
            <form class="grid gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <label class="grid gap-2 text-sm">
                {t("web.auth.email")}
                <Input class="min-h-11 border-neutral-500 text-base" type="email" name="email" autocomplete="email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} disabled={busy()} />
              </label>
              <label class="grid gap-2 text-sm">
                {t("web.auth.password")}
                <Input class="min-h-11 border-neutral-500 text-base" type="password" name="password" autocomplete="current-password" required value={password()} onInput={(e) => setPassword(e.currentTarget.value)} disabled={busy()} />
              </label>
              <Button class="min-h-11" type="submit" disabled={busy() || !client}>{t("web.auth.signin")}</Button>
            </form>
            <AccessRequest />
          </Show>
          <Show when={busy()}><p class="m-0 text-sm text-neutral-500" role="status">{t("web.auth.waiting")}</p></Show>
          <Show when={error()}><p class="m-0 text-sm text-error-strong" role="alert">{t(`web.auth.${error()}`)}</p></Show>
        </div>
      </main>
    );
  }
  render(() => <AuthPage />, root);
}
