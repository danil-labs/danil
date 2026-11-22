import { Match, Show } from "solid-js";
import { manifiesto, t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import Ellipsis from "lucide-solid/icons/ellipsis";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../../../ui/src/DropdownMenu";
import { SettingsRow } from "../../../../ui/src/SettingsLayout";
import type { Provider } from "./ProvidersModel";
import type { createProveedores } from "./ProvidersState";
import type { createFilaDeProveedor } from "./ProvidersRow";

export function createConexionDeProveedor(p: Provider, proveedores: ReturnType<typeof createProveedores>, fila: ReturnType<typeof createFilaDeProveedor>) {
  const { montajes, comprobar, verAreas, desconectar, setChoosing, choosing, configurarAcceso } = proveedores;
  const { esperaAqui, estado, espera, elegidas } = fila;
  const Conectado = () => (
    <Match when={p.connected && !esperaAqui() && !montajes()[p.id] ? p.connected : null}>
      {(c) => (
        <>
          <Show when={p.id === "github"} fallback={<>
            <SettingsRow
              label={t("settings.providers.account")}
              description={
                <Show
                  when={c().data.correo}
                  fallback={
                    <span>
                      {t("settings.providers.as")}{" "}
                      <strong>{c().identity.name}</strong>
                      <Show
                        when={c().identity.user !== c().identity.name}
                      >
                        {" "}
                        <span class="font-mono text-caption">{c().identity.user}</span>
                      </Show>
                      <Show
                        when={
                          c().workspace &&
                          c().workspace !== c().identity.user
                        }
                      >
                        {" · "}
                        <span class="font-mono text-caption">{c().workspace}</span>
                      </Show>
                    </span>
                  }
                >
                  <span class="flex flex-col gap-0.5">
                    <span class="font-mono text-caption">{c().data.correo}</span>
                    <strong class="text-neutral-950">
                      {c().identity.name}
                    </strong>
                    <span class="font-mono text-caption">{c().workspace}</span>
                  </span>
                </Show>
              }
            >
              <Button
                variant="ghost"
                size="compact"
                disabled={estado() !== null}
                title={espera()}
                onClick={() => void comprobar(p.id)}
              >
                {t("settings.providers.check")}
              </Button>
              <Button
                variant="ghost"
                size="compact"
                disabled={estado() !== null}
                title={espera()}
                onClick={() => {
                  void verAreas(p.id);
                }}
              >
                {t("settings.providers.scope")}
              </Button>
              <Button
                variant="ghost"
                size="compact"
                class="hover:text-error-strong"
                disabled={estado() !== null}
                title={
                  espera() ??
                  t("settings.providers.disconnect_title", { name: p.name })
                }
                onClick={() => void desconectar(p.id)}
              >
                {t("settings.providers.disconnect")}
              </Button>
            </SettingsRow>
            <Show when={p.select_area}>
              <SettingsRow
                label={t("settings.providers.choose_area")}
                description={
                  elegidas().length === 0
                    ? t("settings.providers.no_selected_areas")
                    : new Intl.ListFormat(manifiesto().formato).format(elegidas().map((area) => area.key))
                }
              >
                <div class="flex flex-wrap items-center justify-end gap-1.5">
                  <Button variant="outline" size="compact" disabled={estado() !== null} onClick={() => {
                    setChoosing((x) => ({ ...x, [p.id]: true }));
                    void verAreas(p.id);
                  }} aria-expanded={!!choosing()[p.id]}>
                    {t("settings.providers.choose_access")}
                  </Button>
                  <Show when={p.setup_url}>
                    {(url) => (
                      <Button
                        variant="ghost"
                        size="compact"
                        disabled={estado() !== null}
                        onClick={() => void configurarAcceso({ ...p, setup_url: url() })}
                      >
                        {t("settings.providers.configure_access")}
                      </Button>
                    )}
                  </Show>
                </div>
              </SettingsRow>
            </Show>
          </>}>
            <SettingsRow label={
              <span>
                <strong>{c().identity.name}</strong>
                <Show when={c().identity.user !== c().identity.name}>
                  {" · "}
                  <span class="font-mono text-xs">@{c().identity.user}</span>
                </Show>
              </span>
            } />
            <SettingsRow
              class="flex-wrap gap-x-8 gap-y-3"
              label={t("settings.providers.choose_area")}
              description={elegidas().length === 0
                ? t("settings.providers.no_selected_areas")
                : new Intl.ListFormat(manifiesto().formato).format(elegidas().map((area) => area.key))}
            >
              <div class="flex flex-wrap items-center gap-1.5">
                <Button variant="outline" size="compact" disabled={estado() !== null}
                  aria-expanded={!!choosing()[p.id]} onClick={() => {
                    setChoosing((x) => ({ ...x, [p.id]: true }));
                    void verAreas(p.id);
                  }}>
                  {t("providers.github.change_access")}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger as={Button} variant="ghost" size="iconCompact"
                    aria-label={t("providers.github.more_actions")}
                    title={espera() ?? t("providers.github.more_actions")}
                    disabled={estado() !== null}>
                    <Ellipsis size={16} aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent class="z-[90]" data-owns-escape>
                    <Show when={p.setup_url}>
                      {(url) => <DropdownMenuItem disabled={estado() !== null} onSelect={() => void configurarAcceso({ ...p, setup_url: url() })}>
                        {t("settings.providers.configure_access")}
                      </DropdownMenuItem>}
                    </Show>
                    <DropdownMenuItem disabled={estado() !== null} onSelect={() => void comprobar(p.id)}>
                      {t("providers.github.check_connection")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem class="text-error-strong" disabled={estado() !== null}
                      title={t("settings.providers.disconnect_title", { name: p.name })}
                      onSelect={() => void desconectar(p.id)}>
                      {t("providers.github.disconnect")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </SettingsRow>
            {/* El alcance por repositorio lo decide GitHub: la cuenta elegida
                aporta todo lo que su instalación alcanza, también lo nuevo. */}
            <Show when={elegidas().length > 0}>
              <SettingsRow label={t("settings.providers.repositories")} description={t("settings.providers.inherited_access")}>
                <Show when={p.setup_url}>
                  {(url) => (
                    <Button variant="ghost" size="compact" disabled={estado() !== null}
                      title={espera()}
                      onClick={() => void configurarAcceso({ ...p, setup_url: url() })}>
                      {t("settings.providers.change_on_github")}
                    </Button>
                  )}
                </Show>
              </SettingsRow>
            </Show>
          </Show>
        </>
      )}
    </Match>
  );
  return { Conectado };
}
