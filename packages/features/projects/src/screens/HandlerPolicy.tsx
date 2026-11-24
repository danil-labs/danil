import { handlerMutation, handlerOperationRunning, pendingHandlerOperation, resumeHandlerOperation, staleReason } from "../queries/handlerOperations";
import "../../../../ui/src/locales/handlerPhrases";
import "../../../../ui/src/locales/failurePhrases";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { handlerAction } from "../queries/handler-action";
import { t } from "../../../../ui/src/lib/i18n";
import type { HandlerApproval, HandlerMemory, HandlerRelease, HandlerRequests } from "../../../../ui/src/lib/model";
import { detalleDe } from "../../../../ui/src/lib/failure";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { prosaDe } from "../../../../ui/src/Failure";
import { Input } from "../../../../ui/src/Input";

export type HandlerPolicyActions = {
  scope: string;
  resume: (operation: string) => Promise<HandlerRequests | HandlerRelease>;
  requests: () => Promise<HandlerRequests>;
  memory: () => Promise<HandlerMemory | null>;
  approve: (args: HandlerApproval) => Promise<HandlerRequests>;
  revoke: () => Promise<HandlerRequests>;
  release: () => Promise<HandlerRelease>;
};

/** Dónde actúa el panel: `[workspace, project, name, headers]` en JSON. Mientras no cambie, el panel conserva su estado. */
export type HandlerTarget = string;

function handlerActions(scope: HandlerTarget): HandlerPolicyActions {
  const [workspace, project, name, headers] = JSON.parse(scope) as [string, string, string, Record<string, string>];
  const call = <T,>(request: Record<string, unknown>) => handlerAction<T>({ input: { workspace, project, request } }, { headers });
  return {
    scope,
    resume: operation => call<HandlerRequests | HandlerRelease>({ action: "resume", operation }),
    requests: () => call<HandlerRequests>({ action: "requests", name }),
    memory: async () => (await call<{ handlers: { name: string; memory: HandlerMemory }[] }>({ action: "list" })).handlers.find(row => row.name === name)?.memory ?? null,
    approve: args => call<HandlerRequests>({ action: "approve", name, mcp: args.mcp, tool: args.tool, acceptHints: args["accept-hints"] }),
    revoke: () => call<HandlerRequests>({ action: "revoke", name }),
    release: () => call<HandlerRelease>({ action: "release", name }),
  };
}

const failureText = (error: unknown) => {
  const message = prosaDe(error);
  const detail = detalleDe(error);
  return detail && detail !== message ? `${message}\n${detail}` : message;
};

