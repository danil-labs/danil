import { open } from "@tauri-apps/plugin-dialog";
import Files from "lucide-solid/icons/files";
import FolderOpen from "lucide-solid/icons/folder-open";
import Search from "lucide-solid/icons/search";
import { createSignal, For, onMount, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { updateSource } from "../queries/engine-environment";
import { setRoot } from "../queries/engine-misc";
import { getProfile, getProjectDirectory, listSources, removeSource, setProfile, setProjectDirectory, sourceDetail, sourceFreshness } from "../queries/engine-workspaces";
import { abbreviateHomePath, remoteHost, remotePathLabel } from "../../../../../apps/desktop/src/lib/remote-path";
import type { Source } from "../../../../../apps/desktop/src/lib/model";
import { Button } from "../../../../ui/src/Button";
import { asFailure, type Failure, FailureNote, prosaDe } from "../../../../ui/src/Failure";
import { Input } from "../../../../ui/src/Input";
import type { MaquinasDeAjustes } from "../model/machines-port";
import { SalidaDelAgente } from "./AgentOutput";
import { CloseBehavior } from "./CloseBehavior";
import { DefaultPermissions } from "../screens/DefaultPermissions";
import { Governed } from "../../../../ui/src/Governed";
import { Lengua } from "./Language";
import { SettingsBlock, SettingsPanel, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";
import MaterialPicker from "./MaterialPicker";
import { type Freshness, type SourceDetail, SourceRow } from "./GeneralSources";
import { RefreshSpinner } from "../../../../ui/src/Spinner";

export default function General(props: { maquinas: MaquinasDeAjustes }) {
  const { machineName, machines } = props.maquinas;
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
      const rs = await sourceFreshness<Freshness[]>();
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
        sourceDetail<SourceDetail>({ id, mirar: true }).catch(() => null),
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
      await updateSource<string>({ id });
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
      setSources(await listSources<Source[]>());
      setFailure(null);
    } catch (e) {
      setSources([]);
      setFailure(asFailure(e));
    }
  }

  onMount(() => {
    void loadContext().then(() => checkFreshness());
    void getProjectDirectory<string>()
      .then(setDirectory)
      .catch((e) => setDirectoryFailure(asFailure(e)));
    getProfile<{ name: string; account_name?: string | null }>()
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
    void run(() => removeSource({ source: id }));

  async function save() {
    if (name() === storedName()) return;
    try {
      const p = await setProfile<{ name: string }>({ name: name() });
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
      setDirectory(await setProjectDirectory<string>({ directory: selectedDirectory }));
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
              <RefreshSpinner size={13} spinning={checking()} />
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
                  await run(() => setRoot({ source }));
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
