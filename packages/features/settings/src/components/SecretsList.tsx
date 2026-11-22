import { envSecretOf } from "@terminus/computers";
import { createEffect, createMemo, createResource, createSignal, Match, on, onMount, Show, Switch } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { listProjects } from "../queries/engine-workspaces";
import type { Project } from "../../../../../apps/desktop/src/lib/model";
import { Button } from "../../../../ui/src/Button";
import { EmptyState } from "../../../../ui/src/EmptyState";
import { FailureNote } from "../../../../ui/src/Failure";
import { KeyedList } from "../../../../ui/src/KeyedList";
import { Skeleton } from "../../../../ui/src/Skeleton";
import { LocalKeysBanner } from "./AccountCredentials";
import { credentialsBackend, credentialsView, reloadCredentials } from "../queries/credentials-store";
import { SettingsPanel, SettingsSection } from "../../../../ui/src/SettingsLayout";
import type { MaquinasDeAjustes } from "../model/machines-port";
import { routeOf, type EngineSecrets, readEngineSecrets, type SecretRow, viaEngine } from "./SecretsModel";
import { ModeLine, SecretItem } from "./SecretsItem";
import { SecretDialog } from "./SecretsDialog";

export default function Secrets(props: { maquinas: MaquinasDeAjustes }) {
  const route = () => routeOf(props.maquinas);
  onMount(() => void reloadCredentials(false));
  const [editing, setEditing] = createSignal<{ name: string; folder: string | null } | null | undefined>(undefined);
  // El foco vuelve a quien abrió el diálogo: «Añadir secreto» o el «Cambiar» de su fila.
  let opener: HTMLElement | null = null;
  const edit = (what: { name: string; folder: string | null } | null) => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(what);
  };
  // Las carpetas del workspace, para elegir alcance y nombrar los grupos; sin lista se ve el id.
  const [folders] = createResource(() => listProjects<Project[]>().catch(() => [] as Project[]), { initialValue: [] });
  const folderName = (id: string) => folders().find((p) => p.id === id)?.name ?? id;
  const [engine, { refetch: rereadEngine }] = createResource(route, (target) => target === "worker"
    ? Promise.resolve(null)
    : target === "unsupported" ? Promise.resolve<EngineSecrets>({ kind: "unsupported" }) : readEngineSecrets());
  createEffect(on(route, () => setEditing(undefined), { defer: true }));

  const rows = createMemo((): SecretRow[] => {
    const v = credentialsView();
    const account = v.kind === "ready" ? v.listing.credentials.filter((c) => c.kind === "env_secret" && envSecretOf(c.slot)) : [];
    const by = new Map<string, SecretRow>();
    const local = engine();
    if (local?.kind === "ready")
      for (const s of local.secrets) by.set(s.slot, { slot: s.slot, folder: s.folder === "*" ? null : s.folder, name: s.name, hint: s.hint, local: true, credential: null });
    for (const c of account) {
      const parsed = envSecretOf(c.slot)!;
      const mine = by.get(c.slot);
      by.set(c.slot, { slot: c.slot, folder: parsed.folder, name: parsed.name, hint: mine?.hint ?? c.hint, local: !!mine, credential: c });
    }
    return [...by.values()];
  });
  /** El workspace primero; luego cada carpeta por nombre, y dentro, por nombre de variable. */
  const groups = createMemo(() => {
    const by = new Map<string | null, SecretRow[]>();
    for (const r of rows()) by.set(r.folder, [...(by.get(r.folder) ?? []), r]);
    return [...by.entries()]
      .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : folderName(a).localeCompare(folderName(b))))
      .map(([folder, items]) => ({ folder, items: items.sort((x, y) => x.name.localeCompare(y.name)) }));
  });
  const workspaceNames = createMemo(() => new Set(groups().find((g) => g.folder === null)?.items.map((r) => r.name) ?? []));
  const failure = () => {
    const e = engine();
    if (e?.kind === "failed") return e.failure;
    const v = credentialsView();
    return v.kind === "failed" ? v.failure : null;
  };
  const engineState = () => engine()?.kind ?? null;
  const loading = () => (viaEngine() ? engine.loading : credentialsView().kind === "loading");
  const canWrite = () => (viaEngine() ? route() !== "unsupported" && !engine.loading && engineState() === "ready" : credentialsView().kind === "ready" && !!credentialsBackend().create);
  const reread = () => {
    void reloadCredentials();
    if (viaEngine()) void rereadEngine();
  };

  return (
    <SettingsPanel data-settings-secrets="">
      <SettingsSection
        title={t("danil.secrets.title")}
        description={t("danil.secrets.description")}
        aside={
          <Show when={canWrite()}>
            <Button variant="secondary" size="sm" onClick={() => edit(null)}>
              {t("danil.secrets.add")}
            </Button>
          </Show>
        }
      >
        <Switch>
          <Match when={loading()}>
            <Skeleton filas={3} class="h-[52px]" />
          </Match>
          <Match when={engineState() === "unsupported"}>
            <div class="mt-2 grid gap-1 rounded-md border border-border bg-surface-raised px-3 py-2.5" data-secrets-unsupported="">
              <p class="m-0 text-ui font-semibold">{t("danil.secrets.engine_unsupported")}</p>
              <p class="m-0 text-xs text-neutral-500">{t("danil.secrets.engine_unsupported_help")}</p>
            </div>
          </Match>
          <Match when={true}>
            <div class="grid min-w-0 gap-1 pt-2">
              <Show when={credentialsView().kind === "none"}>
                <ModeLine />
              </Show>
              <Show when={failure()}>
                {(f) => (
                  <div class="grid gap-2">
                    <FailureNote f={f()} />
                    <div>
                      <Button variant="ghost" size="compact" onClick={reread}>
                        {t("danil.secrets.retry")}
                      </Button>
                    </div>
                  </div>
                )}
              </Show>
              <Show when={credentialsView().kind === "ready"}>
                <LocalKeysBanner kinds={["env_secret"]} maquinas={props.maquinas} />
              </Show>
              <Show
                when={rows().length > 0}
                fallback={
                  <Show when={canWrite()}>
                    <EmptyState class="mt-2" title={t("danil.secrets.empty_title")} description={t("danil.secrets.empty_help")} data-secrets-empty="" />
                  </Show>
                }
              >
                <KeyedList each={groups()} by={(g) => g.folder ?? "*"}>
                  {(g) => (
                    <div class="grid min-w-0" data-secrets-group={g().folder ?? "*"}>
                      <p class="m-0 pt-3 text-ui font-semibold">
                        {g().folder === null ? t("danil.secrets.scope_workspace") : t("danil.secrets.scope_folder", { folder: folderName(g().folder!) })}
                      </p>
                      <KeyedList each={g().items} by={(r) => r.slot}>
                        {(r) => (
                          <SecretItem
                            row={r()}
                            overrides={g().folder !== null && workspaceNames().has(r().name)}
                            onChange={() => edit({ name: r().name, folder: r().folder })}
                            onChanged={reread}
                          />
                        )}
                      </KeyedList>
                    </div>
                  )}
                </KeyedList>
              </Show>
            </div>
          </Match>
        </Switch>
      </SettingsSection>
      <Show when={canWrite() && editing() !== undefined}>
        <SecretDialog
          rows={rows()}
          folders={folders()}
          initial={editing() ?? null}
          maquinas={props.maquinas}
          onSaved={reread}
          onClose={() => {
            setEditing(undefined);
            opener?.focus();
          }}
        />
      </Show>
    </SettingsPanel>
  );
}
