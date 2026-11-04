/**
 * Configuración › Plan y cobro (la web): Danil Business del workspace activo. Plan y
 * usuarios, «Agregar usuarios» con lo que cobra billing, crédito de IA por Stripe
 * Checkout y datos fiscales para la factura que Danil hace a mano. Sin facturas aquí.
 */
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import { createMemo, createResource, createSignal, For, type JSX, onMount, Show } from "solid-js";
import { manifiesto, t } from "../../lib/i18n";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { Input } from "../../ui/Input";
import { ProgressBar } from "../../ui/ProgressBar";
import { Select } from "../../ui/Select";
import { Skeleton } from "../../ui/Skeleton";
import {
  type ActiveBusiness,
  addableSeats,
  BUSINESS_SALES_EMAIL,
  type BusinessBillingSource,
  creditError,
  creditReturnOf,
  type FiscalProfile,
  fiscalSaveError,
  seatsError,
  seatsFull,
  type SeatsPreview,
  statusOf,
  type StoredFiscal,
  summaryError,
} from "./business-billing";
import { CFDI_USES, checkFiscal, type FiscalField, regimesFor, rfcPersonType } from "./fiscal";
import { SettingsPanel, SettingsRow, SettingsSection } from "./layout";

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

function Loading() {
  return <Skeleton filas={3} class="h-10" />;
}

function Failed(props: { error: unknown }) {
  return <p role="alert" class="m-0 py-3 text-sm text-error-strong" data-business-failed="">{t(`web.business.load_${summaryError(props.error)}`)}</p>;
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
    <SettingsSection
      title={t("web.business.seats_title")}
      description={props.b.seatAmountCents !== null
        ? t("web.business.seats_hint_price", { included: plain(props.b.includedSeats), price: money(props.b.seatAmountCents, props.b.currency), tax: taxNote(props.b) })
        : t("web.business.seats_hint", { included: plain(props.b.includedSeats) })}
      data-business-seats=""
    >
      <div class="grid gap-2 py-3">
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-lg font-semibold tabular-nums" data-business-seats-used="">{label()}</span>
          <Show when={full()}><Badge tone="warning">{t("web.business.seats_full")}</Badge></Show>
        </div>
        <ProgressBar value={Math.min(props.b.seatsUsed, props.b.seatsAllowed)} max={props.b.seatsAllowed} label={label()} barClass={full() ? "bg-warning" : undefined} />
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
              {t("web.business.cap_hint", { max: plain(props.b.maxExtraSeats) })} <SalesMail />
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
          <p class="m-0 text-xs text-neutral-500">{t("web.business.card_note")}</p>
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
    <SettingsSection title={t("web.business.credit_title")} description={t("web.business.credit_hint")} data-business-credit="">
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
      <p class="m-0 text-xs text-neutral-500">{t("web.business.credit_note")}</p>
    </SettingsSection>
  );
}

const EMPTY: FiscalProfile = { rfc: "", legal_name: "", tax_system: "", cfdi_use: "G03", zip: "", invoice_email: "" };

const regimeLabel = (code: string) => `${code} · ${t(`web.business.regime_${code}`)}`;
const useLabel = (code: string) => `${code} · ${t(`web.business.cfdi_${code}`)}`;

function FiscalPart(props: { source: BusinessBillingSource; account: number; manage: boolean }) {
  const [stored, { mutate }] = createResource(() => props.source.fiscal(props.account));
  const [editing, setEditing] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  return (
    <SettingsSection title={t("web.business.fiscal_title")} description={t("web.business.fiscal_note")} data-business-fiscal="">
      <Show when={!stored.loading} fallback={<Loading />}>
        <Show when={!stored.error} fallback={<p role="alert" class="m-0 py-3 text-ui text-error-strong">{t("web.business.fiscal_load_failed")}</p>}>
          <Show when={saved()}><p role="status" class="m-0 pt-3 text-ui" data-business-fiscal-saved="">{t("web.business.fiscal_saved")}</p></Show>
          <Show
            when={!(editing() || (!stored() && props.manage))}
            fallback={
              <FiscalForm
                source={props.source}
                account={props.account}
                initial={stored() ?? null}
                onCancel={stored() ? () => setEditing(false) : undefined}
                onSaved={(next) => {
                  mutate(next);
                  setEditing(false);
                  setSaved(true);
                }}
              />
            }
          >
            <Show when={stored()} fallback={<p class="m-0 py-3 text-ui text-neutral-500">{t("web.business.fiscal_empty")}</p>}>
              {(p) => (
                <>
                  <FiscalRow label={t("web.business.fiscal_rfc")} value={p().rfc} />
                  <FiscalRow label={t("web.business.fiscal_legal_name")} value={p().legal_name} />
                  <FiscalRow label={t("web.business.fiscal_tax_system")} value={p().tax_system ? regimeLabel(p().tax_system!) : null} />
                  <FiscalRow label={t("web.business.fiscal_cfdi_use")} value={p().cfdi_use ? useLabel(p().cfdi_use!) : null} />
                  <FiscalRow label={t("web.business.fiscal_zip")} value={p().zip} />
                  <FiscalRow label={t("web.business.fiscal_email")} value={p().invoice_email} />
                  <Show when={!p().complete}><p class="m-0 py-2 text-ui text-neutral-700">{t("web.business.fiscal_incomplete")}</p></Show>
                  <Show when={props.manage}>
                    <div class="pt-3">
                      <Button size="sm" variant="secondary" onClick={() => { setSaved(false); setEditing(true); }} data-business-fiscal-edit="">{t("web.business.fiscal_edit")}</Button>
                    </div>
                  </Show>
                </>
              )}
            </Show>
          </Show>
        </Show>
      </Show>
    </SettingsSection>
  );
}

