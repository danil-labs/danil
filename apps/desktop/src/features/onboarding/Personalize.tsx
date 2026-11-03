import { createSignal, onMount, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { Button } from "../../ui/Button";
import { prosaDe } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import { Comprobacion } from "./ConnectAI";
import { Integraciones, Plugins } from "./ToolCards";

/** La última pantalla del alta: el workspace, las herramientas con que ya se trabaja y los plugins. */
export default function Personalizar(props: {
  workspace: { id: string; nombre: string } | null;
  ia: string[];
  onAtras?: () => void;
  onListo: () => void;
}) {
  const [nombre, setNombre] = createSignal(props.workspace?.nombre ?? "");
  const [borrador, setBorrador] = createSignal(props.workspace?.nombre ?? "");
  const [error, setError] = createSignal<string | null>(null);
  const [integraciones, setIntegraciones] = createSignal(0);
  const [plugins, setPlugins] = createSignal({ instalados: 0, instalando: 0 });
  let titulo: HTMLHeadingElement | undefined;

  onMount(() => titulo?.focus({ preventScroll: true }));

  async function renombrar() {
    const nuevo = borrador().trim();
    const w = props.workspace;
    if (!nuevo) setBorrador(nombre());
    if (!w || !nuevo || nuevo === nombre()) return;
    const antes = nombre();
    setNombre(nuevo);
    setError(null);
    try {
      await invoke("rename_workspace", { id: w.id, name: nuevo });
      window.dispatchEvent(new CustomEvent("harness:workspace"));
    } catch (e) {
      setNombre(antes);
      setBorrador(antes);
      setError(prosaDe(e));
    }
  }

  const resumenPlugins = () => {
    const p = plugins();
    if (p.instalados && p.instalando) return t("onboarding.summary.plugins_both", { count: p.instalados, pending: p.instalando });
    if (p.instalados) return t("onboarding.summary.plugins", { count: p.instalados });
    return p.instalando ? t("onboarding.summary.plugins_installing") : t("onboarding.summary.no_plugins");
  };

  return (
    <>
      <div class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,36%)_minmax(0,64%)] md:overflow-hidden motion-safe:animate-entrar">
        <section class="flex flex-col gap-[22px] p-7">
          <div>
            <h1
              ref={titulo}
              tabindex="-1"
              class="m-0 text-3xl leading-[1.12] font-display font-bold tracking-[-0.03em] text-neutral-950 outline-none"
            >
              {t("onboarding.personalize.title")}
            </h1>
          </div>
          <div class="grid gap-1.5">
            <span class="text-ui font-semibold text-neutral-950">{t("onboarding.workspace.label")}</span>
            <Input
              value={borrador()}
              aria-label={t("onboarding.workspace.label")}
              disabled={!props.workspace}
              onFocus={(e) => e.currentTarget.select()}
              onInput={(e) => setBorrador(e.currentTarget.value)}
              onBlur={() => void renombrar()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void renombrar();
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                  setBorrador(nombre());
                  e.currentTarget.blur();
                }
              }}
            />
            <Show when={error()}>
              {(e) => <span class="text-xs text-error-strong">{e()}</span>}
            </Show>
          </div>
          <div class="border-t border-border pt-4">
            <Comprobacion
              compacta
              filas={[
                { hecho: true, texto: t("onboarding.check.environment") },
                { hecho: props.ia.length > 0, texto: props.ia.length ? props.ia.join(", ") : t("onboarding.summary.no_ai") },
                { hecho: true, texto: t("onboarding.summary.integrations", { count: integraciones() }) },
                { hecho: plugins().instalados > 0, enCurso: plugins().instalando > 0, texto: resumenPlugins() },
              ]}
            />
          </div>
        </section>
        <section class="flex min-h-0 flex-col gap-3 px-7 pb-5 md:overflow-y-auto md:pt-7 md:pl-2 [&>*]:shrink-0">
          <div class="grid gap-0.5">
            <h2 class="m-0 text-ui font-semibold text-neutral-950">{t("onboarding.tools.title")}</h2>
          </div>
          <Integraciones onCambio={setIntegraciones} />
          <div class="mt-2 grid gap-0.5">
            <h2 class="m-0 text-ui font-semibold text-neutral-950">{t("onboarding.plugins.title")}</h2>
          </div>
          <Plugins onCambio={setPlugins} />
        </section>
      </div>
      <footer class="flex flex-wrap items-center gap-2.5 border-t border-border px-5 py-3.5">
        <Show when={props.onAtras}>
          {(atras) => (
            <Button size="sm" variant="ghost" onClick={() => atras()()}>
              {t("onboarding.back")}
            </Button>
          )}
        </Show>
        <p class="m-0 text-xs text-neutral-500">
          {plugins().instalando ? t("onboarding.plugins.background", { count: plugins().instalando }) : ""}
        </p>
        <span class="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => props.onListo()}>
          {t("onboarding.personalize.later")}
        </Button>
        <Button size="sm" onClick={() => props.onListo()}>
          {t("onboarding.personalize.start")}
        </Button>
      </footer>
    </>
  );
}
