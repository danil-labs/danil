import { RADIUS, TEXT } from "@terminus/design";
import { SendButton } from "./SendButton";
import {
  ATTACHMENT_DOCUMENTS_FEATURE,
  type Frase,
  isImageMime,
  mimeOfAttachment,
  type MentionList,
  type PermissionModeOption,
  type ProviderInfo,
  type ProviderModels,
  type SlashMenu,
} from "@terminus/protocol";
import { menuSurfaces, modelName, previewLabel, type Surface, surfaceHas, surfaceOf } from "@terminus/tasks";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useRef, useState, type ComponentRef, type MutableRefObject, type ReactNode } from "react";
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputKeyPressEvent, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ATTACHMENT_MIMES,
  type Draft,
  IMAGE_MIMES,
  MAX_ATTACHMENT_BYTES,
  mentionsOf,
  modelsOf,
  permissionModesOf,
  slashMenuOf,
  surfacesOf,
  uploadAttachment,
  usableProviders,
} from "../lib/engine";
import type { Host } from "../lib/hosts";
import { effectiveMode, enterAction, hasSomethingToSend } from "../lib/composer";
import { promote, type Queued, queueMemory } from "../lib/steer";
import { lang, phrase, t, w } from "../lib/i18n";
import { BrandMark } from "./BrandMark";
import { Icon } from "./Icon";
import { matches, NoMatch } from "./Search";
import { Sheet, SheetOption, SheetSection } from "./Sheet";
import { useTheme } from "./theme";

/** Lo que el cuadro manda: un mensaje con sus ajustes, o un comando de terminal (`!`). */
export type Submission = (Draft & { shell: false }) | { shell: true; command: string; provider: string; model: string | null; effort: string | null; permissionMode: string | null };

type Attachment = { key: string; name: string; path: string | null; error: string | null };
/** Lo que el cuadro tiene elegido ahora: «Reintentar» reenvía con el modelo del chip. */
export type ComposerChoice = { provider: string; model: string | null; effort: string | null; permissionMode: string | null };
type Choice = ComposerChoice;

const SLASH = /^\/([\w:-]*)$/;
const MENTION = /(?:^|\s)@("?)([^\s"]*)$/;
const EFFORT_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
// Los modos de cada máquina y proveedor que ya se vieron: con la máquina apagada, el cuadro sigue sabiendo cuáles sostiene.
const knownModes = new Map<string, PermissionModeOption[]>();

/** El nombre de una superficie como en la ventana (`AIProviders.tsx`): «Zen y Go», «Modelos gratuitos», «Locales». */
function surfaceLabel(s: Surface) {
  if (s.provider === "opencode-zen" && s.catalogo === "de_pago") return w("settings.ai_providers.zen_go");
  if (s.catalogo === "gratuitos") return w("surfaces.label.free");
  if (s.provider === "opencode-local") return w("surfaces.label.local");
  return s.label;
}

/** Por qué no se puede usar: la frase del motor si el catálogo la conoce; si no, la de los gratuitos o su marca. */
function whyNot(s: Surface<Frase>) {
  const said = s.porque ? phrase(s.porque) : "";
  const known = said && !(typeof s.porque === "object" && s.porque && said === s.porque.clave);
  if (known) return said;
  return s.catalogo === "gratuitos" ? w("surfaces.free_off") : s.marca;
}

function effortLabel(effort: string | null) {
  if (!effort) return w("chat.effort.agent_decides");
  return (EFFORT_LEVELS as readonly string[]).includes(effort) ? w(`chat.effort.level.${effort as (typeof EFFORT_LEVELS)[number]}`) : effort;
}

/**
 * El cuadro de escribir del escritorio (`Chat.tsx`), adaptado al teléfono:
 * una sola fila con adjuntar, el texto (crece hasta seis líneas), el logotipo
 * del proveedor y el botón de enviar, que con un turno corriendo es detener. El
 * logotipo abre la hoja de proveedor, modelo, razonamiento y permisos. `/` abre los comandos y las
 * skills del agente; `@`, los archivos y carpetas; `!` lo vuelve terminal
 * («Ejecutar»). Escribir mientras trabaja deja el mensaje en cola, con
 * «Mandar ahora». Los selectores son hojas desde abajo. La tecla de retorno
 * manda; en la web, Shift+Enter hace salto de línea, como en el escritorio.
 */
