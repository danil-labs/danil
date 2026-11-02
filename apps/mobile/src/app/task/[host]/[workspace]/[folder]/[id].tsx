import { RADIUS, TEXT } from "@terminus/design";
import { AgentAvatar } from "../../../../../ui/AgentAvatar";
import { SendButton } from "../../../../../ui/SendButton";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppState, FlatList, Image, type NativeScrollEvent, type NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { type HistoryRead, HistoryPager, type LoadedHistory, type OlderState, hasOlder, hasRecentGap } from "@terminus/chat/history";
import { type ChatEvent, DEFAULT_CHAT_VEIL, PROVIDER_HANDOFF_FEATURE, type Question, type Turn } from "@terminus/protocol";
import { delegatedOf, taskTitle } from "@terminus/tasks";
import {
  type ChatBackdropView,
  type PendingQuestion,
  type Permission,
  type Task,
  type TaskView,
  answerQuestion,
  chatBackgroundOf,
  coalesced,
  injectIntoTask,
  loadTask,
  loadTurns,
  markSeen,
  respondPermission,
  runShell,
  sendToTask,
  setSessionProvider,
  switchLiveMode,
  stopShell,
  stopTask,
  taskDefaults,
} from "../../../../../lib/engine";
import { HostError } from "../../../../../lib/hosts";
import { type ChatLine, type Line, type LivePiece, type WorkLine, applyLive, lineMatches, liveAfterRead, runClock, savesLive, workRuns } from "../../../../../lib/steps";
import { failureGesture, failureKey, failureSentence, isInterruption } from "../../../../../lib/failureNotice";
import { handoverGate, sendWithHandover } from "../../../../../lib/handover";
import { publishWork, releaseWork } from "../../../../../lib/workSheet";
import { hasKey, lang, phrase, t, w } from "../../../../../lib/i18n";
import { type ScrollAnchor, anchorOf, restoreAnchor, scrollToEnd } from "../../../../../lib/scrollAnchor";
import { type Follow, MARGIN, OPENED, fromTop, jumped, scrolled, showJump, unseen } from "../../../../../lib/follow";
import { useAccount } from "../../../../../lib/account";
import { useMachines } from "../../../../../lib/machines";
import { COMPUTERS } from "../../../../../lib/supabase";
import { useWorkspaces } from "../../../../../lib/workspaces";
import { HistoryDetail } from "../../../../../ui/chat/HistoryDetail";
import { Attachments, MessageBody, toolImages } from "../../../../../ui/chat/Message";
import { ChatScopeContext } from "../../../../../ui/chat/scope";
import { TurnStatus, WorkGroup } from "../../../../../ui/chat/Work";
import { Composer, type Submission } from "../../../../../ui/Composer";
import { type Theme, useTheme } from "../../../../../ui/theme";
import { Icon } from "../../../../../ui/Icon";
import { openTask } from "../../../../../ui/components";
import { KeyboardScreen } from "../../../../../ui/KeyboardScreen";
import { PermissionCard } from "../../../../../ui/PermissionCard";
import { TaskHeader } from "../../../../../ui/TaskHeader";
import { TaskTools } from "../../../../../ui/TaskTools";
import { effectiveGit } from "../../../../../lib/taskGit";
import { useTaskGit } from "../../../../../lib/useTaskGit";
import { BrandMark } from "../../../../../ui/BrandMark";
import { Avatar } from "../../../../../ui/components";

/** Kinds that change what the task reports: pending requests or whether it runs. */
const REFRESH = new Set(["permission", "permission_resolved", "started", "done", "presence", "segment_saved"]);
const TAIL_PAGE_SIZE = 20;
const PREPEND_RECOVERY_MS = 500;

const sameLine = (a: ChatLine, b: ChatLine) => a === b || JSON.stringify(a) === JSON.stringify(b);
const NO_TURNS: Turn[] = [];
const imagesOfTurn = (turn: Turn) => toolImages(turn.tools);

/**
 * Cada lectura trae turnos nuevos aunque no cambien: una línea igual a la anterior
 * se reutiliza, con sus mismos arreglos de imágenes, para que `MessageBody` (memo)
 * no vuelva a pintarse.
 */
const keepSame = (lines: ChatLine[], previous: ReadonlyMap<string, ChatLine>) =>
  lines.map((line) => {
    const old = previous.get(line.key);
    return old && sameLine(old, line) ? old : line;
  });

/**
 * Una tarea en vivo, en la máquina que la corre: conversación, aprobaciones,
 * preguntas, escribir y detener. Con la VM apagada se ve la copia del relay y
 * escribir la enciende; una máquina propia apagada lo dice y no se intenta.
 */
