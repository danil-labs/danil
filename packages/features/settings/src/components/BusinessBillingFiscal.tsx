import { createMemo, createResource, createSignal, For, type JSX, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { Select } from "../../../../ui/src/Select";
import { Skeleton } from "../../../../ui/src/Skeleton";
import { type BusinessBillingSource, type FiscalProfile, fiscalSaveError, type StoredFiscal, summaryError } from "../model/business-billing";
import { CFDI_USES, checkFiscal, type FiscalField, regimesFor, rfcPersonType } from "../model/fiscal";
import { SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";

export function Loading() {
  return <Skeleton filas={3} class="h-10" />;
}

export function Failed(props: { error: unknown }) {
  return <p role="alert" class="m-0 py-3 text-sm text-error-strong" data-business-failed="">{t(`web.business.load_${summaryError(props.error)}`)}</p>;
}

const EMPTY: FiscalProfile = { rfc: "", legal_name: "", tax_system: "", cfdi_use: "G03", zip: "", invoice_email: "" };

const regimeLabel = (code: string) => `${code} · ${t(`web.business.regime_${code}`)}`;

const useLabel = (code: string) => `${code} · ${t(`web.business.cfdi_${code}`)}`;

export function FiscalPart(props: { source: BusinessBillingSource; account: number; manage: boolean }) {
  const [stored, { mutate }] = createResource(() => props.source.fiscal(props.account));
  const [editing, setEditing] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  return (
    <SettingsSection title={t("web.business.fiscal_title")} description={t("web.business.fiscal_use")} data-business-fiscal="">
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

function Field(props: { id: string; label: string; error?: string; children: JSX.Element }) {
  return (
    <div class="grid min-w-0 content-start gap-1">
      <label for={props.id} class="text-ui font-medium">{props.label}</label>
      {props.children}
      <Show when={props.error}>
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
        <Field id="fiscal-rfc" label={t("web.business.fiscal_rfc")} error={errors().rfc}>
          <Input {...input("rfc")} autocomplete="off" maxLength={16} onInput={(e) => set("rfc", e.currentTarget.value.toUpperCase())} />
        </Field>
        <Field id="fiscal-zip" label={t("web.business.fiscal_zip")} error={errors().zip}>
          <Input {...input("zip")} inputMode="numeric" maxLength={5} onInput={(e) => { const digits = e.currentTarget.value.replace(/\D/g, ""); e.currentTarget.value = digits; set("zip", digits); }} />
        </Field>
      </div>
      <Field id="fiscal-legal_name" label={t("web.business.fiscal_legal_name")} error={errors().legal_name}>
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