function FiscalRow(props: { label: string; value: string | null }) {
  return <SettingsRow label={props.label}><span class="text-ui font-medium">{props.value || "—"}</span></SettingsRow>;
}

function Field(props: { id: string; label: string; hint?: string; error?: string; children: JSX.Element }) {
  return (
    <div class="grid min-w-0 content-start gap-1">
      <label for={props.id} class="text-ui font-medium">{props.label}</label>
      {props.children}
      <Show when={props.error} fallback={<Show when={props.hint}><span class="text-xs text-neutral-500">{props.hint}</span></Show>}>
        <span id={`${props.id}-error`} class="text-xs text-error-strong" data-business-field-error={props.id}>{t(`web.business.fiscal_error_${props.error}`)}</span>
      </Show>
    </div>
  );
}

function FiscalForm(props: { source: BusinessBillingSource; account: number; initial: StoredFiscal | null; onCancel?: () => void; onSaved: (profile: StoredFiscal | null) => void }) {
  const start = props.initial;
  const [values, setValues] = createSignal<FiscalProfile>(start ? {
    rfc: start.rfc ?? "",
    legal_name: start.legal_name ?? "",
    tax_system: start.tax_system ?? "",
    cfdi_use: start.cfdi_use ?? "G03",
    zip: start.zip ?? "",
    invoice_email: start.invoice_email ?? "",
  } : EMPTY);
  const [errors, setErrors] = createSignal<Partial<Record<FiscalField, string>>>({});
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);
  const regimes = createMemo(() => regimesFor(rfcPersonType(values().rfc)));
  const set = (field: FiscalField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };
  const input = (field: FiscalField) => ({
    id: `fiscal-${field}`,
    value: values()[field],
    "aria-invalid": errors()[field] ? true : undefined,
    "aria-describedby": errors()[field] ? `fiscal-${field}-error` : undefined,
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const check = checkFiscal(values());
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setBusy(true);
    setFailure(null);
    props.source
      .saveFiscal(props.account, check.value)
      .then(props.onSaved)
      .catch((error) => setFailure(fiscalSaveError(error)))
      .finally(() => setBusy(false));
  };
  return (
    <form class="grid gap-3 pt-3" noValidate onSubmit={submit} data-business-fiscal-form="">
      <div class="grid gap-3 sm:grid-cols-2">
        <Field id="fiscal-rfc" label={t("web.business.fiscal_rfc")} hint={t("web.business.fiscal_rfc_hint")} error={errors().rfc}>
          <Input {...input("rfc")} autocomplete="off" maxLength={16} onInput={(e) => set("rfc", e.currentTarget.value.toUpperCase())} />
        </Field>
        <Field id="fiscal-zip" label={t("web.business.fiscal_zip")} hint={t("web.business.fiscal_zip_hint")} error={errors().zip}>
          <Input {...input("zip")} inputMode="numeric" maxLength={5} onInput={(e) => { const digits = e.currentTarget.value.replace(/\D/g, ""); e.currentTarget.value = digits; set("zip", digits); }} />
        </Field>
      </div>
      <Field id="fiscal-legal_name" label={t("web.business.fiscal_legal_name")} hint={t("web.business.fiscal_legal_name_hint")} error={errors().legal_name}>
        <Input {...input("legal_name")} onInput={(e) => set("legal_name", e.currentTarget.value)} />
      </Field>
      <Field id="fiscal-tax_system" label={t("web.business.fiscal_tax_system")} error={errors().tax_system}>
        <Select {...input("tax_system")} onChange={(e) => set("tax_system", e.currentTarget.value)}>
          <option value="">{t("web.business.fiscal_tax_system_pick")}</option>
          <For each={regimes()}>{(r) => <option value={r.code} selected={values().tax_system === r.code}>{regimeLabel(r.code)}</option>}</For>
        </Select>
      </Field>
      <div class="grid gap-3 sm:grid-cols-2">
        <Field id="fiscal-cfdi_use" label={t("web.business.fiscal_cfdi_use")} error={errors().cfdi_use}>
          <Select {...input("cfdi_use")} onChange={(e) => set("cfdi_use", e.currentTarget.value)}>
            <For each={CFDI_USES}>{(code) => <option value={code} selected={values().cfdi_use === code}>{useLabel(code)}</option>}</For>
          </Select>
        </Field>
        <Field id="fiscal-invoice_email" label={t("web.business.fiscal_email")} error={errors().invoice_email}>
          <Input {...input("invoice_email")} type="email" onInput={(e) => set("invoice_email", e.currentTarget.value)} />
        </Field>
      </div>
      <Show when={failure()}>{(code) => <p role="alert" class="m-0 text-ui text-error-strong">{t(`web.business.fiscal_error_${code()}`)}</p>}</Show>
      <div class="flex justify-end gap-2">
        <Show when={props.onCancel}>{(cancel) => <Button type="button" size="sm" variant="ghost" disabled={busy()} onClick={cancel()}>{t("web.business.cancel")}</Button>}</Show>
        <Button type="submit" size="sm" disabled={busy()} data-business-fiscal-save="">{busy() ? t("web.business.saving") : t("web.business.fiscal_save")}</Button>
      </div>
    </form>
  );
}
