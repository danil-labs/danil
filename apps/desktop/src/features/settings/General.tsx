import { open } from "@tauri-apps/plugin-dialog";
import Files from "lucide-solid/icons/files";
import FolderOpen from "lucide-solid/icons/folder-open";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Search from "lucide-solid/icons/search";
import Trash2 from "lucide-solid/icons/trash-2";
import { createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import { df } from "../../lib/format";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { abbreviateHomePath, remoteHost, remotePathLabel } from "../../lib/remote-path";
import type { Source } from "../../lib/model";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { asFailure, type Failure, FailureNote, prosaDe } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import { MarcaFuente, repoDe } from "../../ui/sources";
import { machineName, machines } from "../machines/store";
import { SalidaDelAgente } from "./AgentOutput";
import { CloseBehavior } from "./CloseBehavior";
import { DefaultPermissions } from "./DefaultPermissions";
import { Governed } from "./Governed";
import { Lengua } from "./Language";
import { SettingsBlock, SettingsPanel, SettingsRow, SettingsSection } from "./layout";
import MaterialPicker from "./MaterialPicker";
import "../../locales/settingsPhrases";

// Ajustes generales; el contexto principal y los secundarios pertenecen al workspace activo.

// Fuentes locales y remotas pueden tener el mismo nombre; origen permite distinguirlas.
// El estado de frescura conserva el caso desconocido: un fallo de consulta no significa al día.
type Freshness = {
  id: string;
  estado: "al-dia" | "atrasada" | "sin-saber";
  local?: string;
  porque?: string;
};

type SourceDetail = {
  id: string;
  remoto?: string;
  detras?: number;
  porque?: string;
};

// El backend aporta fechas sin formato; la configuración regional se aplica en la interfaz.
function formatDate(v: string | undefined): string | null {
  if (!v) return null;
  const d = new Date(Number(v) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return df({ dateStyle: "medium", timeStyle: "short" }).format(d);
}

function SourceRow(props: {
  f: Source;
  onRemove: (id: string) => void;
  freshness?: Freshness;
  onUpdate?: (id: string) => void;
  updating?: boolean;
  detail?: SourceDetail;
}) {
  const origin = () =>
    props.f.kind === "git" ? repoDe(props.f.location) : null;
  // Dos ramas del mismo repositorio son fuentes distintas; omitir la rama las vuelve indistinguibles.
  const branch = () => (props.f.kind === "git" ? props.f.branch?.trim() || null : null);
  const showUsage = () => !props.f.root || origin() || props.f.projects.length > 0;

  return (
    <SettingsBlock>
      <div class="flex min-w-0 items-center gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <MarcaFuente location={props.f.location} kind={props.f.kind} />
          <span class="min-w-0 truncate text-sm font-medium">{props.f.name}</span>
          <Show when={branch()}>
            {(r) => (
              // Con tope y cortada: una rama larga sacaba de la fila los botones.
              <Badge forma="dato" class="min-w-0 max-w-48 font-mono" title={r()}>
                <span class="truncate">{r()}</span>
              </Badge>
            )}
          </Show>
          <Show when={props.f.root}>
            <Badge class="shrink-0">{t("settings.general.source.root")}</Badge>
          </Show>
          <Show when={props.f.missing}>
            <Badge tone="warning" class="shrink-0">{t("settings.general.source.missing")}</Badge>
          </Show>
        </div>
        <Show when={props.onUpdate && props.f.kind === "git"}>
          <Button
            variant="ghost"
            size="icon"
            class="size-7 shrink-0"
            disabled={props.updating}
            onClick={() => props.onUpdate?.(props.f.id)}
            aria-label={
              props.updating
                ? t("settings.general.source.fetching")
                : t("settings.general.source.fetch")
            }
            title={t("settings.general.source.fetch_title")}
          >
            <RefreshCw size={14} class={cn(props.updating && "animate-spin")} />
          </Button>
        </Show>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 text-error-strong"
          onClick={() => props.onRemove(props.f.id)}
          aria-label={t("settings.general.source.delete", { name: props.f.etiqueta })}
          title={t("settings.general.source.delete_title")}
        >
          <Trash2 size={14} />
        </Button>
      </div>
      <div class="grid gap-1 text-xs text-neutral-500">
        <Show when={showUsage()}>
          <div class="flex flex-wrap items-center gap-1">
            <Show when={origin()}>
              {(o) => <span class="font-mono">{o()}</span>}
            </Show>
            <For each={props.f.projects}>
              {(n) => <Badge forma="dato" class="text-2xs">{n}</Badge>}
            </For>
            {/* El contexto principal se consume siempre; su lista de proyectos no mide ese uso. */}
            <Show when={!props.f.root}>
              <span>
                {props.f.projects.length === 0
                  ? t("settings.general.source.unused")
                  : t("settings.general.source.used", { count: props.f.sessions })}
              </span>
            </Show>
          </div>
        </Show>

        <Show when={formatDate(props.f.traido_en)}>
          {(c) => (
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span>{t("settings.general.source.updated_on", { when: c() })}</span>
              {/* undefined no equivale a cero: un clon superficial puede impedir contar commits pendientes. */}
              <Switch>
                <Match when={(props.detail?.detras ?? 0) > 0}>
                  <span class="text-warning-strong">
                    ·{" "}
                    {t("settings.general.source.behind", {
                      count: props.detail?.detras ?? 0,
                    })}
                  </span>
                </Match>
                <Match when={props.detail?.detras === 0}>
                  <span>· {t("settings.general.source.uptodate")}</span>
                </Match>
                <Match when={props.detail?.remoto && props.detail?.detras === undefined}>
                  <span>· {t("settings.general.source.shallow")}</span>
                </Match>
                <Match when={props.detail?.porque}>
                  <span>
                    · {t("settings.general.source.remote_failed")}:{" "}
                    {props.detail?.porque}
                  </span>
                </Match>
                <Match when={props.freshness?.estado === "al-dia"}>
                  <span>· {t("settings.general.source.uptodate")}</span>
                </Match>
                <Match when={props.freshness?.estado === "atrasada"}>
                  <span class="text-warning-strong">
                    · {t("settings.general.source.behind_unknown")}
                  </span>
                </Match>
                <Match when={props.freshness?.estado === "sin-saber"}>
                  <span>
                    · {t("settings.general.source.check_failed")}:{" "}
                    {props.freshness?.porque}
                  </span>
                </Match>
              </Switch>
            </div>
          )}
        </Show>
      </div>
    </SettingsBlock>
  );
}

export default function General() {
  const [directory, setDirectory] = createSignal<string | null>(null);
  const [savingDirectory, setSavingDirectory] = createSignal(false);
  const [directoryFailure, setDirectoryFailure] = createSignal<Failure | null>(null);
  // Sin el workspace aquí, la carpeta es la de la máquina que lo atiende (la «Nube IA»
  // de una organización): se muestra con su nombre y el selector local no aplica.
  const remoteDirectory = () => remoteHost(machines());
  const [name, setName] = createSignal("");
  const [accountName, setAccountName] = createSignal<string | null>(null);
  const [storedName, setStoredName] = createSignal("");
  const [nameFailure, setNameFailure] = createSignal<string | null>(null);
  const [sources, setSources] = createSignal<Source[]>([]);
  const [filter, setFilter] = createSignal("");
  const [failure, setFailure] = createSignal<Failure | null>(null);
  // MaterialPicker comparte el selector con el chat; duplicarlo separaría ambos flujos.
  const [addingSource, setAddingSource] = createSignal(false);
  // Sin resultado todavía no se ha consultado; no se puede afirmar que la fuente esté al día.
  const [freshness, setFreshness] = createSignal<Record<string, Freshness>>({});
  const [updating, setUpdating] = createSignal<string | null>(null);
  const [checking, setChecking] = createSignal(false);
  // Contar commits descarga historia; solo se pide para las fuentes que el barrido detectó atrasadas.
  const [detail, setDetail] = createSignal<Record<string, SourceDetail>>({});

  const primary = () => sources().find((f) => f.root) ?? null;
  const secondary = () => sources().filter((f) => !f.root);
  const visible = () =>
    secondary().filter((f) =>
      f.etiqueta.toLowerCase().includes(filter().trim().toLowerCase()),
    );

  async function checkFreshness() {
    setChecking(true);
    try {
      const rs = await invoke<Freshness[]>("source_freshness");
      setFreshness(Object.fromEntries(rs.map((r) => [r.id, r])));
      await countBehind(rs.filter((r) => r.estado === "atrasada").map((r) => r.id));
    } catch (e) {
      setFailure(asFailure(e));
    } finally {
      setChecking(false);
    }
  }

  // El fallo de una fuente no debe descartar los resultados de las demás.
  async function countBehind(ids: string[]) {
    const rs = await Promise.all(
      ids.map((id) =>
        invoke<SourceDetail>("source_detail", { id, mirar: true }).catch(() => null),
      ),
    );
    setDetail((before) => {
      const current = { ...before };
      for (const d of rs) if (d) current[d.id] = d;
      return current;
    });
  }

  // La fecha de actualización llega en list_sources; consultar solo frescura dejaría la fecha anterior.
  async function fetchSource(id: string) {
    setUpdating(id);
    setFailure(null);
    try {
      await invoke<string>("update_source", { id });
    } catch (e) {
      setFailure(asFailure(e));
    }
    try {
      await loadContext();
    } finally {
      setUpdating(null);
    }
  }

  async function loadContext() {
    try {
      setSources(await invoke<Source[]>("list_sources"));
      setFailure(null);
    } catch (e) {
      setSources([]);
      setFailure(asFailure(e));
    }
  }

  onMount(() => {
    void loadContext().then(() => checkFreshness());
    void invoke<string>("get_project_directory")
      .then(setDirectory)
      .catch((e) => setDirectoryFailure(asFailure(e)));
    invoke<{ name: string; account_name?: string | null }>("get_profile")
      .then((p) => {
        setName(p.name);
        setStoredName(p.name);
        setAccountName(p.account_name?.trim() || null);
      })
      .catch(() => {});
  });

  // harness:sources refresca el material sin cerrar la conversación del workspace.
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await loadContext();
      window.dispatchEvent(new CustomEvent("harness:sources"));
    } catch (e) {
      setFailure(asFailure(e));
    }
  }

  const remove = (id: string) =>
    void run(() => invoke("remove_source", { source: id }));

  async function save() {
    if (name() === storedName()) return;
    try {
      const p = await invoke<{ name: string }>("set_profile", { name: name() });
      setName(p.name);
      setStoredName(p.name);
      setNameFailure(null);
    } catch (e) {
      setNameFailure(prosaDe(e));
    }
  }

  async function changeDirectory(resetDirectory: boolean) {
    setSavingDirectory(true);
    setDirectoryFailure(null);
    try {
      const selectedDirectory = resetDirectory ? null : await open({
        directory: true,
        multiple: false,
        defaultPath: directory() ?? undefined,
        title: t("settings.general.directory.title"),
      });
      if (!resetDirectory && typeof selectedDirectory !== "string") return;
      setDirectory(await invoke<string>("set_project_directory", { directory: selectedDirectory }));
    } catch (e) {
      setDirectoryFailure(asFailure(e));
    } finally {
      setSavingDirectory(false);
    }
  }

  return (
    <SettingsPanel>
      <SettingsSection title={t("settings.general.section.profile")}>
        <SettingsRow
          label={t("settings.general.name")}
          description={
            <>
              {t("settings.general.name_hint")}
              <Show when={!name().trim() && accountName()}>
                {(account) => <> {t("settings.general.name_from_account", { name: account() })}</>}
              </Show>
              <Show when={nameFailure()}>
                {(d) => (
                  <FailureNote f={{ what: t("settings.general.error_name"), detail: d() }} />
                )}
              </Show>
            </>
          }
        >
          <Input
            class="w-[260px]"
            aria-label={t("settings.general.name")}
            value={name()}
            placeholder={accountName() ?? undefined}
            onInput={(e) => setName(e.currentTarget.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setName(storedName());
            }}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t("settings.general.section.projects")}>
        <SettingsRow
          label={t("settings.general.directory.title")}
          description={
            <>
              <Show when={directory()}>
                {(path) => (
                  <span class="break-all" title={remoteDirectory() ? path() : undefined}>
                    {remoteDirectory() ? remotePathLabel(path(), machineName(remoteDirectory() as string)) : abbreviateHomePath(path())}
                  </span>
                )}
              </Show>
              <Show when={directoryFailure()}>{(f) => <FailureNote f={f()} />}</Show>
            </>
          }
        >
          <Button
            size="sm"
            variant="ghost"
            disabled={savingDirectory()}
            onClick={() => void changeDirectory(true)}
          >
            {t("settings.general.directory.reset")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={savingDirectory() || !!remoteDirectory()}
            onClick={() => void changeDirectory(false)}
          >
            <FolderOpen size={15} />
            {t("settings.general.directory.change")}
          </Button>
        </SettingsRow>
        <DefaultPermissions />
        <CloseBehavior />
      </SettingsSection>

      {/* Los temas de terminal aún no alcanzan el código ni el diff. Ofrecerlos aquí aparentaría un ajuste que apenas cambia la pantalla; docs/visual-system.md. */}

      <SettingsSection title={t("settings.general.section.language")}>
        <Lengua row />
        <SalidaDelAgente />
      </SettingsSection>

      <SettingsSection
        title={t("settings.general.section.context")}
        aside={
          <Show when={secondary().length > 0}>
            <Button
              variant="ghost"
              size="compact"
              class="shrink-0"
              disabled={checking()}
              onClick={() => void checkFreshness()}
              aria-label={
                checking()
                  ? t("settings.general.extra.checking")
                  : t("settings.general.extra.check")
              }
              title={
                checking()
                  ? t("settings.general.extra.checking_title")
                  : t("settings.general.extra.check_title")
              }
            >
              <RefreshCw size={13} class={cn(checking() && "animate-spin")} />
              {checking()
                ? t("settings.general.extra.checking")
                : t("settings.general.extra.check")}
            </Button>
          </Show>
        }
      >
        <Governed section="context_sources">
        <Show
          when={primary()}
          fallback={
            <SettingsRow
              label={t("settings.general.root.title")}
              description={t("settings.general.root.empty")}
            >
              <Show when={!addingSource()}>
                <Button variant="secondary" size="sm" onClick={() => setAddingSource(true)}>
                  <Files size={15} />
                  {t("settings.general.root.pick")}
                </Button>
              </Show>
            </SettingsRow>
          }
        >
          {(f) => (
            <SourceRow
              f={f()}
              onRemove={remove}
              freshness={freshness()[f().id]}
              onUpdate={fetchSource}
              updating={updating() === f().id}
              detail={detail()[f().id]}
            />
          )}
        </Show>

        <Show when={!primary() && addingSource()}>
          <SettingsBlock>
            <div class="rounded-md border border-border bg-surface-raised p-3">
              <MaterialPicker
                onCancelar={() => setAddingSource(false)}
                onListo={async (source: string) => {
                  setAddingSource(false);
                  // Este selector elige la raíz del workspace; el del chat solo adjunta material a una tarea.
                  await run(() => invoke("set_root", { source }));
                }}
              />
            </div>
          </SettingsBlock>
        </Show>

        <Show when={failure()}>
          {(f) => (
            <SettingsBlock>
              <FailureNote f={f()} />
            </SettingsBlock>
          )}
        </Show>

        <Show when={secondary().length > 4}>
          <SettingsBlock>
            <div class="relative">
              <Search
                size={14}
                class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <Input
                class="min-h-8 pl-7"
                value={filter()}
                placeholder={t("settings.general.extra.search")}
                onInput={(e) => setFilter(e.currentTarget.value)}
              />
            </div>
          </SettingsBlock>
        </Show>
        {/* Sin scroll propio, una lista larga desplaza toda la hoja de configuración. */}
        <Show when={secondary().length > 0}>
          <ul class="m-0 grid max-h-[280px] min-w-0 list-none overflow-y-auto p-0 pr-1">
            <For each={visible()}>
              {(f) => (
                <li class="border-b border-border last:border-b-0">
                  <SourceRow
                    f={f}
                    onRemove={remove}
                    freshness={freshness()[f.id]}
                    onUpdate={fetchSource}
                    updating={updating() === f.id}
                    detail={detail()[f.id]}
                  />
                </li>
              )}
            </For>
            <Show when={visible().length === 0}>
              <li class="py-3.5 text-xs text-neutral-500">{t("settings.general.extra.no_match")}</li>
            </Show>
          </ul>
        </Show>
        </Governed>
      </SettingsSection>
    </SettingsPanel>
  );
}
