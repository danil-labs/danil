import { createMemo, createResource, createSignal, onCleanup, onMount, Show } from "solid-js";
import { capabilities } from "../../../../host/src/platform";
import { billingHref } from "../../../../platform-client/src/billing-route";
import { Button } from "../../../../ui/src/Button";
import { t } from "../../../../ui/src/lib/i18n";
import { SettingsBlock, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";
import {
  type AccountOrganization,
  deskBillingUrl,
  isPlanAdminRole,
  planLabelKey,
  resolveAccountPlan,
} from "../model/account-plan";
import type { SesionesDeAjustes } from "../model/sessions-port";
import { openExternal } from "../queries/engine-open";

const webOrigin = import.meta.env.VITE_DANIL_WEB_ORIGIN || "https://beta.danil.ai";

type OrgSnapshot = {
  items: readonly AccountOrganization[];
  active: string | null;
};

/**
 * Bloque de plan de la organización/workspace activo en Configuración → Cuenta.
 * Visible únicamente para `owner` o `admin`; oculto por completo para otros roles.
 */
export default function AccountPlan(props: {
  workspace: string | null;
  context?: string | null;
  sesiones: SesionesDeAjustes;
}) {
  const [orgs, setOrgs] = createSignal<OrgSnapshot | null>(null);
  const [failed, setFailed] = createSignal(false);

  const [webGroup] = createResource(
    () => (!capabilities().nativeWindow ? capabilities().groupAccount : undefined),
    async (source) => {
      if (!source) return null;
      try {
        return await source.current();
      } catch {
        return null;
      }
    },
  );

  const railGroups = () => props.sesiones.sessionRailState()?.groups() ?? null;

  const target = createMemo(() =>
    resolveAccountPlan({
      workspace: props.workspace,
      context: props.context ?? null,
      groups: railGroups(),
      webGroup: webGroup() ?? null,
      organizations: orgs()?.items ?? null,
      activeOrganizationId: orgs()?.active ?? null,
    }),
  );

  let unsubscribe: (() => void) | undefined;
  let closed = false;

  onMount(async () => {
    const current = target();
    if (current?.role && current.plan) return;
    try {
      const selection = await capabilities().organizations?.();
      if (!selection || closed) return;
      const sync = () => {
        const state = selection.state();
        if (state.kind === "ready" && !state.busy) {
          setOrgs({ items: state.items, active: state.active });
        } else {
          setOrgs(null);
        }
      };
      unsubscribe = selection.subscribe(sync);
      sync();
      if (selection.state().kind !== "ready") await selection.load();
    } catch {
      // Sin organizaciones disponibles: si no hay rol confirmado, el bloque se mantiene oculto.
    }
  });

  onCleanup(() => {
    closed = true;
    unsubscribe?.();
  });

  const canManage = createMemo(() => {
    const current = target();
    return Boolean(current && isPlanAdminRole(current.role));
  });

  const planLabel = () => {
    const raw = target()?.plan;
    const key = planLabelKey(raw);
    if (key) return t(key);
    if (raw && raw.trim()) return raw.trim();
    return t("settings.account.plan_current");
  };

  async function openDeskBilling() {
    const org = target()?.org;
    if (!org) return;
    setFailed(false);
    try {
      await openExternal({ target: deskBillingUrl(org, webOrigin) });
    } catch {
      setFailed(true);
    }
  }

  return (
    <Show when={canManage()}>
      <SettingsSection title={t("settings.account.plan_title")} data-account-plan="">
        <SettingsRow label={planLabel()} description={target()?.orgName ?? undefined}>
          <Show
            when={capabilities().nativeWindow}
            fallback={
              <Button as="a" size="sm" variant="secondary" href={billingHref()} data-manage-plan="">
                {t("settings.billing.manage_plan")}
              </Button>
            }
          >
            <Button size="sm" variant="secondary" onClick={() => void openDeskBilling()} data-manage-plan="">
              {t("settings.billing.manage_plan")}
            </Button>
          </Show>
        </SettingsRow>
        <Show when={failed()}>
          <SettingsBlock>
            <p role="alert" class="m-0 text-caption text-error-strong">
              {t("settings.billing.unavailable")}
            </p>
          </SettingsBlock>
        </Show>
      </SettingsSection>
    </Show>
  );
}