export function Composer({
  host,
  workspace,
  folder,
  session,
  providers,
  provider: initialProvider,
  model: initialModel,
  permissionMode = null,
  savedPermissionMode = null,
  providerLocked = false,
  providerLockedReason = null,
  canHandoff = false,
  pendingProvider = null,
  onPendingProvider,
  running = false,
  disabled = false,
  placeholder,
  header,
  onSubmit,
  onInject,
  onStop,
  onModeChange,
  queueKey = null,
  steerRefused = false,
  onStopAndSend,
  choice,
  onAccounts,
  bottomInset = true,
  testID = "composer",
}: {
  host: Host | undefined;
  /** El id del workspace en esa máquina. */
  workspace: string | null;
  /** La carpeta (`project`) en esa máquina; `""` es sin carpeta, `null` aún sin elegir. */
  folder: string | null;
  session: string | null;
  providers: ProviderInfo[];
  provider: string | null;
  model: string | null;
  /** El modo de permisos del workspace para las tareas nuevas. Si el proveedor no lo sostiene, el suyo por omisión. */
  permissionMode?: string | null;
  /** El modo que guarda la tarea abierta: manda sobre el del workspace, como al reanudar en la ventana. */
  savedPermissionMode?: string | null;
  /** El proveedor no se puede cambiar ahora; `providerLockedReason` dice por qué. */
  providerLocked?: boolean;
  /** El motivo ya escrito: `hand_over_blocked`, el turno vivo o la máquina. */
  providerLockedReason?: string | null;
  /** La tarea abierta puede cambiar de CLI (`provider_handoff_v1`), con confirmación. */
  canHandoff?: boolean;
  /** El CLI que se aplicará al enviar, si la persona ya lo confirmó. */
  pendingProvider?: string | null;
  onPendingProvider?: (provider: string | null) => void;
  running?: boolean;
  disabled?: boolean;
  placeholder: string;
  /** Los selectores de una tarea nueva: máquina, carpeta, rama, agente. */
  header?: ReactNode;
  onSubmit: (submission: Submission) => Promise<boolean>;
  onInject?: (text: string, attachments: string[]) => Promise<boolean>;
  onStop?: () => void;
  /** Elegir modo con el turno en marcha: el turno vivo arrancó con el de entonces y no lo relee. */
  onModeChange?: (mode: string) => void;
  /** La cola de esta tarea en memoria (`queueMemory`): salir de la pantalla y volver la encuentra igual. */
  queueKey?: string | null;
  /** El agente de la tarea ya negó «Mandar ahora» en esta máquina: no se ofrece otra vez. */
  steerRefused?: boolean;
  /** «Detener y enviar»: detiene el turno; el mensaje elegido sale primero al cerrar. */
  onStopAndSend?: () => void;
  /** Recibe lo elegido en el chip con cada cambio. */
  choice?: MutableRefObject<Choice | null>;
  /** Abre Proveedores de IA, donde se activan los modelos gratuitos. */
  onAccounts?: () => void;
  /** Bajo una barra de pestañas, la barra ya deja el hueco del sistema. */
  bottomInset?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  // La selección solo se impone al insertar una mención: controlada siempre, en Android el cursor salta.
  const [forced, setForced] = useState<{ start: number; end: number } | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [provider, setProvider] = useState<string | null>(initialProvider);
  const [model, setModel] = useState<string | null>(initialModel);
  const [effort, setEffort] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [models, setModels] = useState<ProviderModels | null>(null);
  const [modes, setModes] = useState<PermissionModeOption[]>([]);
  const [slash, setSlash] = useState<SlashMenu | null>(null);
  const [mentions, setMentions] = useState<MentionList | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [queue, setQueue] = useState<readonly Queued[]>(() => queueMemory.get(queueKey));
  // La cola vive en memoria por tarea: el cuadro se desmonta al salir y la vuelve a tomar al entrar.
  useEffect(() => queueMemory.set(queueKey, queue), [queueKey, queue]);
  const [surfaces, setSurfaces] = useState<Surface<Frase>[]>([]);
  const [surface, setSurface] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"model" | "attach" | "handover" | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // El CLI elegido que espera la confirmación del traspaso.
  const [candidate, setCandidate] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const draining = useRef(false);
  const claimedQueue = useRef(new Set<string>());
  const [injecting, setInjecting] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const ids = new Set(queue.map((item) => item.id));
    for (const id of claimedQueue.current) if (!ids.has(id)) claimedQueue.current.delete(id);
  }, [queue]);
  // Dos retornos seguidos llegan antes de que el cuadro se vacíe: el segundo no manda ni encola el mismo texto.
  const sending = useRef(false);
  const taken = useRef<string | null>(null);
  useEffect(() => {
    if (text !== taken.current) taken.current = null;
  }, [text]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboard(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Lo que llega de afuera (otra tarea, otra máquina, los valores por omisión) manda hasta que la persona elige.
  useEffect(() => setProvider(initialProvider), [initialProvider]);
  useEffect(() => setModel(initialModel), [initialModel]);

  const usable = usableProviders(providers);
  const current = provider ?? usable[0]?.id ?? null;
  // Cambiar de CLI es de una tarea abierta; en una nueva se elige sin confirmar.
  const locked = providerLocked || (Boolean(session) && !canHandoff);
  const providerLabel = (id: string | null) => (id ? providers.find((p) => p.id === id)?.label ?? id : "");
  const pendingLabel = pendingProvider ? providerLabel(pendingProvider) : null;
  const candidateLabel = candidate ? providerLabel(candidate) : null;

  // Modelos y permisos del proveedor elegido; la barra de `/` se pide al usarla.
  useEffect(() => {
    const key = `${host?.id}/${current}`;
    setModels(null);
    setModes(knownModes.get(key) ?? []);
    setSlash(null);
    if (!host || !workspace || !current || host.power() !== "on") return;
    let alive = true;
    void modelsOf(host, workspace, current).then((m) => alive && setModels(m));
    void permissionModesOf(host, workspace, current).then((m) => {
      if (m.length) knownModes.set(key, m);
      if (alive) setModes(m.length ? m : (knownModes.get(key) ?? []));
    });
    return () => {
      alive = false;
    };
  }, [host, workspace, current, host?.power()]);
  useEffect(() => setMentions(null), [host, workspace, folder]);
  // Las superficies de la máquina: OpenCode parte su catálogo en «Zen y Go» y «Modelos gratuitos».
  useEffect(() => {
    if (!host || !workspace || host.power() !== "on") return;
    let alive = true;
    void surfacesOf(host, workspace).then((list) => alive && setSurfaces(list));
    return () => {
      alive = false;
    };
  }, [host, workspace, host?.power()]);
  // La superficie sigue al agente y al modelo, y no al revés (`surfaceOf`, la regla de la ventana).
  useEffect(() => {
    if (!current) return;
    const next = surfaceOf(surfaces, current, model ?? "", models?.models ?? [], surface);
    if (next !== surface) setSurface(next);
  }, [surfaces, current, model, models, surface]);

  const shell = text.startsWith("!");
  const slashQuery = !shell ? SLASH.exec(text)?.[1] : undefined;
  const beforeCursor = text.slice(0, selection.end);
  const mentionMatch = !shell && slashQuery === undefined ? MENTION.exec(beforeCursor) : null;
  const mentionQuery = mentionMatch?.[2];

  useEffect(() => {
    if (slashQuery === undefined || slash || !host || !workspace || !current) return;
    void slashMenuOf(host, workspace, current).then(setSlash);
  }, [slashQuery !== undefined, host, workspace, current]);
  useEffect(() => {
    if (mentionQuery === undefined || mentions || !host || !workspace || folder === null) return;
    void mentionsOf(host, workspace, folder, session).then(setMentions);
  }, [mentionQuery !== undefined, host, workspace, folder, session]);

  // Termina el turno: sale el primero de la cola, como la ventana.
  useEffect(() => {
    if (running || !queue.length || draining.current || claimedQueue.current.has(queue[0].id)) return;
    const [next] = queue;
    draining.current = true;
    claimedQueue.current.add(next.id);
    void submit(next.text, next.attachments).then((ok) => {
      if (ok) setQueue((old) => old.filter((item) => item.id !== next.id));
      else claimedQueue.current.delete(next.id);
    }).finally(() => { draining.current = false; });
  }, [running, queue, injecting]);

  // Solo parte el catálogo un agente con más de una superficie; los demás enseñan todo.
  const ownSurfaces = surfaces.filter((s) => s.provider === current);
  const activeSurface = ownSurfaces.length > 1 ? ownSurfaces.find((s) => s.id === surface) : undefined;
  const menu = menuSurfaces(surfaces, surface);
  const surfaceModels = models?.models.filter((m) => surfaceHas(activeSurface, m)) ?? [];
  const chosen = models?.models.find((m) => m.id === model) ?? null;
  const modelText = model ? modelName(model, models) : previewLabel(lang, "default_model");
  const efforts = chosen?.efforts ?? models?.models[0]?.efforts ?? [];
  // Lo que se ve es lo que se manda: el elegido, o el de la tarea o el workspace, o el del proveedor.
  const sentMode = effectiveMode(modes, mode, { saved: savedPermissionMode, workspace: permissionMode });
  const modeOption = modes.find((m) => m.id === sentMode) ?? null;
  const uploading = attachments.some((a) => !a.path && !a.error);
  const ready = Boolean(host && workspace !== null && folder !== null && current) && !disabled && !busy && !uploading;
  const hasText = Boolean(text.trim()) || attachments.some((a) => a.path);
  useEffect(() => {
    if (choice) choice.current = current ? { provider: current, model, effort, permissionMode: sentMode } : null;
  });

  /** Elegir una superficie: el agente que la sirve y un modelo de su mitad del catálogo. */
  function chooseSurface(s: Surface<Frase>) {
    if (!s.usable) {
      // Sin activar los gratuitos no hay catálogo: se activan en Proveedores de IA.
      setSheet(null);
      onAccounts?.();
      return;
    }
    if (s.provider !== current) {
      chooseProvider(s.provider);
      setSurface(s.id);
      return;
    }
    setSurface(s.id);
    if (chosen && !surfaceHas(s, chosen)) {
      const first = models?.models.find((m) => surfaceHas(s, m)) ?? null;
      setModel(first?.id ?? null);
      setEffort(null);
    }
  }

  async function submit(body: string, paths: string[]) {
    if (!current) return false;
    if (body.startsWith("!")) {
      return onSubmit({ shell: true, command: body.slice(1).trim(), provider: current, model, effort, permissionMode: sentMode });
    }
    return onSubmit({ shell: false, prompt: body, provider: current, model, effort, permissionMode: sentMode, attachments: paths });
  }

  async function injectQueued(item: Queued) {
    if (!onInject || claimedQueue.current.has(item.id)) return;
    // El ref cierra el paso antes del siguiente render, también entre toques rápidos.
    claimedQueue.current.add(item.id);
    setInjecting((old) => new Set(old).add(item.id));
    let ok = false;
    try {
      ok = await onInject(item.text, item.attachments);
      if (ok) setQueue((old) => old.filter((entry) => entry.id !== item.id));
    } finally {
      if (!ok) claimedQueue.current.delete(item.id);
      setInjecting((old) => new Set([...old].filter((id) => id !== item.id)));
    }
  }

  async function send() {
    const body = text.trim();
    const paths = attachments.flatMap((a) => (a.path ? [a.path] : []));
    if (!ready || sending.current || taken.current === text || !hasSomethingToSend(body, paths.length)) return;
    taken.current = text;
    if (running && !body.startsWith("!")) {
      setQueue((old) => [...old, { id: `${Date.now()}`, text: body, attachments: paths }]);
      setText("");
      setAttachments([]);
      return;
    }
    sending.current = true;
    setBusy(true);
    setNote(null);
    setText("");
    const kept = attachments;
    setAttachments([]);
    let ok = false;
    try {
      ok = await submit(body, paths);
    } finally {
      if (!ok) {
        taken.current = null;
        setText(body);
        setAttachments(kept);
      }
      sending.current = false;
      setBusy(false);
    }
  }

  function aceptaDocumentos() {
    if (!host) return false;
    const features = host.features?.();
    if (features?.length) return features.includes(ATTACHMENT_DOCUMENTS_FEATURE);
    return host.supports?.("guardar_adjunto") !== "no";
  }

  async function addFiles(files: { name: string; mime: string; size: number | null; read: () => Promise<string> }[]) {
    if (!host || !workspace || folder === null) return;
    for (const file of files) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      const mime = mimeOfAttachment(file.mime, file.name);
      if (!mime || (!aceptaDocumentos() && !isImageMime(mime))) {
        setNote(t("composer.unsupported_file"));
        continue;
      }
      if (file.size !== null && file.size > MAX_ATTACHMENT_BYTES) {
        setNote(t("composer.too_large", { name: file.name, size: (file.size / 1048576).toFixed(1) }));
        continue;
      }
      setAttachments((old) => [...old, { key, name: file.name, path: null, error: null }]);
      try {
        const base64 = await file.read();
        if (base64.length * 0.75 > MAX_ATTACHMENT_BYTES) throw new Error(t("composer.too_large", { name: file.name, size: ((base64.length * 0.75) / 1048576).toFixed(1) }));
        const path = await uploadAttachment(host, workspace, folder, { mime, base64, name: file.name });
        setAttachments((old) => old.map((a) => (a.key === key ? { ...a, path } : a)));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        setAttachments((old) => old.filter((a) => a.key !== key));
        setNote(t("composer.upload_failed", { name: file.name, detail }));
      }
    }
  }

  async function pickPhotos() {
    setSheet(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.85, allowsMultipleSelection: true, selectionLimit: 6 });
    if (result.canceled) return;
    // El selector devuelve la imagen en JPEG cuando pide base64.
    await addFiles(
      result.assets.map((asset, i) => ({
        name: asset.fileName ?? `foto-${i + 1}.jpg`,
        mime: "image/jpeg",
        size: asset.base64 ? asset.base64.length * 0.75 : null,
        read: async () => asset.base64 ?? (await new File(asset.uri).base64()),
      })),
    );
  }

  async function pickFiles() {
    setSheet(null);
    const result = await DocumentPicker.getDocumentAsync({ type: [...(aceptaDocumentos() ? ATTACHMENT_MIMES : IMAGE_MIMES)], multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    await addFiles(
      result.assets.map((asset) => ({
        name: asset.name,
        mime: asset.mimeType ?? "",
        size: asset.size ?? null,
        read: () => new File(asset.uri).base64(),
      })),
    );
  }

  function insertMention(path: string) {
    if (!mentionMatch) return;
    const token = /\s/.test(path) ? `@"${path}" ` : `@${path} `;
    const start = beforeCursor.length - mentionMatch[0].trimStart().length;
    const next = text.slice(0, start) + token + text.slice(selection.end);
    setText(next);
    setSelection({ start: start + token.length, end: start + token.length });
    setForced({ start: start + token.length, end: start + token.length });
  }

  const slashItems = useMemo(() => {
    if (slashQuery === undefined || !slash) return null;
    const q = slashQuery.toLowerCase();
    const match = (list: SlashMenu["commands"]) => list.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 30);
    return { commands: match(slash.commands), skills: match(slash.skills) };
  }, [slashQuery, slash]);
  const mentionItems = useMemo(() => {
    if (mentionQuery === undefined || !mentions) return null;
    const q = mentionQuery.toLowerCase();
    return mentions.fuentes.filter((f) => f.ruta.toLowerCase().includes(q)).slice(0, 40);
  }, [mentionQuery, mentions]);

  // En la web, react-native-web deja pasar el evento del navegador: Shift+Enter sigue su curso.
  function onWebKey(e: TextInputKeyPressEvent) {
    const key = e as unknown as { key: string; shiftKey?: boolean; nativeEvent: { isComposing?: boolean; keyCode?: number }; preventDefault: () => void };
    if (enterAction({ key: key.key, shiftKey: key.shiftKey, isComposing: key.nativeEvent.isComposing, keyCode: key.nativeEvent.keyCode }) !== "send") return;
    key.preventDefault();
    void send();
  }

  /** Elegir otro CLI en una tarea abierta pide confirmación: la conversación viaja como texto. */
  function chooseProvider(id: string) {
    if (id === current) return;
    if (session && !canHandoff) return;
    if (session && canHandoff && id !== initialProvider) {
      setCandidate(id);
      setSheet("handover");
      return;
    }
    setProvider(id);
    setModel(null);
    setEffort(null);
    if (session && id === initialProvider) onPendingProvider?.(null);
  }

  function confirmHandover() {
    // La tarea pudo cambiar debajo de la hoja: sin sesión o sin permiso, no se confirma.
    if (!candidate || !session || !canHandoff) {
      setCandidate(null);
      setSheet(null);
      return;
    }
    setProvider(candidate);
    setModel(null);
    setEffort(null);
    onPendingProvider?.(candidate);
    setCandidate(null);
    setSheet(null);
  }

  /** Deshacer el traspaso pendiente sin enviar: vuelve al CLI con que sigue la tarea. */
  function revertHandover() {
    setProvider(initialProvider);
    setModel(null);
    setEffort(null);
    onPendingProvider?.(null);
  }

  // En la web el cuadro es un <textarea>: no crece solo, así que se mide con cada cambio.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = input.current as unknown as HTMLTextAreaElement | null;
    if (!node?.style) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(Math.max(node.scrollHeight, INPUT_MIN), INPUT_MAX)}px`;
  }, [text, shell]);

  const showStop = running && Boolean(onStop);
  const sendLabel = shell ? w("chat.composer.run") : w("chat.composer.send");

  return (
    <View style={[styles.wrap, { paddingBottom: 8 + (bottomInset && !keyboard ? insets.bottom : 0) }]}>
      {slashQuery !== undefined ? (
        <Suggestions>
          {!slashItems ? <Text style={[styles.hint, { color: theme.textMuted }]}>{t("composer.loading")}</Text> : null}
          {slashItems && !slashItems.commands.length && !slashItems.skills.length ? <Text style={[styles.hint, { color: theme.textMuted }]}>{w("chat.commands.no_match")}</Text> : null}
          {slashItems?.commands.map((c) => (
            <SheetOption key={`c-${c.name}`} icon="slash" label={`/${c.name}`} detail={c.description} onPress={() => setText(`/${c.name} `)} />
          ))}
          {slashItems?.skills.length ? <SheetSection>{w("chat.commands.skills")}</SheetSection> : null}
          {slashItems?.skills.map((c) => (
            <SheetOption key={`s-${c.name}`} icon="sparkles" label={`/${c.name}`} detail={c.description} onPress={() => setText(`/${c.name} `)} />
          ))}
        </Suggestions>
      ) : null}
      {mentionQuery !== undefined ? (
        <Suggestions>
          {!mentionItems ? <Text style={[styles.hint, { color: theme.textMuted }]}>{t("composer.loading")}</Text> : null}
          {mentionItems && !mentionItems.length ? <Text style={[styles.hint, { color: theme.textMuted }]}>{w("chat.mentions.no_match")}</Text> : null}
          {mentionItems?.map((m) => (
            <SheetOption key={m.ruta} icon={m.tipo === "carpeta" ? "folder" : "file"} label={m.ruta.split("/").pop() || m.ruta} detail={m.ruta} onPress={() => insertMention(m.ruta)} />
          ))}
        </Suggestions>
      ) : null}

      {queue.length ? (
        <View style={styles.queue}>
          {queue.map((q, i) => (
            <View key={q.id} style={[styles.queued, { borderColor: theme.border, backgroundColor: theme.surface }]} testID={`queued-${i}`}>
              <Text style={[styles.queueLabel, { color: theme.textMuted }]}>{w("chat.queue.label")}</Text>
              <Text numberOfLines={2} style={{ flex: 1, color: theme.text, fontSize: TEXT.body }}>
                {q.text}
              </Text>
              {onInject && !steerRefused ? (
                <Pressable
                  hitSlop={6}
                  disabled={injecting.has(q.id)}
                  accessibilityState={{ disabled: injecting.has(q.id), busy: injecting.has(q.id) }}
                  style={{ opacity: injecting.has(q.id) ? 0.5 : 1 }}
                  onPress={() => void injectQueued(q)}
                >
                  <Text style={{ color: theme.primary, fontWeight: "600", fontSize: TEXT.ui }}>{w("chat.queue.send_now")}</Text>
                </Pressable>
              ) : null}
              {steerRefused && running && onStopAndSend ? (
                <Pressable
                  hitSlop={6}
                  testID={`stop-and-send-${i}`}
                  accessibilityRole="button"
                  onPress={() => {
                    setQueue((old) => promote(old, q.id));
                    onStopAndSend();
                  }}
                >
                  <Text style={{ color: theme.primary, fontWeight: "600", fontSize: TEXT.ui }}>{w("chat.queue.stop_and_send")}</Text>
                </Pressable>
              ) : null}
              <Pressable hitSlop={6} accessibilityLabel={w("chat.queue.remove")} onPress={() => setQueue((old) => old.filter((x) => x.id !== q.id))}>
                <Icon name="x" size={15} color={theme.textMuted} />
              </Pressable>
            </View>
          ))}
          <Text style={[styles.hint, { color: theme.textMuted, paddingHorizontal: 4 }]}>{t("composer.queued")}</Text>
        </View>
      ) : null}

      {header}

      {pendingLabel ? (
        <View testID="handover-pending" style={[styles.pending, { borderColor: theme.border, backgroundColor: theme.muted }]}>
          <Text numberOfLines={2} style={{ flex: 1, color: theme.textMuted, fontSize: TEXT.label }}>
            {t("composer.handover_pending", { provider: pendingLabel })}
          </Text>
          <Pressable hitSlop={8} accessibilityRole="button" onPress={revertHandover}>
            <Text style={{ color: theme.primary, fontWeight: "600", fontSize: TEXT.label }}>{t("task.actions.cancel")}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.box, { backgroundColor: theme.surface }]}>
        {attachments.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.files}>
            {attachments.map((a) => (
              <View key={a.key} style={[styles.file, { backgroundColor: theme.muted }]}>
                <Icon name="image" size={13} color={theme.textMuted} />
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: TEXT.label, maxWidth: 140 }}>
                  {a.path ? a.name : t("composer.uploading", { name: a.name })}
                </Text>
                <Pressable hitSlop={8} accessibilityLabel={w("chat.attachments.remove", { name: a.name })} onPress={() => setAttachments((old) => old.filter((x) => x.key !== a.key))}>
                  <Icon name="x" size={13} color={theme.textMuted} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.row}>
          {shell ? (
            <View style={[styles.pill, styles.shellPill, { backgroundColor: theme.text }]}>
              <Icon name="terminal" size={13} color={theme.bg} />
              <Text style={{ color: theme.bg, fontSize: TEXT.label, fontWeight: "600" }}>{w("chat.composer.terminal")}</Text>
            </View>
          ) : (
            <Pressable
              testID="attach"
              hitSlop={6}
              disabled={!ready}
              accessibilityLabel={w("chat.attachments.add")}
              onPress={() => setSheet("attach")}
              style={[styles.round, { opacity: ready ? 1 : 0.4 }]}
            >
              <Icon name="paperclip" size={20} color={theme.textMuted} />
            </Pressable>
          )}
          <TextInput
            ref={input}
            testID={testID}
            style={[styles.input, { color: theme.text, fontFamily: shell ? Platform.select({ ios: "Menlo", default: "monospace" }) : undefined }]}
            value={text}
            onChangeText={setText}
            selection={forced ?? undefined}
            onSelectionChange={(e) => {
              setSelection(e.nativeEvent.selection);
              if (forced) setForced(null);
            }}
            placeholder={placeholder}
            placeholderTextColor={theme.textMuted}
            underlineColorAndroid="transparent"
            multiline
            // Sin esto, react-native-web pinta un <textarea> de dos filas y el texto queda arriba de los botones.
            numberOfLines={Platform.OS === "web" ? 1 : undefined}
            textAlignVertical="top"
            // El teclado dice «Enviar». En iOS y Android el retorno manda y no mete salto de línea.
            returnKeyType="send"
            enterKeyHint="send"
            submitBehavior={Platform.OS === "web" ? undefined : "submit"}
            onSubmitEditing={Platform.OS === "web" ? undefined : () => void send()}
            onKeyPress={Platform.OS === "web" ? onWebKey : undefined}
          />
          {!shell && current ? (
            <Pressable testID="model" onPress={() => setSheet("model")} style={styles.round} accessibilityLabel={`${w("chat.model.title")}: ${modelText}${efforts.length ? ` · ${effortLabel(effort)}` : ""}${modeOption ? ` · ${phrase(modeOption.label)}` : ""}`}>
              <BrandMark id={current} size={20} color={theme.text} />
            </Pressable>
          ) : null}
          {showStop ? (
            <Pressable testID="stop" onPress={onStop} accessibilityRole="button" accessibilityLabel={w("chat.turn.stop")} style={[styles.send, { backgroundColor: theme.text }]}>
              <Icon name="square" size={11} color={theme.bg} fill={theme.bg} />
            </Pressable>
          ) : shell ? (
            <Pressable testID="send" disabled={!ready || !text.slice(1).trim()} onPress={send} style={[styles.run, { backgroundColor: theme.text, opacity: ready && text.slice(1).trim() ? 1 : 0.4 }]}>
              <Icon name="corner-down-left" size={14} color={theme.bg} />
              <Text style={{ color: theme.bg, fontWeight: "700", fontSize: TEXT.ui }}>{sendLabel}</Text>
            </Pressable>
          ) : (
            <SendButton disabled={!ready || !hasText} onPress={send} label={sendLabel} />
          )}
        </View>
      </View>
      {note ? <Text style={[styles.hint, { color: theme.textMuted, paddingHorizontal: 16 }]}>{note}</Text> : null}

      <Sheet visible={sheet === "attach"} title={w("chat.attachments.add")} onClose={() => setSheet(null)}>
        <SheetOption testID="attach-photos" icon="image" label={t("composer.attach_photos")} onPress={() => void pickPhotos()} />
        <SheetOption testID="attach-files" icon="file" label={t("composer.attach_files")} onPress={() => void pickFiles()} />
        <Text style={[styles.hint, { color: theme.textMuted, paddingHorizontal: 18, paddingTop: 8 }]}>{t("composer.unsupported_file")}</Text>
      </Sheet>

      <Sheet visible={sheet === "model"} title={w("chat.model.title")} search={t("search.models")} onClose={() => setSheet(null)}>
        {(query) => {
          const shownModels = surfaceModels.filter((m) => matches(query, m.label, m.id, modelName(m.id, models)));
          return (
            <>
              <SheetSection>{w("chat.model.providers")}</SheetSection>
              {locked ? <Text style={[styles.hint, { color: theme.textMuted, paddingHorizontal: 18 }]}>{providerLockedReason ?? w("chat.model.locked")}</Text> : null}
              {usable.map((p) => {
                // Lo utilizable y lo de la tarea; los gratuitos sin activar también, para llevar a activarlos.
                const own = surfaces.filter((s) => s.provider === p.id && (menu.includes(s) || s.catalogo === "gratuitos"));
                if (own.length < 2)
                  return (
                    <SheetOption
                      key={p.id}
                      left={<BrandMark id={p.id} size={17} color={theme.text} />}
                      label={p.label}
                      selected={p.id === current}
                      disabled={locked && p.id !== current}
                      onPress={() => chooseProvider(p.id)}
                    />
                  );
                return own.map((s) => (
                  <SheetOption
                    key={`${p.id}/${s.id}`}
                    testID={`surface-${s.id}`}
                    left={<BrandMark id={p.id} size={17} color={theme.text} />}
                    label={`${p.label} · ${surfaceLabel(s)}`}
                    detail={s.usable ? null : whyNot(s)}
                    selected={p.id === current && s.id === surface}
                    disabled={(locked && p.id !== current) || (!s.usable && !onAccounts)}
                    onPress={() => chooseSurface(s)}
                  />
                ));
              })}
              <SheetSection>{w("chat.model.listbox")}</SheetSection>
              {!models ? <Text style={[styles.hint, { color: theme.textMuted, paddingHorizontal: 18 }]}>{t("composer.loading")}</Text> : null}
              {models && !surfaceModels.length ? <Text style={[styles.hint, { color: theme.textMuted, paddingHorizontal: 18 }]}>{w("chat.model.empty")}</Text> : null}
              {models && surfaceModels.length > 0 && !shownModels.length ? <NoMatch /> : null}
              {shownModels.map((m) => (
                <SheetOption
                  key={m.id}
                  label={m.label || modelName(m.id, models)}
                  detail={m.note ? phrase(m.note) : null}
                  selected={model === m.id}
                  onPress={() => {
                    setModel(m.id);
                    if (effort && !m.efforts.includes(effort)) setEffort(null);
                  }}
                />
              ))}
              {efforts.length ? (
                <>
                  <SheetSection>{w("chat.effort.label")}</SheetSection>
                  <View style={styles.efforts}>
                    {[null, ...efforts].map((e) => (
                      <Pressable
                        key={e ?? "auto"}
                        onPress={() => setEffort(e)}
                        style={[styles.effort, { borderColor: e === effort ? theme.primary : theme.border, backgroundColor: e === effort ? theme.primary : "transparent" }]}
                      >
                        <Text style={{ color: e === effort ? theme.onPrimary : theme.text, fontWeight: e === effort ? "700" : "500" }}>{effortLabel(e)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
              {modes.length ? (
                <>
                  <SheetSection>{w("chat.mode.listbox")}</SheetSection>
                  {modes.map((m) => (
                    <SheetOption
                      key={m.id}
                      testID={`mode-${m.id}`}
                      icon="shield"
                      label={phrase(m.label)}
                      detail={m.falta ? phrase(m.falta) : null}
                      disabled={Boolean(m.falta)}
                      selected={(modeOption?.id ?? null) === m.id}
                      onPress={() => {
                        setMode(m.id);
                        if (running) onModeChange?.(m.id);
                      }}
                    />
                  ))}
                </>
              ) : null}
            </>
          );
        }}
      </Sheet>

      <Sheet visible={sheet === "handover"} title={t("composer.handover_title")} onClose={() => { setCandidate(null); setSheet(null); }}>
        <View style={styles.handoverBody}>
          <View style={styles.handoverChange}>
            <BrandMark id={current ?? ""} size={18} color={theme.text} />
            <Text style={{ color: theme.text, fontSize: TEXT.ui, fontWeight: "600" }}>{providerLabel(current)}</Text>
            <Icon name="chevron-right" size={14} color={theme.textMuted} />
            <BrandMark id={candidate ?? ""} size={18} color={theme.text} />
            <Text style={{ color: theme.text, fontSize: TEXT.ui, fontWeight: "600" }}>{candidateLabel}</Text>
          </View>
          <Text style={{ color: theme.textMuted, fontSize: TEXT.body, lineHeight: 20 }}>{t("composer.handover_description")}</Text>
          <SheetOption testID="handover-confirm" icon="check" label={t("composer.handover_confirm", { provider: candidateLabel ?? "" })} onPress={confirmHandover} />
          <SheetOption label={t("task.actions.cancel")} onPress={() => { setCandidate(null); setSheet("model"); }} />
        </View>
      </Sheet>
    </View>
  );
}

function Suggestions({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.suggestions, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ScrollView keyboardShouldPersistTaps="always">{children}</ScrollView>
    </View>
  );
}

/** Un selector compacto sobre el cuadro de una tarea nueva: ícono, rótulo y su valor. */
export function SelectorChip({ icon, left, label, value, onPress, testID, muted }: { icon?: Parameters<typeof Icon>[0]["name"]; left?: ReactNode; label?: string; value: string; onPress?: () => void; testID?: string; muted?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.selector, { borderColor: theme.border, backgroundColor: pressed ? theme.muted : theme.surface }]}
    >
      {left ?? (icon ? <Icon name={icon} size={13} color={theme.textMuted} /> : null)}
      {label ? <Text style={{ color: theme.textMuted, fontSize: TEXT.label }}>{label}</Text> : null}
      <Text numberOfLines={1} style={{ color: muted ? theme.textMuted : theme.text, fontSize: TEXT.ui, fontWeight: "500", maxWidth: 150 }}>
        {value}
      </Text>
      {onPress ? <Icon name="chevron-down" size={12} color={theme.textMuted} /> : null}
    </Pressable>
  );
}

const INPUT_MIN = 36;
const INPUT_MAX = 21 * 6 + 15;

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 10, paddingTop: 6, gap: 6 },
  // El contenedor no tiene fondo propio: el cuadro flota sobre el del chat con su sombra.
  box: {
    borderWidth: 0,
    borderRadius: 26,
    paddingVertical: 5,
    paddingHorizontal: 6,
    ...Platform.select({
      web: { outlineStyle: "solid", outlineWidth: 0, boxShadow: "0 2px 6px rgba(0, 0, 0, 0.10), 0 8px 24px rgba(0, 0, 0, 0.16)" },
      default: { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
    }),
  },
  input: { fontSize: 16, lineHeight: 21, flex: 1, minWidth: 0, minHeight: INPUT_MIN, maxHeight: INPUT_MAX, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 7, borderWidth: 0, backgroundColor: "transparent", ...Platform.select({ web: { outlineStyle: "solid", outlineWidth: 0, boxShadow: "none", boxSizing: "border-box", resize: "none", scrollbarWidth: "none" } }) },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  shellPill: { marginBottom: 3, marginRight: 4 },
  round: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 17 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 14, paddingHorizontal: 9, height: 28 },
  modelPill: { borderWidth: StyleSheet.hairlineWidth, flexShrink: 1 },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  run: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, borderRadius: 17, paddingHorizontal: 14 },
  files: { gap: 6, paddingHorizontal: 4, paddingTop: 4 },
  file: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: RADIUS.lg, paddingHorizontal: 8, paddingVertical: 5 },
  pending: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
  handoverBody: { paddingHorizontal: 18, paddingBottom: 8, gap: 10 },
  handoverChange: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  queue: { gap: 6 },
  queued: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  queueLabel: { fontSize: TEXT.caption, fontWeight: "600" },
  hint: { fontSize: TEXT.ui, paddingVertical: 6, paddingHorizontal: 18 },
  suggestions: { maxHeight: 260, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: "hidden" },
  efforts: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 18, paddingVertical: 8 },
  effort: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  selector: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 10, height: 30 },
});
