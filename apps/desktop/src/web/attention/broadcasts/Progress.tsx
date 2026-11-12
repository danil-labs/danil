import { For, Show } from 'solid-js';
import CheckCheck from 'lucide-solid/icons/check-check';
import { campaignProgress, sendsDone, type CampaignStats, type CampaignStatus } from '../../../../../../packages/attention/src/broadcast-panel.ts';
import { t } from '../../../lib/i18n';
import { ProgressBar } from '../../../ui/ProgressBar';

/** Conteos operativos y avance de la campaña desde una sola lectura de `/stats`. */
export function ProgressPanel(props: { stats: CampaignStats; status: CampaignStatus }) {
  const counts = () => campaignProgress(props.stats);
  const cards = () => [
    [t("broadcasts.pending"), counts().pending], [t("broadcasts.sent"), counts().sent], [t("broadcasts.delivered"), counts().delivered],
    [t("broadcasts.failed"), counts().failed], [t("broadcasts.read"), counts().read], [t("broadcasts.responded"), counts().responded],
  ] as const;
  return <div class="@container grid gap-3">
    <Show when={sendsDone(props.stats, props.status)}><p role="status" class="m-0 flex w-fit items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-label font-medium text-neutral-700"><CheckCheck size={13} aria-hidden="true"/>{t("broadcasts.sends_done")}</p></Show>
    <div class="grid grid-cols-2 gap-2 @[28rem]:grid-cols-3 @[52rem]:grid-cols-6">
      <For each={cards()}>{card => <div class="grid gap-0.5 rounded-md border border-border bg-surface p-3"><strong class="text-lg text-neutral-950 tabular-nums">{card[1]}</strong><span class="text-label text-neutral-500">{card[0]}</span></div>}</For>
    </div>
    <div class="grid gap-1.5">
      <ProgressBar value={counts().processed} max={counts().total} label={t("broadcasts.progress")} barClass="bg-primary"/>
      <p class="m-0 text-label text-neutral-500"><span class="font-mono tabular-nums">{t("broadcasts.processed", { done: counts().processed, total: counts().total })}</span></p>
    </div>
  </div>;
}
