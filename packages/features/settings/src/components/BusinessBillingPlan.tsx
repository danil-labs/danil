import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import { createResource, createSignal, For, onMount, Show } from "solid-js";
import { manifiesto, t } from "../../../../../apps/desktop/src/lib/i18n";
import { BUSINESS_SALES_EMAIL } from "../model/sales-contact";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { ProgressBar } from "../../../../ui/src/ProgressBar";
import { Skeleton } from "../../../../ui/src/Skeleton";
import { type ActiveBusiness, addableSeats, type BusinessBillingSource, creditError, creditReturnOf, seatsError, seatsFull, type SeatsPreview, statusOf } from "../model/business-billing";
import { SettingsPanel, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";
import { Loading, FiscalPart, Failed } from "./BusinessBillingFiscal";

const PLANS_URL = "https://danil.ai/planes";

const money = (cents: number, currency = "MXN") =>
  new Intl.NumberFormat(manifiesto().formato, {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

const plain = (value: number) => new Intl.NumberFormat(manifiesto().formato).format(value);

const taxNote = (b: ActiveBusiness) => (b.taxExclusive ? t("web.business.plus_tax") : t("web.business.tax_included"));

function SalesMail() {
  return <a class="font-medium text-primary underline" href={`mailto:${BUSINESS_SALES_EMAIL}`}>{BUSINESS_SALES_EMAIL}</a>;
}

/** Quita de la barra lo que dejó un enlace (`?credit=`, `?seats=`) para que no vuelva al recargar. */
function takeParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  if (value === null) return null;
  params.delete(name);
  const rest = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  return value;
}

/** La cuenta activa y si la persona administra el cobro; lo comparten las dos pestañas. */
function useAccount(source: BusinessBillingSource) {
  const [account] = createResource(async () => {
    const id = await source.account();
    if (id === null) return null;
    const manage = await source.canManage(id).catch(() => false);
    return { id, manage };
  });
  return account;
}

export default function BusinessBilling(props: { source: BusinessBillingSource; part: "plan" | "fiscal" }) {
  const account = useAccount(props.source);
  return (
    <SettingsPanel data-business-billing={props.part}>
      <Show when={!account.loading} fallback={<Loading />}>
        <Show when={account()} fallback={<SettingsSection title={t("web.business.title")} description={t("web.business.no_workspace")} />}>
          {(a) => (props.part === "plan" ? <PlanPart source={props.source} account={a().id} manage={a().manage} /> : <FiscalPart source={props.source} account={a().id} manage={a().manage} />)}
        </Show>
      </Show>
    </SettingsPanel>
  );
}

function PlanPart(props: { source: BusinessBillingSource; account: number; manage: boolean }) {
  const [summary, { refetch }] = createResource(() => props.source.summary(props.account));
  const [credit, setCredit] = createSignal<"ok" | "cancel" | null>(null);
  const [adding, setAdding] = createSignal(false);
  const [added, setAdded] = createSignal<number | null>(null);
  onMount(() => {
    setCredit(creditReturnOf(window.location.search));
    takeParam("credit");
    if (takeParam("seats") === "add" && props.manage) setAdding(true);
  });
  return (
    <>
      <Show when={credit()}>
        {(state) => (
          <p role="status" class="m-0 rounded-md border border-border bg-surface-muted px-3 py-2 text-ui" data-business-credit-return={state()}>
            {state() === "ok" ? t("web.business.credit_return_ok") : t("web.business.credit_return_cancel")}
          </p>
        )}
      </Show>
      <Show when={added()}>
        {(allowed) => (
          <p role="status" class="m-0 rounded-md border border-border bg-surface-muted px-3 py-2 text-ui" data-business-seats-added="">
            {t("web.business.seats_added", { count: plain(allowed()) })}
          </p>
        )}
      </Show>
      <Show when={!summary.loading || summary.latest} fallback={<Loading />}>
        <Show when={!summary.error} fallback={<Failed error={summary.error} />}>
          <Show
            when={(() => { const s = summary.latest; return s?.business ? s : null; })()}
            fallback={
              <SettingsSection title={t("web.business.title")} description={t("web.business.not_business")} data-business-none="">
                <SettingsRow label={t("web.business.plans")}>
                  <Button as="a" size="sm" variant="secondary" href={PLANS_URL} target="_blank" rel="noopener noreferrer">{t("web.business.plans_open")}</Button>
                </SettingsRow>
              </SettingsSection>
            }
          >
            {(b) => (
              <>
                <PlanCard b={b()} />
                <SeatsCard b={b()} manage={props.manage} onAdd={() => setAdding(true)} />
                <CreditCard source={props.source} b={b()} manage={props.manage} />
                <Show when={adding()}>
                  <AddSeatsDialog
                    source={props.source}
                    b={b()}
                    onClose={() => setAdding(false)}
                    onDone={(allowed) => {
                      setAdding(false);
                      setAdded(allowed);
                      void refetch();
                    }}
                  />
                </Show>
              </>
            )}
          </Show>
        </Show>
      </Show>
    </>
  );
}

function PlanCard(props: { b: ActiveBusiness }) {
  const status = () => statusOf(props.b.status);
  return (
    <SettingsSection title={t("web.business.plan_title")} data-business-plan="">
      <SettingsRow label={t("web.business.plan_name")}>
        <Show when={status()}>{(s) => <Badge tone={s().tone} data-business-status={props.b.status ?? ""}>{t(`web.business.status_${s().code}`)}</Badge>}</Show>
      </SettingsRow>
      <SettingsRow label={t("web.business.included_seats")}><span class="text-ui font-semibold tabular-nums">{plain(props.b.includedSeats)}</span></SettingsRow>
      <SettingsRow
        label={t("web.business.extra_seats")}
        description={props.b.seatAmountCents !== null ? t("web.business.extra_seat_price", { price: money(props.b.seatAmountCents, props.b.currency), tax: taxNote(props.b) }) : undefined}
      >
        <span class="text-ui font-semibold tabular-nums">{plain(props.b.extraSeats)}</span>
      </SettingsRow>
    </SettingsSection>
  );
}

function SeatsCard(props: { b: ActiveBusiness; manage: boolean; onAdd: () => void }) {
  const label = () => t("web.business.seats_of", { used: plain(props.b.seatsUsed), allowed: plain(props.b.seatsAllowed) });
  const full = () => seatsFull(props.b);
  return (
    <SettingsSection title={t("web.business.seats_title")} data-business-seats="">
      <div class="grid gap-2 py-3">
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-lg font-semibold tabular-nums" data-business-seats-used="">{label()}</span>
          <Show when={full()}><Badge tone="warning">{t("web.business.seats_full")}</Badge></Show>
        </div>
        <ProgressBar value={Math.min(props.b.seatsUsed, props.b.seatsAllowed)} max={props.b.seatsAllowed} label={label()} barClass={full() ? "bg-warning" : undefined} />
        <span class="text-xs text-neutral-500">{t("web.business.seats_pending")}</span>
      </div>
      <Show when={props.manage} fallback={<p class="m-0 text-ui text-neutral-500">{t("web.business.seats_manage_only")}</p>}>
        <div>
          <Button size="sm" variant="secondary" onClick={props.onAdd} data-business-add-seats="">
            <Plus size={15} />
            {t("web.business.add_seats")}
          </Button>
        </div>
      </Show>
    </SettingsSection>
  );
}

/** Cuántos agregar → lo que calcula billing (cobro de hoy y nueva mensualidad) → confirmar. */
export function AddSeatsDialog(props: { source: BusinessBillingSource; b: ActiveBusiness; onClose: () => void; onDone: (allowed: number) => void }) {
  const max = () => addableSeats(props.b);
  const [add, setAdd] = createSignal(Math.min(1, addableSeats(props.b)));
  const target = () => props.b.extraSeats + add();
  const [preview] = createResource(() => (max() > 0 ? target() : false), (extra) => props.source.previewSeats(props.b.account, extra));
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);
  const confirm = (p: SeatsPreview) => {
    setBusy(true);
    setFailure(null);
    props.source
      .changeSeats(props.b.account, target(), p.prorationDate)
      .then((result) => {
        if (result.status === "requires_action") {
          if (result.url) window.location.assign(result.url);
          else setFailure("requires_action");
          return;
        }
        props.onDone(result.allowed);
      })
      .catch((error) => setFailure(seatsError(error)))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !busy() && props.onClose()}>
      <DialogContent class="grid w-[min(28rem,100%)] gap-3 p-5" aria-label={t("web.business.add_seats")} data-business-add-dialog="">
        <DialogTitle class="m-0 text-base font-semibold">{t("web.business.add_seats")}</DialogTitle>
        <Show
          when={max() > 0}
          fallback={
            <>
              <p class="m-0 text-ui text-neutral-700" data-business-at-max="">
                {t("web.business.at_max", { max: plain(props.b.maxExtraSeats) })} <SalesMail />
              </p>
              <div class="flex justify-end"><Button size="sm" variant="ghost" onClick={props.onClose}>{t("web.business.close")}</Button></div>
            </>
          }
        >
          <div class="flex items-center justify-between gap-3">
            <span class="text-ui text-neutral-700">{t("web.business.seats_to_add")}</span>
            <div class="flex items-center gap-2">
              <Button size="iconCompact" variant="ghost" aria-label={t("web.business.one_less")} disabled={add() <= 1 || busy()} onClick={() => setAdd((n) => Math.max(1, n - 1))}><Minus size={15} /></Button>
              <span class="min-w-8 text-center text-base font-semibold tabular-nums" aria-live="polite" data-business-add-count="">{add()}</span>
              <Button size="iconCompact" variant="ghost" aria-label={t("web.business.one_more")} disabled={add() >= max() || busy()} onClick={() => setAdd((n) => Math.min(max(), n + 1))}><Plus size={15} /></Button>
            </div>
          </div>
          <p class="m-0 text-ui text-neutral-700">{t("web.business.seats_total_after", { count: plain(props.b.seatsAllowed + add()) })}</p>
          <Show when={add() >= max()}>
            <p class="m-0 text-xs text-neutral-500" data-business-cap="">
              {t("web.business.cap_reached", { max: plain(props.b.maxExtraSeats) })} <SalesMail />
            </p>
          </Show>
          <Show when={!preview.loading} fallback={<Skeleton class="h-16" />}>
            <Show when={!preview.error && preview()} fallback={<p role="alert" class="m-0 text-ui text-error-strong">{t(`web.business.seats_error_${seatsError(preview.error)}`)}</p>}>
              {(p) => (
                <div class="grid gap-1 rounded-md border border-border bg-surface-muted p-3 text-ui" data-business-preview="">
                  <span class="font-semibold">{t("web.business.pay_today", { amount: money(p().amountDueNowCents, props.b.currency) })}</span>
                  <Show when={p().nextInvoiceAmountCents !== null}>
                    <span class="text-neutral-700">{t("web.business.new_monthly", { amount: money(p().nextInvoiceAmountCents!, props.b.currency) })}</span>
                  </Show>
                </div>
              )}
            </Show>
          </Show>
          <p class="m-0 text-xs text-neutral-500">{t("web.business.charge_card")}</p>
          <Show when={failure()}>{(code) => <p role="alert" class="m-0 text-ui text-error-strong">{t(`web.business.seats_error_${code()}`)}</p>}</Show>
          <div class="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy()} onClick={props.onClose}>{t("web.business.cancel")}</Button>
            <Button size="sm" disabled={!preview() || !!preview.error || preview.loading || busy()} onClick={() => { const p = preview(); if (p) confirm(p); }} data-business-confirm="">
              {busy() ? t("web.business.adding") : t("web.business.confirm_pay")}
            </Button>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
}

function CreditCard(props: { source: BusinessBillingSource; b: ActiveBusiness; manage: boolean }) {
  const [amount, setAmount] = createSignal(props.b.creditPacksMxn[0]);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);
  const buy = () => {
    setBusy(true);
    setFailure(null);
    props.source
      .creditCheckout(props.b.account, amount())
      .then((url) => window.location.assign(url))
      .catch((error) => {
        setFailure(creditError(error));
        setBusy(false);
      });
  };
  return (
    <SettingsSection title={t("web.business.credit_title")} data-business-credit="">
      <Show when={props.manage} fallback={<p class="m-0 py-3 text-ui text-neutral-500">{t("web.business.credit_manage_only")}</p>}>
        <div class="flex flex-wrap items-center gap-2 py-3" role="group" aria-label={t("web.business.credit_packs")}>
          <For each={props.b.creditPacksMxn}>
            {(mxn) => (
              <Button size="sm" variant={amount() === mxn ? "secondary" : "outline"} aria-pressed={amount() === mxn} onClick={() => setAmount(mxn)} data-business-pack={mxn}>
                {money(mxn * 100)}
              </Button>
            )}
          </For>
          <Button size="sm" disabled={busy()} onClick={buy} data-business-buy="">
            {busy() ? t("web.business.credit_opening") : t("web.business.credit_buy", { amount: money(amount() * 100) })}
          </Button>
        </div>
      </Show>
      <Show when={failure()}>{(code) => <p role="alert" class="m-0 text-ui text-error-strong">{t(`web.business.credit_error_${code()}`)}</p>}</Show>
      <p class="m-0 text-xs text-neutral-500">{t("web.business.credit_rate")}</p>
    </SettingsSection>
  );
}
