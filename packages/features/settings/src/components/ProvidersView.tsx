import type { MaquinasDeAjustes } from "../model/machines-port";
import { For, Match, Show, Suspense, Switch, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { capabilities, isNoMachines } from "../../../../host/src/platform.ts";
import { FailureNote } from "../../../../ui/src/Failure";
import { Skeleton } from "../../../../ui/src/Skeleton";
import { MarcaGitHost } from "../../../../ui/src/icons";
import { t } from "../../../../ui/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { Toggle } from "../../../../ui/src/Toggle";
import { SettingsBlock, SettingsPanel, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";
import { ExternalLink } from "../../../../ui/src/ExternalLink";
import { createProveedores } from "./ProvidersState";
import { createAccionesDeProveedores } from "./ProvidersActions";
import { createFilaDeProveedor } from "./ProvidersRow";
import { createConexionDeProveedor } from "./ProvidersConnected";
import { createFormularioDeProveedor } from "./ProvidersForm";
import { GithubAccount, LocalKeysBanner, CredentialsInUse } from "./ProvidersModel";
import { MachineRequiredNotice } from "./MachineRequiredNotice";

/**
 * `solo` limita el catálogo a uno o varios proveedores. Configuración los
 * compone por sección sin volver a hacer de cada uno un destino del riel.
 */
export type ProvidersProps = {
  workspace?: string | null;
  solo?: string | string[];
  integraciones?: (p: { solo: string[]; onCambio: () => void }) => JSX.Element;
  maquinas: MaquinasDeAjustes;
};

export default function Providers(props: ProvidersProps) {
  const [generation, setGeneration] = createSignal(1);
  onMount(() => {
    const changed = () => setGeneration((n) => n + 1);
    window.addEventListener("harness:workspace", changed);
    onCleanup(() => window.removeEventListener("harness:workspace", changed));
  });
  return (
    <Show when={generation()} keyed>
      {(_generation) => <WorkspaceProviders workspace={props.workspace} solo={props.solo} integraciones={props.integraciones} maquinas={props.maquinas} />}
    </Show>
  );
}

function WorkspaceProviders(props: ProvidersProps) {
  const proveedores = createProveedores(() => props.workspace);
  const { cargando, fallo, githubAccount, conectarEnNavegador, hostUsable, hostGithub, savingHost, changeHostGithub, hostFailure, scopeId, setGithubAccount, githubLocal, cancelarNavegador, montajes, actualizarAcceso, cliFailure, cli, loadingCli, installingCli, installCli } = proveedores;
  const accionesDeProveedores = createAccionesDeProveedores(props, proveedores);
  const { visibles } = accionesDeProveedores;
  return (
    <Show when={!cargando()} fallback={<Skeleton filas={3} />}>
      <Show when={!fallo()} fallback={<FailureNote f={fallo()!} />}>
        <SettingsPanel>
          <For each={visibles()}>
            {(p) => {
              const fila = createFilaDeProveedor(p, proveedores);
              const { esperaAqui, estado, falla, mostrarAreas } = fila;
              const { Conectado } = createConexionDeProveedor(p, proveedores, fila);
              const { Formulario, Areas } = createFormularioDeProveedor(p, proveedores, accionesDeProveedores, fila);
              return (
                <SettingsSection
                  title={
                    <span class="inline-flex items-center gap-2">
                      <MarcaGitHost id={p.id} size={16} />
                      {p.name}
                    </span>
                  }
                  aside={
                    <Switch
                      fallback={
                        <Badge>{t("settings.providers.state.off")}</Badge>
                      }
                    >
                      {/* GitHub (Control de código): sin insignias. Sin conexión, solo «Conectar». */}
                      <Match when={p.id === "github" && githubAccount().mode === "account"}>
                        <Show when={!githubAccount().connected ? githubAccount().connect : null}>
                          {(connect) => (
                            <Button variant="secondary" size="sm" type="button" onClick={() => connect()()}>
                              {t("providers.github.connect")}
                            </Button>
                          )}
                        </Show>
                      </Match>
                      <Match when={p.id === "github" && githubAccount().mode === "local"}>
                        <Show when={!p.connected && p.browser_login && !esperaAqui()}>
                          <Button variant="secondary" size="sm" type="button" disabled={estado() !== null} onClick={() => void conectarEnNavegador(p)}>
                            {t("providers.github.connect")}
                          </Button>
                        </Show>
                      </Match>
                      <Match when={p.id === "github"}>{null}</Match>
                      <Match when={estado() === "comprobando"}>
                        <Badge>{t("settings.providers.state.checking")}</Badge>
                      </Match>
                      {/* Antes que `conectado`: la conexión está guardada, pero
                          nadie ha podido confirmar hoy que siga valiendo. */}
                      <Match when={p.connected && p.unverified}>
                        <Badge tone="warning">
                          {t("settings.providers.state.unverified")}
                        </Badge>
                      </Match>
                      <Match when={p.connected}>
                        <Badge tone="success">{t("settings.providers.state.on")}</Badge>
                      </Match>
                    </Switch>
                  }
                >
                  <Show when={p.id === "github" && capabilities().nativeWindow && (hostUsable() || hostGithub())}>
                    <SettingsRow
                      label={t("providers.github.host_mode.title")}
                      description={hostGithub() && !hostUsable() ? t("providers.github.host_mode.ignored") : undefined}
                    >
                      <Toggle
                        checked={hostGithub()}
                        label={t("providers.github.host_mode.title")}
                        disabled={savingHost()}
                        onChange={(on) => void changeHostGithub(on)}
                      />
                    </SettingsRow>
                    <Show when={hostFailure()}>{(f) => <FailureNote f={f()} />}</Show>
                  </Show>
                  <Show when={p.id === "github" ? scopeId() : null}>
                    {(id) => (
                      <Suspense fallback={null}>
                        <GithubAccount scope={id()} local={!!p.connected} onState={setGithubAccount} />
                      </Suspense>
                    )}
                  </Show>
                  <Show when={githubLocal(p.id) && p.id === "github" && p.source === "legacy" && p.browser_login && !esperaAqui()}>
                    <SettingsRow label={
                      <span class="inline-flex items-center gap-2 text-warning-strong">
                        <Badge tone="warning">{t("providers.github.legacy.badge")}</Badge>
                        {t("providers.github.legacy.title")}
                      </span>
                    }>
                      <Button size="sm" type="button" disabled={estado() !== null} onClick={() => void conectarEnNavegador(p)}>
                        {t("providers.github.connect")}
                      </Button>
                    </SettingsRow>
                  </Show>
                  {/* La App Danil sin sesión: al iniciar sesión la conexión sube a la cuenta. */}
                  <Show when={githubLocal(p.id) && p.id === "github" && p.source === "device" && p.connected && githubAccount().session === false}>
                    <SettingsRow label={<span class="text-warning-strong">{t("providers.github.device.only_here")}</span>}>
                      <Button variant="secondary" size="sm" type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent("harness:open-settings", { detail: "cuenta-danil" }))}>
                        {t("providers.github.device.sign_in")}
                      </Button>
                    </SettingsRow>
                  </Show>
                  <Show when={githubLocal(p.id)}>
                  <Switch>
                    <Conectado />

                    <Match when={esperaAqui()}>
                      {(e) => (
                        <>
                          <SettingsRow
                            label={t("settings.providers.waiting", { name: p.name })}
                            description={
                              <ExternalLink url={e().url}>
                                {t("settings.providers.open", { name: p.name })}
                              </ExternalLink>
                            }
                          >
                            <Button
                              variant="outline"
                              size="compact"
                              onClick={() => cancelarNavegador(p.id)}
                            >
                              {t("settings.providers.cancel")}
                            </Button>
                          </SettingsRow>
                          <SettingsBlock>
                            <p class="m-0 select-all rounded-sm bg-surface-muted p-2 text-center font-mono text-xl tracking-[0.12em]">{e().code}</p>
                          </SettingsBlock>
                        </>
                      )}
                    </Match>

                    {/* Sin código que teclear: aquí la persona no copia nada,
                        elige repositorios en una página que ya está abierta. Lo
                        que la pantalla aporta es que la espera se ve y se puede
                        cortar. */}
                    <Match when={montajes()[p.id]}>
                      {(url) => (
                        <SettingsRow
                          label={t("settings.providers.setup_waiting", { name: p.name })}
                          description={
                            <ExternalLink url={url()}>
                              {t("settings.providers.open", { name: p.name })}
                            </ExternalLink>
                          }
                        >
                          <Button size="compact" disabled={estado() !== null} onClick={() => void actualizarAcceso(p.id)}>
                            {t("settings.providers.refresh_access")}
                          </Button>
                          <Button
                            variant="outline"
                            size="compact"
                            onClick={() => cancelarNavegador(p.id)}
                          >
                            {t("settings.providers.cancel")}
                          </Button>
                        </SettingsRow>
                      )}
                    </Match>

                    <Formulario />
                  </Switch>
                  </Show>

                  <Show when={falla()}>
                    {(f) => (
                      <SettingsBlock>
                        <FailureNote f={f()} />
                      </SettingsBlock>
                    )}
                  </Show>

                  <Show when={estado() === "listando" && mostrarAreas()}>
                    <SettingsBlock>
                      <Skeleton filas={2} class="h-6" />
                    </SettingsBlock>
                  </Show>

                  <Areas />
                  <Show when={p.id === "github" && !isNoMachines()}>
                    <SettingsBlock>
                      <details>
                        <summary class="cursor-pointer rounded-sm text-sm text-neutral-500 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                          {t("providers.github.agent_tools")}
                          <Show when={cliFailure() || (cli()?.available && !cli()?.managed_supported)}>
                            {" "}
                            <Badge tone="warning">{t("providers.github.cli.attention")}</Badge>
                          </Show>
                        </summary>
                        <SettingsRow label={t("providers.github.cli.title")}>
                          <Show when={cli()} fallback={
                            <Show when={loadingCli()} fallback={
                              <Show when={!cliFailure()}><span class="text-xs text-neutral-500">{t("providers.github.cli.unavailable")}</span></Show>
                            }><Skeleton filas={1} class="h-6" /></Show>
                          }>{(info) => <>
                            <span class="text-xs text-neutral-500">{info().version ?? t("providers.github.cli.absent")}</span>
                            <Show when={!info().managed_supported && info().installable}>
                              <Button variant="secondary" size="compact" disabled={installingCli()} onClick={() => void installCli()}>
                                {installingCli() ? t("providers.github.cli.installing") : t("providers.github.cli.install")}
                              </Button>
                            </Show>
                            <Show when={info().managed_supported}><Badge>{t("providers.github.cli.ready")}</Badge></Show>
                          </>}</Show>
                        </SettingsRow>
                      </details>
                      <Show when={cliFailure()}>{(f) => <FailureNote f={f()} />}</Show>
                    </SettingsBlock>
                  </Show>
                </SettingsSection>
              );
            }}
          </For>
          <Show when={isNoMachines()}>
            <MachineRequiredNotice />
          </Show>
          <Show when={!props.solo && !isNoMachines() && props.integraciones}>
            {(Integraciones) => (
              <>
                <SettingsSection title={t("onboarding.tools.drive")} description={t("onboarding.tools.about.drive")}>
                  <div class="mt-3">
                    <Suspense fallback={null}>
                      {Integraciones()({ solo: ["drive"], onCambio: () => {} })}
                    </Suspense>
                  </div>
                </SettingsSection>
                <SettingsSection title={t("onboarding.tools.references.group")} description={t("onboarding.tools.references.about")}>
                  <div class="mt-3">
                    <Suspense fallback={null}>
                      {Integraciones()({ solo: ["zotero"], onCambio: () => {} })}
                      <LocalKeysBanner kinds={["zotero"]} maquinas={props.maquinas} />
                      <CredentialsInUse kinds={["zotero"]} title={t("danil.credentials.zotero_title")} />
                    </Suspense>
                  </div>
                </SettingsSection>
              </>
            )}
          </Show>
        </SettingsPanel>
      </Show>
    </Show>
  );
}