export default function HandlerPolicy(props: { name: string; target: HandlerTarget }) {
  const bound = createMemo(() => handlerActions(props.target));
  const pending = () => pendingHandlerOperation(bound().scope);
  const locked = () => busy() || !!pending() || handlerOperationRunning(bound().scope);
  const [report, setReport] = createSignal<HandlerRequests>();
  const [memory, setMemory] = createSignal<HandlerMemory | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<string | null>(null);
  const [dialog, setDialog] = createSignal<"approve" | "release" | null>(null);
  const [mcp, setMcp] = createSignal("");
  const [tools, setTools] = createSignal("");
  const [hints, setHints] = createSignal("");
  let generation = 0;
  onCleanup(() => generation++);

  async function refresh(actions = bound()) {
    const current = ++generation;
    setBusy(true);
    setFailure(null);
    try {
      const [requests, resolved] = await Promise.all([actions.requests(), actions.memory()]);
      if (current !== generation) return;
      setReport(requests);
      setMemory(resolved);
    } catch (e) {
      if (current === generation) setFailure(failureText(e));
    } finally {
      if (current === generation) setBusy(false);
    }
  }
  createEffect(() => {
    const actions = bound();
    setReport(undefined);
    setMemory(null);
    setDialog(null);
    setResult(null);
    setMcp(""); setTools(""); setHints("");
    void refresh(actions);
  });

  async function act(action: "approve" | "revoke" | "release") {
    if (locked()) return;
    const current = generation;
    const actions = bound();
    setBusy(true);
    setFailure(null);
    setResult(null);
    try {
      if (action === "release") {
        const released = await handlerMutation(actions.scope, action, actions.release);
        if (current !== generation) return;
        setResult(released.released ? t("settings.handler.released") : t("settings.handler.not_quarantined"));
      } else {
        const updated = action === "approve"
          ? await handlerMutation(actions.scope, action, () => actions.approve({ mcp: mcp().trim(), tool: tools().trim(), "accept-hints": hints().trim() }))
          : await handlerMutation(actions.scope, action, actions.revoke);
        if (current !== generation) return;
        setReport(updated);
        setResult(action === "approve" ? t("settings.handler.approved") : t("settings.handler.revoked"));
      }
      setDialog(null);
      await refresh(actions);
    } catch (e) {
      if (current === generation) { setFailure(failureText(e)); }
    } finally {
      if (current === generation) setBusy(false);
    }
  }

  async function resume() {
    if (busy()) return;
    const actions = bound();
    const current = generation;
    setBusy(true);
    try {
      await resumeHandlerOperation(actions.scope, actions.resume);
      if (current !== generation) return;
      setDialog(null);
      await refresh(actions);
    } catch (e) {
      if (current === generation) { setFailure(failureText(e)); }
    } finally { if (current === generation) setBusy(false); }
  }

  function openDialog(kind: "approve" | "release") {
    setFailure(null);
    setDialog(kind);
  }

  return <section class="grid gap-3" aria-label={t("settings.handler.title")}>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="m-0 text-sm font-semibold">{t("settings.handler.title")}</h3>
      <Button size="compact" variant="ghost" disabled={busy()} onClick={() => void refresh()}>{t("settings.handler.refresh")}</Button>
    </div>
    <Show when={pending()}><p role="status" class="m-0 text-xs">{t("settings.handler.pending")}</p><Button disabled={busy()} onClick={() => void resume()}>{t("settings.handler.resume")}</Button></Show>
    <Show when={memory()}>{m => <div class="grid gap-1 text-xs text-neutral-700">
      <p class="m-0 text-xs">{t("settings.handler.memory_declared")}</p>
      <Show when={typeof m().store === "string"} fallback={<p class="m-0">{t("settings.handler.memory_slot", { slot: (m().store as { slot: string }).slot })}</p>}>
      <p class="m-0 font-semibold">{t("settings.handler.memory")}: {t(`settings.handler.memory.${m().status}`)}</p>
      <p class="m-0">{m().synced ? t("settings.handler.synced", { count: m().entries }) : t("settings.handler.not_synced", { count: m().entries })}</p>
      <p class="m-0 break-all">{m().identity}</p>
      <Show when={m().server}><p class="m-0">{t("settings.handler.server", { server: m().server! })}</p></Show>
      <Show when={m().reason}><p class="m-0">{m().reason}</p></Show>
      <Show when={m().legacy_entries}><p class="m-0">{t("settings.handler.legacy", { count: m().legacy_entries! })}</p></Show>
      </Show>
    </div>}</Show>
    <Show when={report()}>{r => <>
      <p class="m-0 break-all text-xs text-neutral-500">{t("settings.handler.source", { source: r().source })}</p>
      <Show when={r().digest}><p class="m-0 break-all font-mono text-xs">{r().digest}</p></Show>
      <Show when={r().dirty}><p class="m-0 text-xs text-warning-strong">{t("settings.handler.dirty")}</p></Show>
      <Show when={r().stale}><p class="m-0 text-xs text-warning-strong">{t("settings.handler.stale")} {staleReason(r())}</p></Show>
      <For each={r().requests}>{request => <div class="grid gap-1 border-l border-border pl-3 text-xs">
        <span class="font-semibold">{request.slot ?? request.name ?? request.host} · {t(`settings.handler.state.${request.state}`)}</span>
        <Show when={request.access}><span>{t("settings.handler.access", { access: request.access! })}</span></Show>
        <Show when={request.why}><span class="text-neutral-500">{request.why}</span></Show>
        <Show when={request.server}><span>{t("settings.handler.granted", { server: request.server!, access: request.granted_access ?? "" })}</span></Show>
        <Show when={request.allowed_tools?.length}><span>{request.allowed_tools?.join(", ")}</span></Show>
        <Show when={request.reason}><span class="text-warning-strong">{request.reason}</span></Show>
      </div>}</For>
      <Show when={!r().requests.length}><p class="m-0 text-xs text-neutral-500">{t("settings.handler.empty")}</p></Show>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={locked() || r().dirty || !r().digest || !r().requests.some(q => q.kind !== "network")} onClick={() => openDialog("approve")}>{t("settings.handler.approve")}</Button>
        <Button size="sm" variant="ghost" disabled={locked() || !r().approval || !!r().approval?.revoked_at} onClick={() => void act("revoke")}>{t("settings.handler.revoke")}</Button>
      </div>
    </>}</Show>
    <p class="m-0 text-xs text-neutral-500">{t("settings.handler.release_hint")}</p>
    <div><Button size="sm" variant="ghost" disabled={locked()} onClick={() => openDialog("release")}>{t("settings.handler.release")}</Button></div>
    <Show when={!dialog() && failure()}><p role="alert" class="m-0 text-xs text-error-strong">{failure()}</p></Show>
    <Show when={result()}><p role="status" class="m-0 text-xs text-neutral-700">{result()}</p></Show>
    <Dialog open={!!dialog()} onOpenChange={open => { if (!open && !busy()) { setDialog(null); setFailure(null); } }}>
      <DialogContent>
        <DialogTitle>{dialog() === "approve" ? t("settings.handler.approve") : t("settings.handler.release")}</DialogTitle>
        <p class="text-sm text-neutral-700">{dialog() === "approve" ? t("settings.handler.approve_hint") : t("settings.handler.release_confirm", { name: props.name })}</p>
        <Show when={dialog() === "approve"}>
          <div class="grid gap-3">
            <label class="grid gap-1 text-xs">{t("settings.handler.bindings")}<Input value={mcp()} onInput={e => setMcp(e.currentTarget.value)} disabled={locked()} /></label>
            <label class="grid gap-1 text-xs">{t("settings.handler.tools")}<Input value={tools()} onInput={e => setTools(e.currentTarget.value)} disabled={locked()} /></label>
            <label class="grid gap-1 text-xs">{t("settings.handler.hints")}<Input value={hints()} onInput={e => setHints(e.currentTarget.value)} disabled={locked()} /></label>
            <p class="m-0 text-xs text-neutral-500">{t("settings.handler.hints_help")}</p>
          </div>
        </Show>
        <Show when={pending()}><p class="text-xs">{t("settings.handler.pending")}</p><Button disabled={busy()} onClick={() => void resume()}>{t("settings.handler.resume")}</Button></Show>
        <Show when={failure()}><p role="alert" class="whitespace-pre-wrap break-words text-xs text-error-strong">{failure()}</p></Show>
        <div class="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="secondary" disabled={busy()} onClick={() => { setDialog(null); setFailure(null); }}>{t("settings.handler.cancel")}</Button>
          <Button size="sm" disabled={locked() || (dialog() === "approve" && !mcp().trim() && !tools().trim())} onClick={() => void act(dialog() === "approve" ? "approve" : "release")}>{t("settings.handler.confirm")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
