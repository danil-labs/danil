import { For, Show } from "solid-js";
import Check from "lucide-solid/icons/check";
import type { CarryStep } from "@terminus/carry";
import { Button } from "../../ui/Button";
import { Spinner } from "../../ui/Spinner";
import { prosaDe } from "../../ui/Failure";
import { copyText } from "../../lib/clipboard";
import { df, peso } from "../../lib/format";
import { t } from "../../lib/i18n";
import { type Carry, carries, stopCarry } from "./carry";
import { carryOrigin, machineName } from "./store";

const STEPS: CarryStep[] = ["wake", "clone", "copy", "ready"];

/** El repositorio legible de un remoto: `danil-labs/danil`. */
const repoOf = (url: string | null | undefined) => url?.replace(/\.git$/, "").split(/[/:]/).slice(-2).join("/") ?? "";

/**
 * Los pasos de la copia, arriba del borrador que espera enviarse: Despertando →
 * Clonando → Copiando tu trabajo → Listo. Si se detiene, dice por qué y ofrece
 * el arreglo de la tabla del diseño; el mensaje vuelve a la caja.
 */
export default function CarryProgress(props: {
  draft: string;
  /** Vuelve a enviar el borrador: la copia sigue desde donde quedó. */
  onRetry: () => void;
  onOpenSettings: (panel: string) => void;
}) {
  const carry = (): Carry | undefined => carries()[props.draft];
  const target = () => machineName(carry()?.check.target ?? "");
  const bring = () => !!carry()?.check.task;
  const step = () => carry()?.progress?.step ?? "wake";
  const visible = () => STEPS.filter((s) => s !== "clone" || carry()?.check.hasProject !== true);
  const done = (s: CarryStep) => STEPS.indexOf(s) < STEPS.indexOf(step());

  const label = (s: CarryStep) => {
    const p = carry()?.progress;
    if (s === "wake") return t("work.progress.wake", { machine: target() });
    if (s === "clone") return t("work.progress.clone");
    if (s === "ready") return t("work.progress.ready");
    if (p && p.bytes > 0 && step() === "copy") return `${t("work.progress.copy")} · ${t("work.progress.part", { part: Math.min(p.part, p.parts), parts: p.parts })}`;
    return t("work.progress.copy");
  };

  const failure = () => {
    const c = carry();
    const f = c?.failure;
    if (!c || !f) return null;
    const machine = target();
    switch (f.code) {
      case "interrupted":
        return { text: t("work.failure.interrupted", { part: f.part, parts: f.parts }), fix: { label: t("work.failure.retry"), run: props.onRetry } };
      case "missing_base":
        return {
          text: c.fullBytes == null ? t("work.failure.missing_base_unknown", { machine }) : t("work.failure.missing_base", { machine, size: peso(c.fullBytes) }),
          fix: { label: bring() ? t("work.bring.full") : t("work.failure.send_full"), run: props.onRetry },
        };
      case "too_large": {
        const command = `git push -u origin ${c.check.status.branch ?? "HEAD"}`;
        return { text: t("work.carry.too_large", { machine }), fix: { label: t("work.carry.push"), run: () => void copyText(command).then(() => void stopCarry(props.draft)) } };
      }
      case "clone_failed":
        return {
          text: t("work.failure.clone", { machine, repo: repoOf(c.check.status.remoteUrl ?? c.check.project.remote_url) }),
          detail: prosaDe(f.cause),
          fix: { label: t("work.failure.connect", { machine }), run: () => props.onOpenSettings("fuentes") },
          retry: true,
        };
      case "wake_failed":
        return { text: t("work.failure.wake", { machine }), detail: prosaDe(f.cause), fix: { label: t("work.failure.retry"), run: props.onRetry } };
      case "export_failed":
        return { text: t("work.failure.export", { machine: machineName(c.check.source) }), detail: prosaDe(f.cause), fix: { label: t("work.failure.retry"), run: props.onRetry } };
      default:
        return { text: t("work.failure.import", { machine }), detail: prosaDe(f.cause), fix: { label: t("work.failure.retry"), run: props.onRetry } };
    }
  };

  return (
    <Show when={carry()} keyed>
      {(c) => (
      <Show when={!c.ready} fallback={
        <p class="m-0 shrink-0 truncate px-4 py-1 text-caption text-neutral-500" data-carry-from>
          {t("work.bring.from", { task: c.check.task?.title ?? "", machine: machineName(c.check.source) })}
        </p>
      }>
      <div class="shrink-0 px-4 py-1.5 text-xs" data-carry-progress={carry()?.failure ? carry()?.failure?.code : step()} role="status">
        <p class="m-0 mb-1 font-medium text-neutral-950">
          {bring() ? t("work.progress.label_bring", { machine: target() }) : t("work.progress.label", { machine: target() })}
        </p>
        <ol class="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 p-0 text-neutral-500">
          <For each={visible()}>
            {(s) => (
              <li class="flex items-center gap-1" data-carry-step={s} data-carry-step-state={done(s) ? "done" : s === step() ? "now" : "next"}>
                <Show when={done(s)} fallback={<Show when={s === step() && !carry()?.failure && s !== "ready"}><Spinner size={12} /></Show>}>
                  <Check size={12} aria-hidden="true" />
                </Show>
                <span class={s === step() ? "text-neutral-950" : undefined}>{label(s)}</span>
              </li>
            )}
          </For>
        </ol>
        <Show when={failure()}>
          {(f) => (
            <div class="mt-1.5 flex flex-col gap-1.5">
              <p class="m-0 text-error-strong" data-carry-failure>{f().text}</p>
              <Show when={"detail" in f() && f().detail}>{(d) => <p class="m-0 text-neutral-500">{d()}</p>}</Show>
              <div class="flex gap-2">
                <Button size="compact" variant="secondary" data-carry-fix onClick={() => f().fix.run()}>{f().fix.label}</Button>
                <Show when={"retry" in f()}>
                  <Button size="compact" variant="outline" onClick={props.onRetry}>{t("work.failure.retry")}</Button>
                </Show>
                <Button size="compact" variant="outline" data-carry-cancel onClick={() => void stopCarry(props.draft)}>{t("work.carry.cancel")}</Button>
              </div>
            </div>
          )}
        </Show>
        <Show when={!carry()?.failure && carry()?.progress?.step === "copy" && carry()?.progress?.bytes}>
          <p class="m-0 mt-1 text-neutral-500">
            {peso(carry()?.progress?.sent ?? 0)} / {peso(carry()?.progress?.bytes ?? 0)}
          </p>
        </Show>
        <Show when={!carry()?.failure}>
          <Button size="compact" variant="outline" class="mt-1" data-carry-cancel onClick={() => void stopCarry(props.draft)}>{t("work.carry.cancel")}</Button>
        </Show>
      </div>
      </Show>
      )}
    </Show>
  );
}

