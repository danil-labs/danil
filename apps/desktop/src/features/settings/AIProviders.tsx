import { createMemo, For, Index, Match, Show, Switch } from "solid-js";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { FailureNote } from "../../ui/Failure";
import { Skeleton } from "../../ui/Skeleton";
import { aiProvidersView, SUPPORTED_AGENTS, type SurfacesState } from "./ai-providers-view";
import { prosa } from "../../lib/prose";
import type { Superficie } from "../../lib/surfaces";
import { rotuloDeSuperficie } from "../../lib/surfaces";
import { Badge } from "../../ui/Badge";
import { rotuloDeMarca } from "../chat/marks";
import Accounts from "./Accounts";
import { GovernedNotice } from "./Governed";
import { SettingsPanel } from "./layout";

/**
 * Las superficies del mismo agente comparten sección. Cada una conserva su
 * cuenta o consentimiento y su estado dentro de esa sección. Los gratuitos
 * van aparte: no piden cuenta y su decisión es a dónde sale el material.
 */
export default function AIProviders(props: { superficies: Superficie[]; agentesEnUso: string[]; estado?: SurfacesState; onRetry?: () => void }) {
  const vista = () => aiProvidersView(props.estado ?? { k: "ready" }, props.superficies.length);
  const grupos = createMemo(() => {
    const vistos = new Map<string, Superficie[]>();
    for (const superficie of props.superficies) {
      const clave = superficie.catalogo === "gratuitos" ? superficie.id : superficie.provider;
      const grupo = vistos.get(clave);
      if (grupo) grupo.push(superficie);
      else vistos.set(clave, [superficie]);
    }
    return [...vistos.values()];
  });

  const nombreDe = (superficie: Superficie, enGrupo: boolean) => {
    if (superficie.provider === "opencode-zen" && superficie.catalogo === "de_pago") {
      return t("settings.ai_providers.opencode_detail");
    }
    // El título de la sección ya lo nombra; la fila deja solo el aviso.
    if (superficie.catalogo === "gratuitos") return enGrupo ? rotuloDeSuperficie(superficie) : "";
    return enGrupo ? rotuloDeSuperficie(superficie) : undefined;
  };

  return (
    <SettingsPanel>
      <GovernedNotice section="models" />
      <Switch>
        <Match when={vista() === "loading"}>
          <div class="grid gap-3" data-ai-providers="loading">
            <p role="status" class="m-0 text-ui text-neutral-500">{t("settings.ai_providers.loading")}</p>
            <Skeleton filas={3} class="h-12" />
          </div>
        </Match>
        <Match when={vista() === "failed" && props.estado?.k === "failed" ? props.estado.f : null}>
          {(f) => (
            <div class="grid gap-2" data-ai-providers="failed">
              <FailureNote f={f()} />
              <Show when={props.onRetry}>
                {(retry) => <Button size="sm" variant="secondary" class="justify-self-start" onClick={() => retry()()}>{t("settings.ai_providers.retry")}</Button>}
              </Show>
            </div>
          )}
        </Match>
        <Match when={vista() === "supported"}>
          <div class="grid gap-6" data-ai-providers="supported">
            <p role="status" class="m-0 text-ui text-neutral-500">{t("settings.ai_providers.none_installed")}</p>
            <For each={SUPPORTED_AGENTS}>
              {(id) => <Accounts agente={id} titulo={t(`settings.ai_providers.agent_${id}`)} />}
            </For>
          </div>
        </Match>
      </Switch>
      {/* `list_surfaces` devuelve objetos nuevos en cada refresco. `Index`
          conserva el login en curso por posición; el orden
          estable lo fijan `agents::AGENTS` y `surfaces::declaradas`. */}
      <Index each={grupos()}>
        {(grupo) => (
          <Accounts
            agente={grupo()[0].provider}
            soloGratuitos={grupo()[0].catalogo === "gratuitos"}
            titulo={grupo().length > 1 ? grupo()[0].label : rotuloDeSuperficie(grupo()[0])}
            subtitulo={grupo()[0].catalogo === "gratuitos" ? t("settings.ai_providers.free_detail") : undefined}
            nombre={nombreDe(grupo()[0], grupo().length > 1)}
            marca={<Marca superficie={grupo()[0]} />}
            desplegado={props.agentesEnUso.includes(grupo()[0].provider)}
          >
            <Index each={grupo().slice(1)}>
              {(superficie) => (
                <Accounts
                  agente={superficie().provider}
                  soloGratuitos={superficie().catalogo === "gratuitos"}
                  nombre={nombreDe(superficie(), true)}
                  marca={<Marca superficie={superficie()} />}
                />
              )}
            </Index>
          </Accounts>
        )}
      </Index>
    </SettingsPanel>
  );
}

function Marca(props: { superficie: Superficie }) {
  return (
    <Show when={props.superficie.marca}>
      {(marca) => (
        <Badge
          forma="dato"
          class="shrink-0"
          title={((p) => (p ? prosa(p) : undefined))(props.superficie.porque)}
        >
          {rotuloDeMarca(marca())}
        </Badge>
      )}
    </Show>
  );
}
