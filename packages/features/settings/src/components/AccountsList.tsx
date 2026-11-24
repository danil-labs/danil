import Ellipsis from "lucide-solid/icons/ellipsis";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Trash2 from "lucide-solid/icons/trash-2";
import { For, Show, Suspense } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { capabilities } from "../../../../host/src/platform";
import { Button } from "../../../../ui/src/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../../../ui/src/DropdownMenu";
import { Pressable } from "../../../../ui/src/Pressable";
import { accountPresentation } from "../screens/AccountCard";
import type Accounts from "./AccountsView";
import type { createCuentas } from "./AccountsState";
import type { createConexionDeCuentas } from "./AccountsConnect";
import type { createAccionesDeCuentas } from "./AccountsActions";
import type { createPartesDeCuentas } from "./AccountsParts";
import { CuentaConfigurada } from "./AccountsConfigured";
import { CredentialsInUse } from "./AccountsModel";

export function createListaDeCuentas(props: Parameters<typeof Accounts>[0], cuentas: ReturnType<typeof createCuentas>, conexion: ReturnType<typeof createConexionDeCuentas>, acciones: ReturnType<typeof createAccionesDeCuentas>, partes: ReturnType<typeof createPartesDeCuentas>) {
  const { tarjetas, lista, estados, agente, comprobando, sinComprobar, conectadaVez, enCurso, setPorQuitar, porQuitar } = cuentas;
  const { etiqueta, comprobar, proveedor, conectar, agregar, refrescar, claveDe } = conexion;
  const { usar, quitar, renombrar } = acciones;
  const { hayCuentas } = partes;
  const Lista = () => (
    <Show when={hayCuentas()}>
    <ul class="m-0 -ml-6 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,max(24rem,calc((100%_-_1rem)/3_-_1px))),1fr))] gap-2 p-0" data-account-grid="">
      <For each={tarjetas}>
        {(a, i) => {
          const activa = () => a.id === lista()?.active || !!a.machines?.some((m) => m.id === lista()?.active);
          const estado = () => estados()[a.id];

          return (
            <li class="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2">
            <CuentaConfigurada
              account={a}
              maquinas={props.maquinas}
              agent={agente()}
              agentLabel={etiqueta()}
              active={activa()}
              status={estado()}
              checkingStatus={comprobando()[a.id]}
              statusUnknown={sinComprobar()[a.id] && a.authenticated_at !== null}
              onRecheckStatus={() => comprobar(a.id)}
              onRename={(label) => renombrar(a.id, label)}
              supportsLimits={proveedor()?.limits ?? false}
              order={i()}
              afterStatusChange={conectadaVez()[a.id] ?? 0}
              actions={(info) => {
                const caida = () => info.revocada || estado()?.authenticated === false;
                // Autenticada alguna vez y sin respuesta ahora: se ofrece
                // preguntar de nuevo, y reconectar por si no era el plazo.
                const dudosa = () => !caida() && info.sinComprobar;
                return (
                  <>
                    <Show when={dudosa()}>
                      <Button
                        variant="outline"
                        size="compact"
                        disabled={comprobando()[a.id]}
                        onClick={() => void comprobar(a.id)}
                      >
                        {t("settings.accounts.retry")}
                      </Button>
                    </Show>
                    {/* Un solo botón visible: reconectar si se cayó o no se pudo comprobar, usarla si no es la activa. */}
                    <Show
                      when={caida() || dudosa()}
                      fallback={
                        <Show when={!activa()}>
                          <Button
                            variant="outline"
                            size="compact"
                            title={t("settings.accounts.use_title")}
                            onClick={() => void usar(a.id)}
                          >
                            {t("settings.accounts.use")}
                          </Button>
                        </Show>
                      }
                    >
                      <Button
                        variant="outline"
                        size="compact"
                        onClick={() => void conectar(a.id)}
                        disabled={enCurso() !== null}
                        title={
                          enCurso() !== null
                            ? t("settings.accounts.busy")
                            : t("settings.accounts.connect_title", { agent: etiqueta() })
                        }
                      >
                        {a.authenticated_at
                          ? t("settings.accounts.reconnect")
                          : t("settings.accounts.connect")}
                      </Button>
                    </Show>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={t("settings.accounts.more_actions", { name: accountPresentation(a, estado()).name })}
                        title={t("settings.accounts.more_actions", { name: accountPresentation(a, estado()).name })}
                        class="grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary data-[expanded]:bg-surface-muted data-[expanded]:text-neutral-950"
                      >
                        <Ellipsis size={16} />
                      </DropdownMenuTrigger>
                      {/* Configuración es un Dialog en z-[80] que cierra con Esc salvo dentro de data-owns-escape. */}
                      <DropdownMenuContent class="z-[90]" data-owns-escape>
                        {/* Reconectar reescribe la credencial en su carpeta; quitar la borra. */}
                        <Show when={!caida() && !dudosa()}>
                          <DropdownMenuItem
                            class="flex items-center gap-2"
                            disabled={enCurso() !== null}
                            onSelect={() => void conectar(a.id)}
                          >
                            <RefreshCw size={14} aria-hidden />
                            {t("settings.accounts.reconnect")}
                          </DropdownMenuItem>
                        </Show>
                        <Show when={!caida() && !dudosa()}>
                          <DropdownMenuSeparator />
                        </Show>
                        <Show when={!a.machines}>
                          <DropdownMenuItem
                            class="flex items-center gap-2 text-error-strong"
                            onSelect={() => setPorQuitar(a.id)}
                          >
                            <Trash2 size={14} aria-hidden />
                            {t("settings.accounts.remove")}
                          </DropdownMenuItem>
                        </Show>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                );
              }}
              destructiveAction={
                porQuitar() === a.id ? (
                  <>
                    <Pressable
                      class="min-h-6 whitespace-nowrap rounded-md border border-error-strong bg-transparent px-2 text-xs font-medium text-error-strong"
                      onClick={() => void quitar(a.id)}
                    >
                      {t("settings.accounts.remove_yes")}
                    </Pressable>
                    <Button
                      variant="outline"
                      size="compact"
                      onClick={() => setPorQuitar(null)}
                    >
                      {t("settings.accounts.remove_no")}
                    </Button>
                  </>
                ) : undefined
              }
            />
            {capabilities().accountMachines?.({ account: a, provider: agente(), add: agregar, refresh: () => void refrescar() })}
            <Show when={claveDe()}>
              <Suspense fallback={null}>
                <CredentialsInUse match={(c) => c.kind === "api_key" && c.config.agent === agente() && c.config.account === a.id} />
              </Suspense>
            </Show>
            </li>
          );
        }}
      </For>
    </ul>
    </Show>
  );
  return { Lista };
}
