import Check from "lucide-solid/icons/check";
import { createEffect, createResource, createSignal, onCleanup, Show, For } from "solid-js";
import { t } from "../../lib/i18n";
import { edgeUntil } from "../../lib/edge";
import { invoke } from "../../lib/invoke";
import { capabilities } from "../../lib/platform";
import { Button } from "../../ui/Button";
import { prosaDe } from "../../ui/Failure";
import { createDanilCreditsBalance } from "./danil-credits-balance";
import { inferenceLevels } from "./credits-v2";

export type Service = { ready: boolean; selected: boolean; onUse: () => void };

export default function DanilCreditsCard(props: { onPrepare?: () => Promise<void>; credits: Service }) {
  const balance = createDanilCreditsBalance();
  const v2 = import.meta.env.DANIL_CREDITS_V2 && capabilities().nativeWindow;
  const [preparation, { refetch: retryPreparation }] = createResource(
    () => props.onPrepare,
    async (prepare) => {
      try { await prepare(); return null; }
      catch (cause) { return v2 ? t("chat.credits.unavailable") : prosaDe(cause); }
    },
  );
  const credits = (): Service => ({ ...props.credits, ready: props.credits.ready && !preparation.loading && !preparation() });
  const recharge = () => capabilities().danilCredits?.recharge;
  createEffect(() => {
    if (!v2 || preparation.loading || !preparation()) return;
    const timer = setTimeout(() => void retryPreparation(), 10_000);
    onCleanup(() => clearTimeout(timer));
  });
  const [selectedTier, setSelectedTier] = createSignal<string | null>(null);
  const [models, { refetch: retryModels }] = createResource(
    () => v2 || undefined,
    async () => {
      try {
        const reply = await edgeUntil("GET", "/v1/credits/inference/v1/models", undefined, { retryBudgetMs: 5_000 });
        return inferenceLevels(reply.body, { inference_tiers: import.meta.env.DANIL_CREDITS_TIERS });
      } catch { return []; }
    },
  );
  createEffect(() => {
    if (!v2 || models.loading || (models()?.length ?? 0) > 0) return;
    const timer = setTimeout(() => void retryModels(), 10_000);
    onCleanup(() => clearTimeout(timer));
  });
  const tier = () => models()?.find((level) => level.id === selectedTier())?.id ?? models()?.find((level) => level.default)?.id;
  const v2Credits = (): Service => ({ ...credits(), ready: credits().ready && (!v2 || !!tier()) });
  return (
    <section class="grid min-w-0 gap-2 p-3" aria-label={t("chat.credits.label")}>
      <h3 class="m-0 text-ui font-semibold text-neutral-950">{t("chat.credits.label")}</h3>
      <div class="flex min-h-6 items-center justify-between gap-2">
        <p class="m-0 truncate text-xs tabular-nums text-neutral-950">
          <span class="mr-1.5 text-caption text-neutral-500">{t("chat.credits.balance")}</span>
          <span role="status">{balance.label()}</span>
        </p>
        <Show when={recharge()}>
          {(open) => (
            <Button variant="ghost" size="compact" class="text-neutral-500 hover:text-neutral-950" onClick={() => void open()().catch(() => undefined)}>
              {t("chat.credits.add")}
            </Button>
          )}
        </Show>
      </div>
      <Show when={!preparation.loading && preparation()}>
        {(failure) => (
          <div class="flex items-center justify-between gap-2" data-credits-status="">
            <p class="m-0 min-w-0 text-caption text-neutral-500" role="status">{failure()}</p>
            <Button variant="ghost" size="compact" onClick={() => void retryPreparation()}>{t("common.part.retry")}</Button>
          </div>
        )}
      </Show>
      <Show when={v2}>
        <Show when={(models()?.length ?? 0) > 0} fallback={<p role="status" class="m-0 text-caption text-neutral-500">{models.loading ? t("chat.services.loading") : t("chat.credits.unavailable")}</p>}>
          <div class="flex flex-wrap gap-1" role="group" aria-label={t("chat.credits.label")}>
            <For each={models()}>{(level) => (
              <Button variant="outline" size="compact" aria-pressed={tier() === level.id}
                disabled={!credits().ready}
                onClick={() => void invoke("credits_v2_select_tier", { model: level.id }).then(() => setSelectedTier(level.id)).catch(() => undefined)}>
                {level.label}
              </Button>
            )}</For>
          </div>
        </Show>
      </Show>
      <UseButton service={v2Credits()} unavailable={t("chat.credits.unavailable")} />
    </section>
  );
}

export function UseButton(props: { service: Service; unavailable: string }) {
  return (
    <Button variant="outline" size="sm" class="w-full" aria-pressed={props.service.selected}
      disabled={!props.service.ready || props.service.selected}
      title={props.service.ready ? undefined : props.unavailable}
      onClick={() => props.service.onUse()}>
      <Show when={props.service.selected} fallback={t("chat.services.use")}>
        <Check size={14} aria-hidden="true" />
        {t("chat.services.in_use")}
      </Show>
    </Button>
  );
}