export default function TaskScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ host: string; workspace: string; folder: string; id: string }>();
  const { workspace, id } = params;
  const folder = params.folder === "_" ? "" : params.folder;
  const { hostOf, subscribe, setOpenTask, titleOf, registry } = useMachines();
  const { getToken } = useAccount();
  const accountBackground = registry?.find((w) => w.id === workspace)?.background_url ?? null;
  const host = hostOf(params.host);
  const { snapshot, list: workspaces, reload } = useWorkspaces();
  const [view, setView] = useState<TaskView | null>(null);
  const [live, setLive] = useState<readonly LivePiece[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  // Lo que se mandó mientras la VM enciende: sin él, el mensaje desaparece el minuto o dos que tarda.
  const [pending, setPending] = useState<string | null>(null);
  // El CLI confirmado que se aplicará al enviar (`provider_handoff_v1`).
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [background, setBackground] = useState<Backdrop | null>(null);
  // Las decisiones que ya salieron, por `request_id`: el motor falla en la segunda. El ref ataja el doble toque antes del render.
  const [deciding, setDeciding] = useState<ReadonlySet<string>>(new Set());
  const decidingNow = useRef(new Set<string>());
  const list = useRef<FlatList<ChatLine>>(null);
  // Buscar en el chat: con texto, solo las líneas que lo dicen; `null` cerrado.
  const [finding, setFinding] = useState<string | null>(null);
  const key = `${params.host}/${id}`;
  // La ventana de la conversación y su página anterior; una por máquina, workspace y tarea.
  const [history, setHistory] = useState<LoadedHistory<Turn> | null>(null);
  const [older, setOlder] = useState<OlderState>("idle");
  const pagerScope = `${params.host}\n${workspace}\n${id}`;
  const pager = useRef<{ scope: string; pager: HistoryPager<Turn> } | null>(null);
  const hostNow = useRef(host);
  hostNow.current = host;
  const pagerNow = () => {
    if (pager.current?.scope === pagerScope) return pager.current.pager;
    const scope = pagerScope;
    const next: HistoryPager<Turn> = new HistoryPager<Turn>({
      read: async (before): Promise<HistoryRead<Turn>> => {
        const machine = hostNow.current;
        if (!machine) throw new HostError("machine_off");
        if (before !== null) return loadTurns(machine, workspace, folder, id, before);
        const tail = await loadTask(machine, workspace, folder, id, true);
        return { turns: tail.session.turns, history: tail.session.history };
      },
      onChange: () => {
        if (pager.current?.scope !== scope) return;
        setHistory(next.loaded ?? null);
        setOlder(next.older);
      },
    });
    pager.current = { scope, pager: next };
    return next;
  };
  const needle = finding?.trim().toLowerCase() ?? "";
  const webScope = JSON.stringify([params.host, workspace, folder, id, needle]);
  // Las que esta tarea lanzó: la lista las esconde bajo ella, como el riel del escritorio. Las hijas
  // remotas viven en otra máquina y nombran a esta por su `taskKey`.
  const delegated = useMemo(() => [
    ...delegatedOf((snapshot?.delegated ?? []).filter((task) => task.host === params.host && !task.remote_launcher), id),
    ...(snapshot?.delegated ?? []).filter((task) => !task.archived && task.remote_launcher === key),
  ].sort((a, b) => b.created_at - a.created_at), [snapshot, params.host, id, key]);
  // Su fila en la lista: dice si es una hija remota, que en v1 no cambia de CLI.
  const machineTasks = useMemo(
    () => [...(snapshot?.tasks ?? []), ...(snapshot?.delegated ?? [])].filter((task) => task.host === params.host && task.workspace === workspace),
    [snapshot, params.host, workspace],
  );
  const taskRow = useMemo(() => machineTasks.find((task) => task.id === id) ?? null, [machineTasks, id]);
  // Si el chat sigue el final, como el hilo del escritorio (ver `lib/follow.ts`). Ref y no estado:
  // cambia con cada evento de scroll; solo el botón, que se ve, va en estado.
  const follow = useRef<Follow>(OPENED);
  const [jump, setJump] = useState<{ shown: boolean; unseen: number }>({ shown: false, unseen: 0 });
  const anchor = useRef<ScrollAnchor>(null);
  const prepending = useRef<ScrollAnchor>(null);
  const prependTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readingScope = useRef<string | null>(null);
  const climb = useRef(() => {});
  const clearPrepending = () => {
    if (prependTimer.current !== null) clearTimeout(prependTimer.current);
    prependTimer.current = null;
    prepending.current = null;
  };
  const resetReading = () => {
    clearPrepending();
    anchor.current = null;
  };
  const webReady = useRef<string | null>(null);
  const [paintedScope, setPaintedScope] = useState<string | null>(null);
  const [webWindow, setWebWindow] = useState<{ scope: string; first: string | null }>({ scope: "", first: null });
  const needleNow = useRef("");
  const webSlice = useRef<{ first: number; rows: readonly ChatLine[]; scope: string }>({ first: 0, rows: [], scope: "" });
  const scroller = () => Platform.OS === "web" ? list.current?.getScrollableNode() as unknown as Element | null : null;
  const toBottom = (animated: boolean) => {
    const node = scroller();
    if (node) scrollToEnd(node, animated);
    else list.current?.scrollToOffset({ offset: 0, animated });
  };
  const restoreReading = (node: Element) => {
    const held = prepending.current;
    if (held) {
      if (restoreAnchor(node, held, false)) {
        anchor.current = held;
        clearPrepending();
        queueMicrotask(() => climb.current());
      }
    } else restoreAnchor(node, anchor.current, false);
  };

  const fail = useCallback(
    (error: unknown) => {
      const name = host?.label ?? "";
      if (error instanceof HostError && error.code === "machine_asleep") return setNote(w("web.machines.off_action", { name }));
      if (error instanceof HostError && error.code === "machine_outdated") return setNote(w("web.machines.outdated_action", { name }));
      if (error instanceof HostError && error.code === "machine_off") return setNote(w("shell.machines.task_off", { name }));
      if (error instanceof HostError && (error.code === "start_failed" || error.code === "start_timeout")) return setNote(t("machines.start_failed", { name }));
      // Un fallo con frase del catálogo (el traspaso sin ventana) se dice igual que cualquier otro.
      const clave = failureKey(error);
      if (clave && hasKey(clave)) return setNote(t(clave));
      setNote(t("task.error", { detail: error instanceof Error ? error.message : String(error) }));
    },
    [host],
  );

  // La tarea abierta ahora: una lectura de la anterior que llega tarde no la pisa.
  const keyNow = useRef(key);
  keyNow.current = key;
  // Lo vivo al momento, sin esperar al render: un evento y la lectura que provoca llegan en el mismo lote.
  const liveNow = useRef<readonly LivePiece[]>([]);
  const putLive = (next: readonly LivePiece[]) => {
    liveNow.current = next;
    setLive(next);
  };
  // `resync`: lo vivo que había al empezar ya está guardado (ver `liveAfterRead`). Leer nunca enciende la máquina.
  const load = async (resync: boolean) => {
    if (!host) return;
    const asked = `${host.id}/${id}`;
    const before = liveNow.current;
    const window = pagerNow();
    const next = await loadTask(host, workspace, folder, id, Boolean(window.loaded));
    if (keyNow.current !== asked) return;
    window.accept(next.session.turns, next.session.history, { reading: !follow.current.following });
    setView(next);
    putLive(liveAfterRead(liveNow.current, before, { running: next.running, resync }));
  };
  const loadNow = useRef(load);
  loadNow.current = load;
  // Una sola lectura a la vez: las que piden el foco, volver al frente, la máquina y los eventos se juntan.
  const reader = useRef(coalesced((resync: boolean) => loadNow.current(resync), (a, b) => a || b));
  const refresh = useCallback((resync = true) => reader.current(resync), [host, workspace, folder, id]);

  // Otra tarea empieza de cero. Solo al cambiar de tarea: que la máquina cambie de objeto (la lista de
  // computadoras se releyó) no vacía la conversación, solo la relee.
  useEffect(() => {
    setOpenTask(key);
    setView(null);
    pager.current?.pager.close();
    pager.current = null;
    setHistory(null);
    setOlder("idle");
    setPendingProvider(null);
    putLive([]);
    follow.current = OPENED;
    setJump({ shown: false, unseen: 0 });
    return () => setOpenTask(null);
  }, [key, setOpenTask]);

  useEffect(() => {
    void refresh()
      .then(() => host && markSeen(host, workspace, id))
      .catch(fail);
  }, [refresh, fail, host, workspace, id]);

  // El fondo del workspace en la máquina de la tarea o en la cuenta; leerlo nunca la enciende.
  useEffect(() => {
    setBackground(null);
    if (!host) return;
    let current = true;
    void chatBackgroundOf(host, workspace, accountBackground, COMPUTERS).then(async (next) => {
      const token = next.remote ? await getToken().catch(() => null) : null;
      if (current) setBackground({ ...next, token });
    });
    return () => {
      current = false;
    };
  }, [host, workspace, accountBackground, getToken]);

  // La máquina cambió: encendida, la copia deja paso a lo vivo; apagada, se ve lo último que guardó en el
  // relay (con su aviso). El enlace que se reabre también avisa aquí: se relee por si algo pasó sin verse.
  useEffect(() => {
    if (!host) return;
    let power = host.power();
    return host.onChange(() => {
      const changed = host.power() !== power;
      power = host.power();
      void refresh(changed).catch(fail);
    });
  }, [host, refresh, fail]);

  // Al volver a la app o a esta pantalla (desde otra de la pila) se relee: lo que terminó mientras no se veía.
  const reread = useRef((_resync: boolean) => {});
  reread.current = (resync) => void refresh(resync).catch(fail);
  const focused = useRef(false);
  // Volver de la hoja no relee: bajo ella siguen llegando los eventos.
  const sheetOpened = useRef(false);
  useFocusEffect(
    useCallback(() => {
      // El primer foco es la apertura, que ya lee arriba.
      if (focused.current && !sheetOpened.current) reread.current(false);
      focused.current = true;
      sheetOpened.current = false;
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => state === "active" && reread.current(true));
    return () => sub.remove();
  }, []);

  useEffect(
    () =>
      subscribe((from, events, gap) => {
        if (from !== params.host) return;
        if (gap) return void refresh().catch(fail);
        for (const event of events) {
          if (event.name !== "chat" && event.name !== "question" && event.name !== "session") continue;
          const chat = event.payload as ChatEvent;
          if (chat.session !== id) continue;
          if (event.name !== "chat") {
            void refresh(savesLive(event.name)).catch(fail);
            continue;
          }
          if (chat.kind === "delta" || chat.kind === "tool" || chat.kind === "tool_done") putLive(applyLive(liveNow.current, chat));
          if (chat.kind === "done") {
            void refresh()
              .then(() => host && markSeen(host, workspace, id))
              .catch(fail);
          } else if (REFRESH.has(chat.kind)) void refresh(savesLive(event.name, chat.kind)).catch(fail);
        }
      }),
    [subscribe, params.host, id, refresh, fail, host, workspace],
  );

  /** Una acción: si la VM está apagada, avisa que se enciende mientras espera. */
  async function act(work: () => Promise<unknown>) {
    if (!host) return false;
    setNote(null);
    const wakes = host.canAct() === "wakes" && host.power() !== "on";
    if (wakes) setWaking(true);
    try {
      await work();
      await refresh();
      return true;
    } catch (error) {
      fail(error);
      return false;
    } finally {
      setWaking(false);
      setPending(null);
    }
  }

  /** Baja animado al final y vuelve a seguirlo: el botón y mandar un mensaje. Sin la cola cargada, primero la trae. */
  const toEnd = () => {
    follow.current = jumped(follow.current);
    setJump({ shown: false, unseen: 0 });
    const window = pagerNow();
    if (window.loaded && hasRecentGap(window.loaded)) void window.latest().then(() => toBottom(false)).catch(fail);
    else toBottom(true);
  };

  /** Pone lo anterior sobre lo que se lee. En la web la lista no es invertida: el ancla lo sostiene. */
  const askOlder = async (retry = false) => {
    const window = pagerNow();
    if (!window.loaded || !hasOlder(window.loaded) || window.older === "loading" || (window.older === "failed" && !retry)) return;
    const put = await window.fetchOlder();
    if (!put) return;
    const node = scroller();
    const held = node ? anchorOf(node) : null;
    if (held) {
      clearPrepending();
      prepending.current = held;
      prependTimer.current = setTimeout(() => {
        if (prepending.current === held) resetReading();
        climb.current();
      }, PREPEND_RECOVERY_MS);
    }
    put();
  };
  const askOlderNow = useRef(askOlder);
  askOlderNow.current = askOlder;

  /** Enviar desde el cuadro: un mensaje abre otro turno; `!` corre el comando en la carpeta. */
  const submit = (s: Submission) => {
    // Mandar es volver al final: lo que se acaba de escribir va abajo, como en el escritorio.
    toEnd();
    if (!s.shell && host?.canAct() === "wakes" && host.power() !== "on") setPending(s.prompt);
    const sent = act(() =>
      sendWithHandover<unknown>({
        shell: s.shell,
        pending: pendingProvider,
        from: view?.session.provider ?? null,
        to: s.provider,
        consent: (provider) => setSessionProvider(host!, workspace, folder, id, provider),
        send: () =>
          s.shell
            ? runShell(host!, workspace, { folder, session: id, command: s.command, provider: s.provider, model: s.model, effort: s.effort, permissionMode: s.permissionMode })
            : sendToTask(host!, workspace, folder, id, s),
      }),
    );
    return sent.then((ok) => {
      // Confirmado el envío, el pendiente ya lo aplicó el motor: no se repite en el siguiente.
      if (ok && !s.shell && s.provider === pendingProvider) setPendingProvider(null);
      return ok;
    });
  };
  const inject = (text: string, attachments: string[]) => act(() => injectIntoTask(host!, workspace, folder, id, text, attachments));

  const settle = (requestId: string) => {
    if (decidingNow.current.delete(requestId)) setDeciding(new Set(decidingNow.current));
  };
  const respond = (permission: Permission, allow: boolean) => {
    if (!host || decidingNow.current.has(permission.request_id)) return;
    decidingNow.current.add(permission.request_id);
    setDeciding(new Set(decidingNow.current));
    void act(() => respondPermission(host, workspace, id, permission.request_id, allow)).then((sent) => {
      if (!sent) settle(permission.request_id);
    });
  };
  const answer = (pending: PendingQuestion, chosen: Record<string, string[]>, free: Record<string, string>) =>
    host && void act(() => answerQuestion(host, workspace, folder, id, pending, chosen, free));
  // Un `!` en marcha se detiene con su comando; si no había, se detiene el turno.
  const stop = () =>
    host &&
    void stopShell(host, workspace, id)
      .then((r) => (r.value === true ? undefined : stopTask(host, workspace, folder, id)))
      .catch(() => stopTask(host, workspace, folder, id))
      .catch(fail);

  const running = host?.power() === "on" && (view?.running ?? false);
  // Cambiar de CLI lo decide el motor (`can_hand_over`/`hand_over_blocked`); aquí solo se suma lo que el cliente sabe.
  const handover = handoverGate({
    session: view?.session,
    running,
    features: host?.features?.(),
    remote: Boolean(taskRow?.remote_parent || taskRow?.remote_launcher),
  });
  const machineReady = host?.power() === "on" && host.canAct() === "now";
  const canHandoff = handover.allowed && machineReady;
  const handoverReason = !handover.allowed && handover.reason
    ? hasKey(handover.reason) ? t(handover.reason) : phrase({ clave: handover.reason })
    : machineReady || !host
      ? null
      : host.canAct() === "outdated"
        ? w("web.machines.outdated_action", { name: host.label })
        : w("web.machines.off_action", { name: host.label });
  const permissions = useMemo(() => view?.permissions ?? [], [view?.permissions]);
  // Otro cliente pudo decidir: `pending_requests` manda, sin decisión optimista.
  useEffect(() => {
    for (const requestId of decidingNow.current) if (!permissions.some((p) => p.request_id === requestId)) settle(requestId);
  }, [permissions]);

  /** Elegir modo con el turno en marcha: el motor lo aplica al turno vivo (`switchLiveMode`). */
  const chosenMode = useRef<string | null>(null);
  const changeMode = (mode: string) => {
    if (!host) return;
    chosenMode.current = mode;
    void switchLiveMode(host, workspace, folder, id, mode, () => chosenMode.current === mode)
      .then(() => refresh())
      .catch(fail);
  };
  const questions = view?.questions ?? [];
  const asleep = host?.canAct() === "asleep" || host?.canAct() === "outdated";
  const turns = history?.turns ?? NO_TURNS;
  const base = history?.start ?? 0;
  const thread = useMemo(() => workRuns(turns, live, running, imagesOfTurn, base), [turns, live, running, base]);
  const recentGap = history ? hasRecentGap(history) : false;
  const shown = useRef<ReadonlyMap<string, ChatLine>>(new Map());
  const lines = useMemo(() => {
    const next = keepSame(thread.lines, shown.current);
    shown.current = new Map(next.map((line) => [line.key, line]));
    return next;
  }, [thread.lines]);
  const cachedNote =
    view?.cachedAt && host ? t("machines.cached", { name: host.label, time: new Date(view.cachedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }) : null;
  const title = (view?.session.turns.find((turn) => turn.role === "user")?.text ?? "").split("\n")[0];
  const lastAgent = [...lines].reverse().find((line) => line.kind === "message" && line.role !== "user" && line.role !== "system" && line.role !== "shell")?.key;
  const liveLines = thread.live;
  // Las respuestas del agente, para contar en el botón las que entraron desde que se subió.
  const replies = useRef(0);
  const repliesHeld = lines.filter((line) => line.kind === "message" && line.role !== "user" && line.role !== "system" && line.role !== "shell").length;
  // Una página anterior no es una respuesta nueva: al moverse la ventana, la cuenta sigue donde iba.
  const repliesBase = useRef({ start: base, offset: 0 });
  if (repliesBase.current.start !== base) repliesBase.current = { start: base, offset: repliesHeld - replies.current };
  replies.current = repliesHeld - repliesBase.current.offset;
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS === "web" && prepending.current) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const metrics = { content: contentSize.height, viewport: layoutMeasurement.height };
    const next = scrolled(follow.current, { ...metrics, offset: Platform.OS === "web" ? contentOffset.y : fromTop(contentOffset.y, metrics) }, replies.current);
    follow.current = next;
    const node = scroller();
    if (node) {
      // Con la hoja encima el centro del hilo no es del hilo: se queda el ancla que había y no se piden más filas.
      anchor.current = next.following ? null : sheetOpened.current ? anchor.current : anchorOf(node);
      const page = webSlice.current;
      if (!sheetOpened.current && webReady.current === page.scope && contentOffset.y < MARGIN && page.first > 0 && !prepending.current) {
        const held = anchorOf(node);
        prepending.current = held;
        if (held) prependTimer.current = setTimeout(() => {
          if (prepending.current === held) resetReading();
        }, PREPEND_RECOVERY_MS);
        setWebWindow({ scope: page.scope, first: page.rows[Math.max(0, page.first - TAIL_PAGE_SIZE)].key });
      } else if (!sheetOpened.current && webReady.current === page.scope && contentOffset.y < MARGIN && page.first === 0 && !needleNow.current) void askOlderNow.current();
    }
    const shown = showJump(next);
    setJump((now) => (now.shown === shown ? now : { shown, unseen: unseen(next, replies.current) }));
  }, []);
  // Lo que entró arriba no mueve la barra: sin este paso nadie vuelve a mirar si hace falta más.
  const continueUp = useCallback(() => {
    const node = scroller();
    if (!node || prepending.current || sheetOpened.current) return;
    const page = webSlice.current;
    if (webReady.current !== page.scope || node.scrollTop >= MARGIN) return;
    if (page.first > 0) {
      const held = anchorOf(node);
      prepending.current = held;
      if (held) prependTimer.current = setTimeout(() => {
        if (prepending.current === held) resetReading();
        climb.current();
      }, PREPEND_RECOVERY_MS);
      setWebWindow({ scope: page.scope, first: page.rows[Math.max(0, page.first - TAIL_PAGE_SIZE)].key });
    } else if (!needleNow.current) void askOlderNow.current();
  }, []);
  climb.current = continueUp;
  const onContentSize = useCallback(() => {
    const node = scroller();
    if (!node || webReady.current !== webSlice.current.scope) return;
    if (prepending.current || !follow.current.following) restoreReading(node);
    else toBottom(false);
    if (!prepending.current && !follow.current.following) continueUp();
  }, []);
  const newReplies = jump.shown ? unseen(follow.current, replies.current) : 0;
  const streaming = liveLines.some((line) => line.key === "live");
  const scope = useMemo(() => (host ? { host, hostId: params.host, workspace, folder, session: id } : null), [host, params.host, workspace, folder, id]);
  // Una respuesta rápida se manda como un mensaje, con el proveedor y el modelo con que sigue la tarea.
  // Estable entre lecturas (lee la vista y `submit` del último render), para que el memo de `MessageBody` se sostenga.
  // El modo con que sigue la tarea. Con `null` el motor correría el suyo por omisión, no el que guardó la tarea.
  const savedMode = view?.session.permission_mode ?? null;
  const workspaceMode = workspaces.find((w) => w.id === workspace)?.defaultPermissionMode ?? null;
  const latest = useRef({ view, submit, respond, pendingProvider });
  latest.current = { view, submit, respond, pendingProvider };
  const decide = useCallback((permission: Permission, allow: boolean) => latest.current.respond(permission, allow), []);
  const quickReply = useCallback((prompt: string) => {
    const { view: now, submit: send, pendingProvider: pending } = latest.current;
    if (!now) return Promise.resolve(false);
    const defaults = taskDefaults(now);
    const handoverProvider = pending && pending !== defaults.provider ? pending : null;
    return send({
      shell: false,
      prompt,
      provider: handoverProvider ?? defaults.provider,
      model: handoverProvider ? null : defaults.model,
      effort: null,
      permissionMode: now.session.permission_mode ?? null,
      attachments: [],
    });
  }, []);

  const folderRow = snapshot?.folders.find((f) => f.host === params.host && f.id === folder) ?? null;
  const gitBook = useTaskGit(hostOf, [{ host: params.host, workspace, folder, id }]);
  const git = effectiveGit(gitBook, { id, host: params.host, workspace, folder }, snapshot?.tasks ?? []);
  const visible = useMemo(() => needle ? lines.filter((line) => lineMatches(line, needle)) : lines, [lines, needle]);
  const first = webWindow.scope === webScope ? visible.findIndex((line) => line.key === webWindow.first) : -1;
  const webStart = first < 0 ? Math.max(0, visible.length - TAIL_PAGE_SIZE) : first;
  const listed = useMemo(() => Platform.OS === "web" ? visible.slice(webStart) : [...visible].reverse(), [visible, webStart]);
  webSlice.current = { first: webStart, rows: visible, scope: webScope };
  needleNow.current = needle;
  useLayoutEffect(() => {
    if (readingScope.current !== webScope) {
      resetReading();
      webReady.current = null;
      readingScope.current = webScope;
    }
    const node = scroller();
    if (!node || !view) return;
    if (webReady.current !== webScope) {
      // Las últimas 20 filas están medidas antes de mostrarse: no hay recorrido ni DOM invertido.
      follow.current = OPENED;
      toBottom(false);
      webReady.current = webScope;
      setWebWindow({ scope: webScope, first: visible[webStart]?.key ?? null });
      setPaintedScope(webScope);
    } else if (prepending.current) restoreReading(node);
  }, [webScope, Boolean(view), webStart, visible.length]);
  useLayoutEffect(() => {
    const node = scroller();
    if (!node) return;
    // La virtualización puede remontar filas entre medidas; corregir en la mutación evita pintar ese salto.
    const observer = new MutationObserver(() => {
      if (prepending.current || !follow.current.following) restoreReading(node);
    });
    observer.observe(node, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style"] });
    const intent = ["wheel", "touchstart", "touchmove", "pointerdown"] as const;
    // En el borde de arriba un gesto no produce `scroll`: es el único aviso de que se quiere seguir.
    const interruptPrepend = () => {
      if (prepending.current) resetReading();
      climb.current();
    };
    for (const event of intent) node.addEventListener(event, interruptPrepend, { passive: true });
    return () => {
      observer.disconnect();
      for (const event of intent) node.removeEventListener(event, interruptPrepend);
      resetReading();
    };
  }, [webScope]);

  const olderRow = older === "idle" ? null : (
    <View style={styles.olderRow} accessibilityRole={older === "failed" ? "alert" : undefined} testID="older-state">
      <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>
        {older === "loading" ? t("task.history.older_loading") : host?.power() === "on" ? t("task.history.older_failed") : t("task.history.older_offline")}
      </Text>
      {older === "failed" ? (
        <Pressable onPress={() => void askOlder(true)} accessibilityRole="button" testID="older-retry">
          <Text style={{ color: theme.primary, fontSize: TEXT.ui }}>{t("task.history.retry")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
  const lastRun = thread.runs.at(-1);
  const since = running ? runClock(view?.liveSince ?? null, lastRun?.at ?? null) : null;
  const asleepNote = asleep && host ? (host.canAct() === "outdated" ? w("web.machines.outdated_action", { name: host.label }) : w("web.machines.off_action", { name: host.label })) : null;
  const wakingNote = waking && host ? w("shell.machines.waking", { name: host.label }) : null;
  const owner = useRef({}).current;
  useEffect(() => {
    publishWork(key, owner, { runs: thread.runs, since, permissions, deciding, asleep: asleepNote, waking: wakingNote, note, questions: questions.length, decide });
  }, [key, owner, thread.runs, since, permissions, deciding, asleepNote, wakingNote, note, questions.length, decide]);
  useEffect(() => () => releaseWork(key, owner), [key, owner]);

  const openWork = useCallback(
    (line: WorkLine, at: number, find: string | null) => {
      // Dos toques durante la transición serían hoja sobre hoja.
      if (sheetOpened.current) return;
      sheetOpened.current = true;
      router.push({ pathname: "/task-work", params: { host: params.host, workspace, folder: params.folder, id, run: line.run, at: String(at), ...(find ? { find } : {}) } });
    },
    [params.host, workspace, params.folder, id],
  );
  const waiting = permissions.length > 0;
  const cached = cachedNote ? <Text style={[styles.banner, { color: theme.textMuted, backgroundColor: theme.muted }]}>{cachedNote}</Text> : undefined;
  const liveFooter = (
          <View style={styles.footer}>
            {liveLines.map((line) => (
              <Row key={line.key} line={line} theme={theme} needle={needle} paused={waiting} onOpen={openWork} streaming={line.key === "live"} />
            ))}
            {running && !streaming ? <TurnStatus run={lastRun} since={since} waiting={waiting} /> : null}
            {pending && waking ? <Bubble line={{ key: "pending", kind: "message", role: "user", text: pending, images: [], attachments: [] }} theme={theme} /> : null}
            {wakingNote ? <Text style={{ color: theme.textMuted }}>{wakingNote}</Text> : null}
            {asleepNote ? <Text style={{ color: theme.textMuted }}>{asleepNote}</Text> : null}
            {note ? <Text style={{ color: theme.textMuted }}>{note}</Text> : null}
          </View>
  );

  return (
    <KeyboardScreen>
      <ChatScopeContext.Provider value={scope}>
      <Stack.Screen options={{ title: titleOf(key) ?? title, headerShown: false }} />
      <ChatBackdrop background={background} theme={theme} />
      <TaskHeader
        key={`${params.host}/${workspace}/${id}`}
        title={titleOf(key) || title || id}
        hostId={params.host}
        host={host}
        hostOf={hostOf}
        workspace={workspace}
        folder={folder}
        id={id}
        task={taskRow ?? undefined}
        tasks={machineTasks}
        running={running || waking}
        onChanged={() => { void reload(); }}
        onFinished={() => { void reload(); router.replace("/"); }}
      />
      <TaskTools
        host={host}
        workspace={workspace}
        machine={host?.label ?? params.host}
        folder={folderRow}
        branch={git?.branch ?? null}
        provider={view?.session.provider ?? null}
        subtasks={delegated.length}
        finding={finding}
        onFind={setFinding}
        onTools={() => router.push({ pathname: "/task-tools", params: { host: params.host, workspace, folder: params.folder, id } })}
        onFiles={() => router.push({ pathname: "/task-files", params: { host: params.host, workspace, folder: params.folder, id } })}
      />
      <View style={styles.thread}>
      <FlatList
        ref={list}
        inverted={Platform.OS !== "web"}
        style={Platform.OS === "web" && paintedScope !== webScope ? { opacity: 0 } : undefined}
        data={listed}
        initialNumToRender={TAIL_PAGE_SIZE}
        keyExtractor={(line) => line.key}
        contentContainerStyle={styles.list}
        onContentSizeChange={onContentSize}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Lo que cambia de alto por encima de lo que se lee (una imagen que carga, pasos que se abren) no lo mueve.
        maintainVisibleContentPosition={Platform.OS === "web" ? { minIndexForVisible: 0 } : { minIndexForVisible: 0, autoscrollToTopThreshold: MARGIN }}
        renderItem={({ item }) => {
          const row = <Row line={item} theme={theme} needle={needle} paused={waiting} onOpen={openWork} onQuickReply={item.key === lastAgent && !running && !asleep ? quickReply : undefined} />;
          return Platform.OS === "web" ? <View nativeID={`chat-row:${encodeURIComponent(webScope)}:${item.key}`}>{row}</View> : row;
        }}
        onEndReached={Platform.OS === "web" || needle ? undefined : () => void askOlder()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={Platform.OS === "web" ? liveFooter : <>{cached}{olderRow}</>}
        ListHeaderComponent={Platform.OS === "web" ? <>{cached}{olderRow}</> : liveFooter}
      />
      {jump.shown || recentGap ? (
        <Pressable
          onPress={toEnd}
          accessibilityRole="button"
          testID="to-bottom"
          style={[styles.toBottom, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text style={{ color: theme.text, fontSize: TEXT.ui, fontWeight: "500" }}>
            {recentGap ? t("task.history.latest") : newReplies > 0 ? w("chat.thread.new_messages", { count: newReplies }) : w("chat.thread.to_bottom")}
          </Text>
          <Icon name="arrow-down" size={14} color={theme.text} />
        </Pressable>
      ) : null}
      </View>
      {permissions.length || questions.length ? (
        <ScrollView style={styles.pending} contentContainerStyle={styles.footer}>
          {permissions.map((p) => (
            <PermissionCard key={p.request_id} permission={p} disabled={asleep} busy={deciding.has(p.request_id)} onDecide={(allow) => decide(p, allow)} />
          ))}
          {questions.map((q) => (
            <QuestionCard key={q.turn} pending={q} theme={theme} disabled={asleep} onAnswer={(c, f) => answer(q, c, f)} />
          ))}
        </ScrollView>
      ) : null}
      <Composer
        host={host}
        workspace={workspace}
        folder={folder}
        session={id}
        providers={snapshot?.providers[params.host] ?? []}
        provider={view?.session.provider ?? null}
        model={view ? taskDefaults(view).model : null}
        permissionMode={workspaceMode}
        savedPermissionMode={savedMode}
        providerLocked={!canHandoff}
        providerLockedReason={handoverReason}
        canHandoff={canHandoff}
        pendingProvider={pendingProvider}
        onPendingProvider={setPendingProvider}
        running={running}
        disabled={asleep || waking || !view}
        placeholder={w("chat.composer.placeholder.next")}
        onSubmit={submit}
        onInject={inject}
        onStop={stop}
        onModeChange={changeMode}
      />
      </ChatScopeContext.Provider>
    </KeyboardScreen>
  );
}

type Backdrop = ChatBackdropView & { token: string | null };

/** La imagen del workspace con su velo; un patrón del escritorio queda en el fondo liso del tema. */
function ChatBackdrop({ background, theme }: { background: Backdrop | null; theme: Theme }) {
  const source =
    background?.remote && background.token
      ? { uri: background.remote, headers: { Authorization: `Bearer ${background.token}` } }
      : background?.image
        ? { uri: background.image }
        : null;
  if (!background || !source) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface, opacity: background.veil.chat ?? DEFAULT_CHAT_VEIL }]} />
    </View>
  );
}

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

/** Una línea solo se repinta si cambia: `linesOf` le deja el mismo objeto a la que no cambió. */
const Row = memo(function Row({ line, theme, needle, paused, onOpen, streaming, onQuickReply }: { line: ChatLine; theme: Theme; needle: string; paused: boolean; onOpen: (line: WorkLine, at: number, find: string | null) => void; streaming?: boolean; onQuickReply?: (prompt: string) => Promise<boolean> }) {
  if (line.kind === "work") return <WorkGroup line={line} needle={needle} paused={paused} onOpen={onOpen} />;
  if (line.kind === "progress")
    return (
      <View style={styles.progress}>
        <Text selectable style={{ color: theme.textMuted, fontSize: TEXT.body, lineHeight: 20 }}>
          {line.text}
        </Text>
      </View>
    );
  if (line.kind === "shell") return <ShellRun command={line.command} output={line.output} exitCode={line.exitCode} theme={theme} />;
  if (line.kind === "message" && line.role === "system" && line.meta === "provider_handover") return <HandoverRow line={line} theme={theme} />;
  if (line.kind === "message" && line.role === "system" && (line.meta === "fallo" || line.meta === "cupo" || line.fallo)) return <FailureNotice line={line} theme={theme} />;
  return <Bubble line={line} theme={theme} streaming={streaming} onQuickReply={onQuickReply} />;
});

function say(key: string, vars?: Record<string, string | number>) {
  return t(key as Parameters<typeof t>[0], vars);
}

/** El aviso `system` con `meta: "provider_handover"` del motor: un separador, no un globo. */
function HandoverRow({ line, theme }: { line: Extract<Line, { kind: "message" }>; theme: Theme }) {
  return (
    <View accessibilityRole="text" style={styles.notice} testID="provider-handover">
      <View style={[styles.noticeRule, { backgroundColor: theme.border }]} />
      <Text selectable style={{ color: theme.textMuted, fontSize: TEXT.label, lineHeight: 17, flexShrink: 1, textAlign: "center" }}>
        {line.text}
      </Text>
      <View style={[styles.noticeRest, { backgroundColor: theme.border }]} />
    </View>
  );
}

/** La fila del fallo, como en la ventana: la frase de la clase y, si sirve, cambiar de cuenta. */
function FailureNotice({ line, theme }: { line: Extract<Line, { kind: "message" }>; theme: Theme }) {
  const sentence = failureSentence(line, say) ?? line.text;
  if (!sentence) return null;
  const gesture = line.meta === "fallo" ? failureGesture(line.fallo?.clase) : null;
  const interrupted = line.meta === "fallo" && isInterruption(line.text);
  const color = interrupted || line.meta !== "fallo" ? (line.quota?.to ? theme.info : theme.textMuted) : theme.warningStrong;
  return (
    <View accessibilityRole={line.meta === "fallo" && !interrupted ? "alert" : "text"} style={styles.notice}>
      <View style={[styles.noticeRule, { backgroundColor: theme.border }]} />
      <Text style={{ color, fontSize: TEXT.ui, lineHeight: 18, flexShrink: 1 }}>
        {sentence}
        {gesture ? (
          <Text accessibilityRole="link" onPress={() => router.push("/accounts")} style={{ textDecorationLine: "underline" }}>
            {` — ${say(gesture.key)}`}
          </Text>
        ) : null}
      </Text>
      <View style={[styles.noticeRest, { backgroundColor: theme.border }]} />
    </View>
  );
}

function Bubble({ line, theme, streaming, onQuickReply }: { line: Extract<Line, { kind: "message" }>; theme: Theme; streaming?: boolean; onQuickReply?: (prompt: string) => Promise<boolean> }) {
  const from = line.from ?? null;
  const mine = line.role === "user" && !from;
  const system = line.role === "system";
  const shell = line.role === "shell";
  if (!line.text && !line.images.length && !line.attachments.length && !line.refs?.length) return null;
  // Como en la ventana: lo de la persona va en globo; la respuesta del agente, sin globo y a todo el ancho.
  const agent = line.role !== "user" && !system && !shell;
  const bubble = (
    <View
      style={
        agent
          ? styles.reply
          : [
              styles.bubble,
              from
                ? [styles.incoming, { backgroundColor: theme.incomingBubble }]
                : mine
                  ? { alignSelf: "flex-end", backgroundColor: theme.userBubble, borderColor: theme.border }
                  : { alignSelf: "stretch", backgroundColor: theme.surface, borderColor: theme.border },
              system ? { backgroundColor: theme.muted } : null,
            ]
      }
    >
      {line.attachments.length ? <Attachments paths={line.attachments} /> : null}
      {/* Lo que escribe la persona y la salida de un `!` van tal cual; lo del agente, con su markdown. */}
      {line.text && (line.role === "user" || system || shell) ? (
        <Text selectable style={{ color: system ? theme.textMuted : theme.text, fontSize: shell ? 13 : 15, lineHeight: 21, fontFamily: shell ? MONO : undefined }}>
          {line.text}
        </Text>
      ) : line.text || line.images.length ? (
        <MessageBody text={line.text} streaming={streaming} images={line.images} onQuickReply={onQuickReply} />
      ) : null}
      {line.refs?.map((reference) => <HistoryDetail key={`${reference.turn}${reference.pointer}`} reference={reference} turnId={line.turnId} />)}
    </View>
  );
  if (!from) return bubble;
  // El input de un encargado u otra tarea va a la izquierda, con su cara y su firma encima del globo.
  const signature = [from.agent, from.task].filter(Boolean).join(" · ");
  return (
    <View style={styles.incomingRow} testID="incoming-message">
      <View style={styles.incomingFace}>
        {from.agent ? (
          <AgentAvatar name={from.agent} size={28} />
        ) : (
          <View style={[styles.taskFace, { backgroundColor: theme.muted, borderColor: theme.border }]}>
            <BrandMark id={from.provider} size={16} color={theme.text} />
          </View>
        )}
      </View>
      <View style={styles.incomingColumn}>
        <Text numberOfLines={1} style={[styles.signature, { color: theme.textMuted }]}>
          {signature}
        </Text>
        {bubble}
      </View>
    </View>
  );
}

/** Un `!` de la persona: el comando y lo que imprimió, como en la ventana. */
function ShellRun({ command, output, exitCode, theme }: { command: string; output: string; exitCode: number | null; theme: Theme }) {
  const failed = exitCode !== null && exitCode !== 0;
  return (
    <View style={[styles.bubble, { alignSelf: "stretch", backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text selectable style={{ color: theme.text, fontFamily: MONO, fontSize: TEXT.ui }}>
        {`$ ${command}`}
      </Text>
      {output ? (
        <ScrollView horizontal style={{ marginTop: 6 }}>
          <Text selectable style={{ color: failed ? theme.error : theme.textMuted, fontFamily: MONO, fontSize: TEXT.label, lineHeight: 17 }}>
            {output.trimEnd()}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

function QuestionCard({
  pending,
  theme,
  disabled,
  onAnswer,
}: {
  pending: PendingQuestion;
  theme: Theme;
  disabled: boolean;
  onAnswer: (chosen: Record<string, string[]>, free: Record<string, string>) => void;
}) {
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [free, setFree] = useState<Record<string, string>>({});
  const toggle = (q: Question, value: string) =>
    setChosen((old) => {
      const current = old[q.id] ?? [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : q.multiple ? [...current, value] : [value];
      return { ...old, [q.id]: next };
    });
  return (
    <View style={[styles.card, { borderColor: theme.info, backgroundColor: theme.surface }]} testID="question">
      <Text style={{ color: theme.textMuted, fontSize: TEXT.label }}>{t("task.question")}</Text>
      {pending.questions.map((q) => (
        <View key={q.id} style={{ gap: 6 }}>
          <Text style={{ color: theme.text, fontWeight: "600" }}>{q.question}</Text>
          {q.options.map((o) => {
            const on = chosen[q.id]?.includes(o.value);
            return (
              <Pressable
                key={o.value}
                onPress={() => toggle(q, o.value)}
                style={[styles.option, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.userBubble : theme.surface }]}
              >
                <Text style={{ color: theme.text }}>{o.label}</Text>
                {o.detail ? <Text style={{ color: theme.textMuted, fontSize: TEXT.label }}>{o.detail}</Text> : null}
              </Pressable>
            );
          })}
          {q.free_text ? (
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.muted }]}
              placeholder={t("task.free_text")}
              placeholderTextColor={theme.textMuted}
              value={free[q.id] ?? ""}
              onChangeText={(text) => setFree((old) => ({ ...old, [q.id]: text }))}
            />
          ) : null}
        </View>
      ))}
      <View style={{ alignSelf: "flex-end" }}>
        <SendButton testID="answer-question" disabled={disabled} label={t("task.answer")} onPress={() => onAnswer(chosen, free)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { padding: 8, borderRadius: RADIUS.lg, fontSize: TEXT.ui },
  thread: { flex: 1 },
  delegated: { marginHorizontal: 12, marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  delegatedRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 },
  // `flex-end` en una lista invertida es arriba: un hilo corto sigue empezando arriba.
  list: { flexGrow: 1, justifyContent: "flex-end", padding: 12, gap: 8 },
  // Como el del escritorio: una píldora centrada por encima del borde de abajo del hilo.
  toBottom: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  footer: { gap: 8 },
  olderRow: { alignItems: "center", gap: 4, paddingVertical: 6 },
  pending: { flexGrow: 0, maxHeight: "55%", paddingHorizontal: 12, paddingBottom: 8 },
  bubble: { maxWidth: "92%", borderRadius: 14, padding: 10, borderWidth: StyleSheet.hairlineWidth },
  incoming: { alignSelf: "flex-start", maxWidth: "100%", borderColor: "transparent", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  incomingRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "88%", alignSelf: "flex-start" },
  incomingFace: { paddingBottom: 2 },
  incomingColumn: { flexShrink: 1, gap: 3 },
  taskFace: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  signature: { fontSize: TEXT.label, fontWeight: "600", paddingLeft: 2 },
  reply: { alignSelf: "stretch", paddingHorizontal: 4, paddingVertical: 2 },
  progress: { alignSelf: "stretch", paddingHorizontal: 4 },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  noticeRule: { width: 24, height: StyleSheet.hairlineWidth },
  noticeRest: { flex: 1, height: StyleSheet.hairlineWidth },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  option: { borderWidth: 1, borderRadius: 10, padding: 10 },
  input: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: TEXT.lead, maxHeight: 140 },
});
