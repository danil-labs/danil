import { For, Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import ArrowRight from "lucide-solid/icons/arrow-right";
import Lock from "lucide-solid/icons/lock";
import { type CarryState, CarryError, cancelCarry, carriesNothing, newState, prepare } from "../queries/carryRun.ts";
import { type Selection, bringBranch, bringSelection, choosable, etaSeconds, initialSelection, sizeVerdict, takenAtMs } from "../model/carryPlan.ts";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { Button } from "../../../../ui/src/Button";
import { Toggle } from "../../../../ui/src/Toggle";
import { copyText } from "../../../../host/src/clipboard";
import { df, elapsed, peso } from "../../../../ui/src/lib/format";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { type CarryCheck, bytesPerSecond, createsProject, engine, ignoredAllowed, jobFor, partSize, trustKey } from "../queries/carry";
import { machineName } from "../queries/store";

/** Lo que se pide al exportar mientras la persona decide; se rehace al cambiar la selección. */
type Preview = { state: CarryState; bytes: number | null; tooLarge: boolean };

const SETTLE_MS = 400;

/** Lo elegido en la hoja; al traer, también la rama que lo recibe y qué hacer después. */
export type SheetChoice = { selection: Selection; partSize: number; task: string | null; branchAs: string | null; next: "continue" | "branch" };

/**
 * La hoja «Llevar a…»: qué viaja de la carpeta a la máquina donde nace la
 * tarea. Mientras se decide, el origen ya exporta la selección para decir
 * cuánto pesa; cancelar la borra. El mensaje sigue en la caja hasta enviar.
 * Con `check.task` es la hoja «Traer…»: el worktree de una tarea de otra
 * máquina llega aquí como una rama, sin tocar la carpeta.
 */
export default function CarrySheet(props: {
  check: CarryCheck;
  /** Al traer: la tarea sigue en un turno. */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (choice: SheetChoice, state: CarryState) => void;
}) {
  const s = () => props.check.status;
  const bring = () => !!props.check.task;
  const first = props.check.task ? bringSelection(props.check.status) : initialSelection(props.check.status);
  const [selection, setSelection] = createSignal<Selection>(ignoredAllowed(props.check) ? first : { ...first, files: [] });
  const [next, setNext] = createSignal<"continue" | "branch">("continue");
  const branchAs = () => (bring() ? bringBranch(s(), machineName(props.check.source)) : null);
  const [preview, setPreview] = createSignal<Preview | null>(null);
  const [copied, setCopied] = createSignal<string | null>(null);
  const [keyChanged, setKeyChanged] = createSignal(props.check.keyChanged);
  const source = () => machineName(props.check.source);
  const target = () => machineName(props.check.target);
  let confirmed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const job = (sel: Selection) => jobFor(props.check, { selection: sel, partSize: partSize(), task: props.check.task?.id ?? null, branchAs: branchAs() });

  // Cada selección es otra exportación: la anterior se borra en el origen.
  createEffect(on(selection, (sel) => {
    clearTimeout(timer);
    const previous = preview();
    if (previous) void cancelCarry(engine, job(sel), previous.state);
    if (carriesNothing(sel)) {
      setPreview(null);
      return;
    }
    const state = newState(crypto.randomUUID());
    setPreview({ state, bytes: null, tooLarge: false });
    timer = setTimeout(() => {
      prepare(engine, job(sel), state)
        .then((exported) => setPreview((p) => (p?.state === state ? { ...p, bytes: exported.bytes } : p)))
        .catch((error) => {
          const tooLarge = error instanceof CarryError && error.failure.code === "too_large";
          setPreview((p) => (p?.state === state ? { ...p, tooLarge, bytes: tooLarge ? null : 0 } : p));
        });
    }, SETTLE_MS);
  }));
  onCleanup(() => {
    clearTimeout(timer);
    const p = preview();
    if (!confirmed && p) void cancelCarry(engine, job(selection()), p.state);
  });

  const toggle = (list: "files" | "exclude", path: string, on: boolean) =>
    setSelection((sel) => ({ ...sel, [list]: on ? [...sel[list], path] : sel[list].filter((p) => p !== path) }));

  const verdict = () => {
    const p = preview();
    if (p?.tooLarge) return "block";
    return p?.bytes == null ? null : sizeVerdict(p.bytes);
  };
  const ready = () => !keyChanged() && (carriesNothing(selection()) || (preview()?.bytes != null && verdict() !== "block"));

  const pushCommand = () => `git push -u origin ${s().branch ?? "HEAD"}`;
  function push() {
    const command = pushCommand();
    void copyText(command).then(() => setCopied(command)).catch(() => {});
  }

  function confirm() {
    const p = preview();
    confirmed = true;
    props.onConfirm(
      { selection: selection(), partSize: partSize(), task: props.check.task?.id ?? null, branchAs: branchAs(), next: next() },
      p?.state ?? newState(crypto.randomUUID()),
    );
  }

  const workLine = () => {
    const parts: string[] = [];
    if (s().ahead > 0) parts.push(s().branch ? t("work.carry.commits", { count: s().ahead, branch: s().branch ?? "" }) : t("work.carry.commits_detached", { count: s().ahead }));
    const files = [
      s().changed > 0 ? t("work.carry.changed", { count: s().changed }) : null,
      s().untracked > 0 ? t("work.carry.untracked", { count: s().untracked }) : null,
    ].filter(Boolean);
    if (files.length) parts.push(files.join(" · "));
    return parts;
  };

  const row = "flex items-center gap-2 text-ui text-neutral-700";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onCancel(); }}>
      <DialogContent class="max-w-[560px]" data-carry-sheet={bring() ? "bring" : "carry"}>
        <DialogTitle class="m-0 text-lead font-semibold">
          {bring()
            ? t("work.bring.title", { task: props.check.task?.title ?? "", machine: source(), here: target() })
            : t("work.carry.title", { project: props.check.project.name, machine: target() })}
        </DialogTitle>

        <div class="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-3 text-xs text-neutral-500">
          <div class="min-w-0">
            <p class="m-0 font-medium text-neutral-950">{source()}</p>
            <p class="m-0 truncate">
              {bring() ? t("work.bring.task", { task: props.check.task?.title ?? "" }) : (props.check.project.working_directory ?? props.check.project.name)}
            </p>
            <Show when={s().branch}>{(b) => <p class="m-0 truncate font-mono">{b()}</p>}</Show>
          </div>
          <ArrowRight size={14} class="mt-0.5" aria-hidden="true" />
          <div class="min-w-0">
            <p class="m-0 font-medium text-neutral-950">{target()}</p>
            <Show when={bring()} fallback={
              <p class="m-0" data-carry-target-project={createsProject(props.check) ? "create" : props.check.hasProject === false ? "clone" : "present"}>
                {createsProject(props.check) ? t("work.carry.creates") : props.check.hasProject === false ? t("work.carry.clones") : t("work.carry.present")}
              </p>
            }>
              <p class="m-0 truncate">{props.check.project.working_directory ?? props.check.project.name}</p>
              <p class="m-0 truncate font-mono" data-carry-branch-as>{t("work.bring.branch", { branch: branchAs() ?? "" })}</p>
            </Show>
          </div>
        </div>

        <section class="mt-4">
          <div class="flex items-center justify-between gap-2">
            <h3 class="m-0 text-ui font-semibold">{bring() ? t("work.bring.work_title") : t("work.carry.work_title")}</h3>
            <Show when={workLine().length}>
              <label class={row}>
                <Toggle
                  checked={selection().includeWork}
                  disabled={createsProject(props.check)}
                  label={bring() ? t("work.bring.toggle") : t("work.carry.work_toggle")}
                  data-carry-include-work
                  onChange={(v) => setSelection((sel) => ({ ...sel, includeWork: v }))}
                />
                {bring() ? t("work.bring.toggle") : t("work.carry.work_toggle")}
              </label>
            </Show>
          </div>
          <Show when={workLine().length} fallback={<p class="m-0 mt-1 text-xs text-neutral-500">{t("work.carry.clean")}</p>}>
            <For each={workLine()}>{(line) => <p class="m-0 mt-1 text-xs text-neutral-500">{line}</p>}</For>
          </Show>
          <Show when={selection().includeWork && s().largeUntracked.length}>
            <p class="m-0 mt-2 text-xs font-medium text-neutral-700">{t("work.carry.large_title")}</p>
            <p class="m-0 text-xs text-neutral-500">{t("work.carry.large_hint")}</p>
            <For each={s().largeUntracked}>
              {(f) => (
                <label class={row}>
                  <input type="checkbox" data-carry-large={f.path} checked={!selection().exclude.includes(f.path)}
                    onChange={(e) => toggle("exclude", f.path, !e.currentTarget.checked)} />
                  <span class="flex-1 truncate font-mono text-xs">{f.path}</span>
                  <span class="text-xs text-neutral-500">{peso(f.bytes)}</span>
                </label>
              )}
            </For>
          </Show>
        </section>

        <Show when={s().ignored.length || s().ignoredSkipped.length}>
          <section class="mt-4">
            <h3 class="m-0 text-ui font-semibold">{t("work.carry.ignored_title")}</h3>
            <For each={s().ignored}>
              {(f) => (
                <label class={row}>
                  <input type="checkbox" data-carry-ignored={f.path} disabled={!choosable(f) || !ignoredAllowed(props.check)}
                    checked={selection().files.includes(f.path)}
                    onChange={(e) => toggle("files", f.path, e.currentTarget.checked)} />
                  <span class="flex-1 truncate font-mono text-xs">{f.path}</span>
                  <span class="text-xs text-neutral-500">{choosable(f) ? peso(f.bytes) : t("work.carry.ignored_too_big")}</span>
                </label>
              )}
            </For>
            <Show when={s().ignoredSkipped.length}>
              <p class="m-0 mt-1 text-xs text-neutral-500">{t("work.carry.skipped", { dirs: s().ignoredSkipped.join(", ") })}</p>
            </Show>
            <Show when={!ignoredAllowed(props.check)}>
              <p class="m-0 mt-1 text-xs text-neutral-500" data-carry-ignored-unsealed>{t("work.carry.ignored_unsealed")}</p>
            </Show>
            <Show when={bring() && s().ignored.length}>
              <p class="m-0 mt-1 text-xs text-neutral-500">{t("work.bring.ignored_hint", { machine: source() })}</p>
            </Show>
          </section>
        </Show>

        <Show when={bring()}>
          <p class="m-0 mt-3 text-xs text-neutral-500">{t("work.bring.branch_hint", { branch: branchAs() ?? "", machine: source() })}</p>
          <Show when={props.check.hasProject === false}>
            <p class="m-0 mt-1 text-xs text-neutral-500">{t("work.bring.missing_project", { here: target(), project: props.check.project.name })}</p>
          </Show>
          <Show when={props.busy}>
            <p class="m-0 mt-1 text-xs text-warning-strong" data-carry-busy>{t("work.bring.busy")}</p>
          </Show>
          <fieldset class="m-0 mt-3 flex flex-col gap-1 border-0 p-0">
            <legend class="mb-1 p-0 text-ui font-semibold">{t("work.bring.then")}</legend>
            <label class={row}>
              <input type="radio" name="carry-next" data-carry-next="continue" checked={next() === "continue"} onChange={() => setNext("continue")} />
              {t("work.bring.continue")}
            </label>
            <label class={row}>
              <input type="radio" name="carry-next" data-carry-next="branch" checked={next() === "branch"} onChange={() => setNext("branch")} />
              {t("work.bring.branch_only")}
            </label>
          </fieldset>
        </Show>

        <Show when={s().lfs}><p class="m-0 mt-3 text-xs text-neutral-500" data-carry-notice="lfs">{t("work.carry.lfs", { machine: target() })}</p></Show>
        <Show when={s().submodules}><p class="m-0 mt-1 text-xs text-neutral-500" data-carry-notice="submodules">{t("work.carry.submodules", { machine: target() })}</p></Show>

        <div class="mt-4 flex flex-col gap-1 text-xs text-neutral-500" data-carry-size={verdict() ?? "pending"}>
          <Show when={!carriesNothing(selection())}>
            <Show when={!preview()?.tooLarge} fallback={<p class="m-0 text-error-strong">{t("work.carry.too_large", { machine: target() })}</p>}>
              <Show when={preview()?.bytes != null} fallback={<p class="m-0">{t("work.carry.preparing")}</p>}>
                <p class="m-0">{t("work.carry.size", { size: peso(preview()?.bytes ?? 0), eta: elapsed(etaSeconds(preview()?.bytes ?? 0, bytesPerSecond())) })}</p>
                <Show when={verdict() === "warn"}><p class="m-0 text-warning-strong">{t("work.carry.size_warn", { size: peso(preview()?.bytes ?? 0) })}</p></Show>
              </Show>
            </Show>
            <p class="m-0">{t("work.carry.taken_at", { time: df({ hour: "2-digit", minute: "2-digit" }).format(takenAtMs(s())) })}</p>
          </Show>
          <Show when={props.check.recipientKey}>
            <p class="m-0 flex items-center gap-1" data-carry-sealed><Lock size={12} aria-hidden="true" />{t("work.carry.sealed", { machine: target() })}</p>
          </Show>
          <Show when={keyChanged()}>
            <div class="flex flex-col items-start gap-1" data-carry-key-changed>
              <p class="m-0 text-warning-strong">{t("work.carry.key_changed", { machine: target() })}</p>
              <Button size="compact" variant="secondary" data-carry-trust-key onClick={() => {
                trustKey(props.check.target, props.check.recipientKey ?? "");
                setKeyChanged(false);
              }}>{t("work.carry.trust_key")}</Button>
            </div>
          </Show>
          <Show when={copied()}>{(command) => <p class="m-0" role="status">{t("work.carry.push_copied", { command: command() })}</p>}</Show>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => props.onCancel()}>{t("work.carry.cancel")}</Button>
          <Show when={verdict() === "block"}>
            <Button variant="secondary" size="sm" onClick={push}>{t("work.carry.push")}</Button>
          </Show>
          <Button size="sm" data-carry-confirm disabled={!ready()} onClick={confirm}>{bring() ? t("work.bring.confirm") : t("work.carry.confirm")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
