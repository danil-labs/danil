import { For, Show, type Accessor } from "solid-js";
import type { OrganizationSelection } from "@terminus/computers";
import { t } from "../lib/i18n";
import type { Capabilities } from "../lib/platform";
import { Button } from "../ui/Button";
import { ToastStack } from "../ui/Toast";
import { PromoRedeem } from "../features/shell/index";
import { UpdateNotice } from "./UpdateNotice";
import { WorkosAuthPage } from "./auth/workos";
import type { PlatformWorkspace } from "./platform-session";
import type { billingV2 } from "./billing-v2-api";
import CheckoutReturn from "./CheckoutReturn";
import NewOrganizationCheckout from "./NewOrganizationCheckout";

type Props = {
  identified: Accessor<boolean>; signedOut: Accessor<boolean>; busy: Accessor<boolean>; preparing: Accessor<boolean>;
  error: Accessor<string>; orgNeeded: Accessor<boolean>; noWorkspace: Accessor<boolean>; rows: Accessor<PlatformWorkspace[]>;
  organizations: OrganizationSelection; orgState: Accessor<ReturnType<OrganizationSelection["state"]>>;
  loginUrl: () => string; returnError: string; load: () => void; choose: (id: string) => void; logout: () => void;
  redeem: NonNullable<Capabilities["webPromo"]>; billing?: { api: ReturnType<typeof billingV2>; onActive: (id: string) => Promise<void> };
};

export default function SessionGate(props: Props) {
  return <Show when={props.identified() && !props.signedOut()} fallback={<><ToastStack><UpdateNotice /></ToastStack><WorkosAuthPage loginUrl={props.loginUrl()} busy={!props.signedOut()} error={props.returnError} /></>}><main class="flex h-full flex-col gap-4 overflow-y-auto bg-bg p-10 text-neutral-950" data-web-gate="">
    <ToastStack><UpdateNotice /></ToastStack>
    <h1 class="m-0 font-display text-lead font-bold">{t("common.brand_name")}</h1>
    <Show when={props.busy()}><p role="status">{t("web.auth.waiting")}</p></Show>
    <Show when={props.preparing()}><p role="status" data-web-preparing="">{t("web.platform.preparing")}</p></Show>
    <Show when={props.error()}><p role="alert">{t(props.error())}</p><Button disabled={props.busy()} onClick={props.load}>{t("web.computers.retry")}</Button></Show>
    <Show when={props.billing}>{billing => <CheckoutReturn api={billing().api} onActive={billing().onActive} />}</Show>
    <Show when={!props.signedOut() && !props.busy()}>
      <Show when={props.orgNeeded() || props.noWorkspace() || props.error()}>
        <For each={(() => { const state = props.orgState(); return state.kind === "ready" ? state.items : []; })()}>{org => <Button variant="secondary" data-web-organization={org.id} aria-pressed={(() => { const state = props.orgState(); return state.kind === "ready" && state.active === org.id; })()} onClick={() => void props.organizations.choose(org.id)}>{org.name}</Button>}</For>
      </Show>
      <Show when={!props.error()}><p>{t("web.platform.empty")}</p><For each={props.rows()}>{row => <Button onClick={() => props.choose(row.id)}>{row.name}</Button>}</For></Show>
      <Show when={(props.noWorkspace() || props.orgNeeded()) ? props.billing : undefined}>{billing => <NewOrganizationCheckout api={billing().api} onActive={billing().onActive} />}</Show>
      <PromoRedeem redeem={props.redeem} />
      <Button variant="ghost" data-web-sign-out="" onClick={props.logout}>{t("web.platform.sign_out")}</Button>
    </Show>
  </main></Show>;
}