/**
 * «Copia de MacBook · rama · fecha» en el encabezado de la tarea que nació de
 * una copia; «Viene de “tarea” en vm», con su enlace, en la que nació al traer.
 */
export function CarryOriginLabel(props: { session: string; onOpen: (project: string, session: string) => void }) {
  const origin = () => carryOrigin(props.session);
  const date = () => df({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(origin()?.at ?? 0);
  return (
    <Show when={origin()}>
      {(o) => (
        <Show when={o().from} fallback={
          <p class="m-0 shrink-0 truncate px-4 text-caption text-neutral-500" data-carry-origin>
            {o().branch
              ? t("work.origin", { machine: machineName(o().machine), branch: o().branch ?? "", date: date() })
              : t("work.origin_detached", { machine: machineName(o().machine), date: date() })}
          </p>
        }>
          {(from) => (
            <p class="m-0 flex shrink-0 items-center gap-2 px-4 text-caption text-neutral-500" data-carry-origin>
              <span class="truncate">{t("work.bring.from", { task: from().title, machine: machineName(o().machine) })}</span>
              <Button size="compact" variant="ghost" data-carry-open-original onClick={() => props.onOpen(from().project, from().session)}>
                {t("work.bring.open_original")}
              </Button>
            </p>
          )}
        </Show>
      )}
    </Show>
  );
}
