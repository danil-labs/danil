import { open } from "@tauri-apps/plugin-dialog";
import FolderOpen from "lucide-solid/icons/folder-open";
import { createEffect, createSignal, on, onMount, Show } from "solid-js";
import { capabilities, isNoMachines, machineAvailability } from "../../../../host/src/platform";
import { t } from "../../../../ui/src/lib/i18n";
import { getProfile, getProjectDirectory, setProfile, setProjectDirectory } from "../queries/engine-workspaces";
import { abbreviateHomePath, remoteHost, remotePathLabel } from "../../../../ui/src/lib/remote-path";
import { Button } from "../../../../ui/src/Button";
import { asFailure, type Failure, FailureNote, prosaDe } from "../../../../ui/src/Failure";
import { Input } from "../../../../ui/src/Input";
import type { MaquinasDeAjustes } from "../model/machines-port";
import { SalidaDelAgente } from "./AgentOutput";
import { CloseBehavior } from "./CloseBehavior";
import { DefaultPermissions } from "../screens/DefaultPermissions";
import { Lengua } from "./Language";
import { NotifyBehavior } from "./NotifyBehavior";
import { MachineRequiredNotice } from "./MachineRequiredNotice";
import { SettingsPanel, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";

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

  const loadMachineFields = () => {
    if (isNoMachines()) {
      setDirectoryFailure(null);
      setNameFailure(null);
      return;
    }
    void getProjectDirectory<string>()
      .then(setDirectory)
      .catch((e) => { if (!isNoMachines()) setDirectoryFailure(asFailure(e)); });
    getProfile<{ name: string; account_name?: string | null }>()
      .then((p) => {
        setName(p.name);
        setStoredName(p.name);
        setAccountName(p.account_name?.trim() || null);
      })
      .catch(() => {});
  };

  onMount(loadMachineFields);

  let lastAvailability = machineAvailability().kind;
  createEffect(on(() => machineAvailability().kind, (kind) => {
    const prev = lastAvailability;
    lastAvailability = kind;
    if (kind === prev) return;
    if (kind === "no_machines") {
      setDirectoryFailure(null);
      setNameFailure(null);
      return;
    }
    if (prev === "no_machines" && (kind === "ready" || kind === "offline")) loadMachineFields();
  }, { defer: true }));

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
      <Show
        when={!isNoMachines()}
        fallback={
          <Show when={!capabilities().nativeWindow && (capabilities().danilAccount || capabilities().accountProfile)}>
            <SettingsSection title={t("settings.general.section.profile")}>
              <SettingsRow label={t("settings.no_machines.profile_in_account")}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => window.dispatchEvent(new window.CustomEvent("harness:open-settings", { detail: "cuenta-danil" }))}
                >
                  {t("settings.no_machines.open_account")}
                </Button>
              </SettingsRow>
            </SettingsSection>
          </Show>
        }
      >
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
      </Show>

      <SettingsSection title={t("settings.general.section.projects")}>
        <Show when={!isNoMachines()} fallback={<MachineRequiredNotice />}>
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
        </Show>
      </SettingsSection>

      {/* Los temas de terminal aún no alcanzan el código ni el diff. Ofrecerlos aquí aparentaría un ajuste que apenas cambia la pantalla; docs/visual-system.md. */}

      <SettingsSection title={t("settings.general.section.language")}>
        <Lengua row />
        <SalidaDelAgente />
      </SettingsSection>

      <SettingsSection title={t("settings.general.section.notifications")}>
        <NotifyBehavior />
      </SettingsSection>
    </SettingsPanel>
  );
}
