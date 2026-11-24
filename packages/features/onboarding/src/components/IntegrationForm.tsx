import ExternalLink from "lucide-solid/icons/external-link";
import { For, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { prosa } from "../../../../ui/src/lib/prose";
import { cn } from "../../../../ui/src/lib/utils";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { Pressable } from "../../../../ui/src/Pressable";
import { explicar } from "../queries/connect-store";
import { connectGitHost, openExternal } from "../queries";
import { type Integracion, SIN_BORRADOR } from "../model/tool-cards";
import type { EstadoDeIntegraciones } from "../queries/integrations-state";
import type { Conexiones } from "../queries/integrations-connect";
import { EspacioEnNegrita, MarcaIntegracion } from "./ToolCardParts";

/** El formulario de datos y token de un servicio de código, y su envío. */
export function createFormulario(estado: EstadoDeIntegraciones, conexiones: Conexiones) {
  const { estados, setEstados, errores, setErrores, setBorradores, motivos, setMotivos, scope, proveedor, borrador } = estado;
  const { cargar, cancelar } = conexiones;
  async function conectarConToken(i: Integracion) {
    const p = proveedor(i.id);
    const b = borrador(i.id);
    if (!p || !b.token.trim() || p.fields.some((c) => c.required && !b.data[c.id]?.trim())) return;
    setErrores(i.id, null);
    setEstados(i.id, { k: "conectando" });
    try {
      const data = Object.fromEntries(Object.entries(b.data).map(([k, v]) => [k, v.trim()]));
      await connectGitHost(await scope, i.id, data, b.token.trim());
      setBorradores(i.id, SIN_BORRADOR);
      setMotivos(i.id, null);
      setEstados(i.id, { k: "libre" });
      await cargar();
    } catch (e) {
      const texto = explicar(e);
      setErrores(i.id, i.id === "bitbucket" && texto !== t("onboarding.ai.error.keyring") ? t("onboarding.tools.bitbucket.invalid") : texto);
      setEstados(i.id, { k: "formulario" });
    }
  }

  /** Datos y token del servicio, con los textos que da el motor; Bitbucket con los del diseño. */
  function Formulario(q: { i: Integracion }) {
    const p = () => proveedor(q.i.id);
    const ocupado = () => estados[q.i.id]?.k === "conectando";
    const error = () => errores[q.i.id];
    const bitbucket = q.i.id === "bitbucket";
    const poner = (campo: string, valor: string) =>
      setBorradores(q.i.id, (b) => ({ ...(b ?? SIN_BORRADOR), data: { ...(b?.data ?? {}), [campo]: valor } }));
    const listo = () =>
      Boolean(p()) && borrador(q.i.id).token.trim() !== "" && !p()!.fields.some((c) => c.required && !borrador(q.i.id).data[c.id]?.trim());
    const alEnter = (e: KeyboardEvent) => {
      if (e.key === "Enter" && listo() && !ocupado()) void conectarConToken(q.i);
    };
    return (
      <Show when={p()}>
        {(prov) => (
          <div class="grid gap-2 rounded-lg border border-primary bg-surface-raised px-4 py-3.5 motion-safe:animate-entrar">
            <p class="m-0 flex items-center gap-2 text-ui">
              <MarcaIntegracion id={q.i.id} size={16} />
              <strong class="font-semibold">{t("onboarding.tools.credential.title", { name: q.i.nombre })}</strong>
            </p>
            <Show when={motivos[q.i.id]}>
              {(m) => (
                <p class="m-0 text-xs break-words text-error-strong" role="alert">
                  {m()}
                </p>
              )}
            </Show>
            <div class="grid gap-3 md:grid-cols-2">
              <For each={prov().fields}>
                {(c, n) => (
                  <label class="grid gap-1.5">
                    <span class="text-ui font-semibold">
                      {bitbucket ? t("onboarding.tools.bitbucket.space") : prosa(c.label)}
                    </span>
                    <Input
                      spellcheck={false}
                      placeholder={bitbucket ? t("onboarding.tools.bitbucket.space_placeholder") : undefined}
                      value={borrador(q.i.id).data[c.id] ?? ""}
                      disabled={ocupado()}
                      ref={(el) => n() === 0 && queueMicrotask(() => el.focus())}
                      onInput={(e) => poner(c.id, e.currentTarget.value)}
                      onKeyDown={alEnter}
                    />
                    <span class="text-xs text-neutral-500">
                      {bitbucket ? <EspacioEnNegrita /> : prosa(c.help)}
                    </span>
                  </label>
                )}
              </For>
              <label class="grid gap-1.5">
                <span class="text-ui font-semibold">
                  {bitbucket ? t("onboarding.tools.bitbucket.token") : prosa(prov().token_label)}
                </span>
                <Input
                  type="password"
                  class={cn("font-mono tracking-[0.02em]", error() && "border-error-strong")}
                  autocomplete="off"
                  spellcheck={false}
                  placeholder={bitbucket ? t("onboarding.tools.bitbucket.token_placeholder") : undefined}
                  value={borrador(q.i.id).token}
                  disabled={ocupado()}
                  aria-invalid={error() ? true : undefined}
                  ref={(el) => prov().fields.length === 0 && queueMicrotask(() => el.focus())}
                  onInput={(e) => {
                    setErrores(q.i.id, null);
                    setBorradores(q.i.id, (b) => ({ ...(b ?? SIN_BORRADOR), token: e.currentTarget.value }));
                  }}
                  onKeyDown={alEnter}
                />
                <Show
                  when={error()}
                  fallback={
                    <span class="text-xs text-neutral-500">
                      {bitbucket ? t("onboarding.tools.bitbucket.token_hint") : prosa(prov().token_help)}{" "}
                      <Pressable
                        class="inline-flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-primary hover:underline"
                        onClick={() => void openExternal(prov().token_url).catch(() => {})}
                      >
                        {t("onboarding.tools.credential.create_token")}
                        <ExternalLink size={11} aria-hidden="true" />
                      </Pressable>
                    </span>
                  }
                >
                  {(e) => (
                    <span class="text-xs break-words text-error-strong" role="alert">
                      {e()}
                    </span>
                  )}
                </Show>
              </label>
            </div>
            <div class="mt-0.5 flex flex-wrap items-center gap-2">
              <span class="text-xs text-neutral-500">{t("onboarding.tools.credential.stored")}</span>
              <span class="flex-1" />
              <Button size="sm" variant="ghost" disabled={ocupado()} onClick={() => void cancelar(q.i)}>
                {t("onboarding.cancel")}
              </Button>
              <Button size="sm" disabled={ocupado() || !listo()} onClick={() => void conectarConToken(q.i)}>
                {ocupado() ? t("onboarding.ai.checking") : t("onboarding.ai.connect")}
              </Button>
            </div>
          </div>
        )}
      </Show>
    );
  }

  return { conectarConToken, Formulario };
}
