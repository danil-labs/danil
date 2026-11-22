import { For, Show } from "solid-js";
import { addMcpServers, removeMcpServer } from "../queries/engine-mcp";
import { Button } from "../../../../ui/src/Button";
import { Textarea } from "../../../../ui/src/Textarea";
import { asFailure } from "../../../../ui/src/Failure";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import type Herramientas from "./ToolsView";
import type { createHerramientas } from "./ToolsState";

export function createAgentesDeHerramientas(props: Parameters<typeof Herramientas>[0], herramientas: ReturnType<typeof createHerramientas>) {
  const { bloqueado, setBloque, setPegando, pegando, bloque, cargar, setFallo, aMano } = herramientas;
  const Agentes = () => (
    <Show when={!props.solo}>
      <section class="grid grid-cols-[minmax(0,1fr)] gap-2">
        <div class="flex items-center justify-between gap-2">
          <h3 class="m-0 text-ui font-semibold">{t("settings.tools.others")}</h3>
          <Button
            variant="ghost"
            size="sm"
            class="shrink-0"
            disabled={bloqueado()}
            onClick={() => {
              setBloque("");
              setPegando((v) => !v);
            }}
          >
            {pegando()
              ? t("settings.tools.paste_cancel")
              : t("settings.tools.paste_open")}
          </Button>
        </div>

        <Show when={pegando()}>
          <div class="grid gap-2 rounded-md border border-border bg-surface-raised p-3">
            <p class="m-0 text-xs text-neutral-500">
              {t("settings.tools.paste_hint")}
            </p>
            <Textarea
              rows={4}
              class="font-mono text-caption"
              spellcheck={false}
              autocomplete="off"
              value={bloque()}
              onInput={(e) => setBloque(e.currentTarget.value)}
            />
            <div class="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                disabled={!bloque().trim()}
                onClick={() =>
                  void addMcpServers({ bloque: bloque() })
                    .then(() => {
                      setBloque("");
                      setPegando(false);
                      return cargar();
                    })
                    .catch((e) => setFallo(asFailure(e)))
                }
              >
                {t("settings.tools.paste_add")}
              </Button>
            </div>
          </div>
        </Show>

        <Show when={aMano().length > 0}>
          <ul class="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2 p-0">
            <For each={aMano()}>
              {(p) => (
                <li class="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2.5">
                  {/* Origen debajo del nombre: en su renglón, la URL
                      `shrink-0` ensanchaba la pantalla y sacaba «Quitar» de
                      la hoja. Lo que no cabe se corta; entera en `title`. */}
                  <span class="grid min-w-0 flex-1 gap-0.5">
                    <span class="truncate text-ui font-semibold">{p.name}</span>
                    {/* De dónde sale, nunca su credencial. */}
                    <span
                      class="truncate font-mono text-caption text-neutral-500"
                      title={p.detalle || undefined}
                    >
                      {p.detalle || t("settings.tools.no_source")}
                    </span>
                  </span>
                  <Show when={p.managed}>
                    <Badge forma="dato" class="shrink-0">
                      {t("settings.tools.harness")}
                    </Badge>
                  </Show>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="shrink-0"
                    disabled={p.managed || bloqueado()}
                    onClick={() =>
                      void removeMcpServer({ name: p.name })
                        .then(cargar)
                        .catch((e) => setFallo(asFailure(e)))
                    }
                  >
                    {t("settings.tools.remove")}
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </Show>
  );
  return { Agentes };
}
