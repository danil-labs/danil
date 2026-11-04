import { For, Show, createEffect, createSignal } from "solid-js";
import { conflictCopyOf, deleteMemoryFile, memoryEntryText, writeMemoryFile } from "@terminus/computers";
import History from "lucide-solid/icons/history";
import { invoke } from "../../lib/invoke.ts";
import { confirm } from "@tauri-apps/plugin-dialog";
import Pencil from "lucide-solid/icons/pencil";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { asFailure, FailureNote, type Failure } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import { Textarea } from "../../ui/Textarea";
import { enfocar } from "../../lib/focus";
import { manifiesto, t } from "../../lib/i18n";
import type { Agent, MemoriaEntrada, MemoriaIndice, MemoriaListado, MemoriaScope } from "../../lib/model";
import { EmptyState } from "../../ui/EmptyState";
import { capabilities } from "../../lib/platform";
import HistorialDeEntrada from "./MemoryHistory";
import { type EntradaDeCuenta, entradasDeCuenta, type MemoriaDeCuenta, memoriaDeCuenta } from "./memory-account";
import { Panel } from "../../ui/Panel";

function scopeIgual(a: MemoriaScope, b: MemoriaScope): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "agent" && b.kind === "agent" ? a.name === b.name : true;
}

const fecha = (iso: string) =>
  !iso || Number.isNaN(Date.parse(iso))
    ? ""
    : new Intl.DateTimeFormat(manifiesto().formato, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

/**
 * El mismo formulario para escribir y para editar. `file` es la identidad:
 * al editar se manda fija, y escribir con el mismo nombre reescribe el
 * cuerpo en el sitio en vez de dejar una segunda versión. Igual en los tres
 * alcances: el motor ya guarda `workspace` en el mismo formato que `project`.
 */
function FormularioDeEntrada(props: {
  abierto: boolean;
  proyecto: string;
  scope: MemoriaScope;
  entrada: MemoriaEntrada | null;
  /** En la web: la memoria se escribe en la cuenta, en esa carpeta del repo. */
  cuenta?: { cuenta: MemoriaDeCuenta; carpeta: string } | null;
  onCerrar: () => void;
  onGuardado: () => void;
  /** Un aviso para la lista después de guardar (la copia que dejó un conflicto). */
  onAviso?: (texto: string) => void;
}) {
  const [file, setFile] = createSignal("");
  const [tipo, setTipo] = createSignal("");
  const [texto, setTexto] = createSignal("");
  const [guardando, setGuardando] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [archivoInvalido, setArchivoInvalido] = createSignal(false);
  let archivoRef: HTMLInputElement | undefined;

  // Cada apertura parte de la entrada que se edita, o en blanco: sin esto,
  // abrir "editar" en otra fila arrastraría el texto de la anterior.
  createEffect(() => {
    if (!props.abierto) return;
    const e = props.entrada;
    setFile(e?.file ?? "");
    setTipo(e?.type ?? "");
    setTexto(e?.text ?? "");
    setFallo(null);
    setArchivoInvalido(false);
  });

  const editando = () => props.entrada !== null;
  // El archivo no entra aquí: un archivo vacío no deja el botón mudo, lo
  // avisa `guardar` — antes no pasaba nada y no se decía nada.
  const listo = () => Boolean(texto().trim()) && !guardando();

  async function guardar() {
    if (!listo()) return;
    const nombre = file().trim();
    if (!nombre) {
      setArchivoInvalido(true);
      setFallo({ what: t("projects.memory.error_file_required"), detail: "" });
      archivoRef?.focus();
      return;
    }
    setArchivoInvalido(false);
    setGuardando(true);
    setFallo(null);
    try {
      const enCuenta = props.cuenta;
      if (enCuenta) {
        const archivo = nombre.endsWith(".md") ? nombre : `${nombre}.md`;
        const previa = props.entrada as EntradaDeCuenta | null;
        const answer = await writeMemoryFile(
          enCuenta.cuenta.source,
          enCuenta.cuenta.workspace,
          previa?.path ?? `${enCuenta.carpeta}${archivo}`,
          memoryEntryText({ type: tipo().trim() || null, body: texto(), workspace: enCuenta.cuenta.workspace, project: props.proyecto }),
          previa?.oid ?? null,
        );
        if (answer.kind !== "ok") {
          setFallo({ what: t(answer.kind === "busy" ? "projects.memory.busy" : "projects.memory.error_save"), detail: answer.kind });
          return;
        }
        if (answer.value.conflict_copy) props.onAviso?.(t("projects.memory.conflict_saved", { copy: answer.value.conflict_copy }));
      } else {
        await invoke("write_memory_entry", {
          project: props.proyecto,
          scope: props.scope,
          file: nombre,
          type: tipo().trim() || null,
          text: texto().trim(),
        });
      }
      props.onGuardado();
      props.onCerrar();
    } catch (e) {
      setFallo({ ...asFailure(e), what: t("projects.memory.error_save") });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={props.abierto} onOpenChange={(a) => !a && !guardando() && props.onCerrar()}>
      <DialogContent>
        <DialogTitle class="m-0 text-lead font-semibold">
          {editando() ? t("projects.memory.edit_title") : t("projects.memory.new_title")}
        </DialogTitle>
        <form
          class="grid gap-3 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <label class="grid gap-1 text-ui">
            <span class="text-neutral-500">
              {t("projects.memory.form_file")}{" "}
              <span classList={{ "text-error-strong": archivoInvalido() }}>
                ({t("projects.memory.form_file_required")})
              </span>
            </span>
            <Input
              ref={(el) => {
                archivoRef = el;
                enfocar(el);
              }}
              value={file()}
              disabled={guardando() || editando()}
              aria-required="true"
              aria-invalid={archivoInvalido()}
              class={archivoInvalido() ? "border-error-strong" : undefined}
              placeholder={t("projects.memory.form_file_placeholder")}
              onInput={(e) => {
                setFile(e.currentTarget.value);
                setArchivoInvalido(false);
              }}
            />
          </label>
          <label class="grid gap-1 text-ui">
            <span class="text-neutral-500">{t("projects.memory.form_type")}</span>
            <Input
              value={tipo()}
              disabled={guardando()}
              placeholder={t("projects.memory.form_type_placeholder")}
              onInput={(e) => setTipo(e.currentTarget.value)}
            />
          </label>
          <label class="grid gap-1 text-ui">
            <span class="text-neutral-500">{t("projects.memory.form_text")}</span>
            <Textarea
              placeholder={t("projects.memory.form_text_placeholder")}
              value={texto()}
              disabled={guardando()}
              onInput={(e) => setTexto(e.currentTarget.value)}
            />
          </label>

          <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>

          <div class="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={guardando()} onClick={props.onCerrar}>
              {t("projects.memory.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!listo()}>
              {guardando() ? t("projects.memory.saving") : t("projects.memory.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * La memoria del proyecto: los tres alcances se escriben, se editan y se borran
 * igual. En la ventana sale del motor local y el historial, de la cuenta de
 * Danil del workspace. En la web (`capabilities().accountMemory`) todo sale de
 * la cuenta por el Worker, con las máquinas apagadas. Las copias `.conflicto-*`
 * se marcan y se avisan.
 */
export default function Memoria(props: { project: string; workspace?: string | null; agents: Agent[]; encargados?: string[] }) {
  const [scope, setScope] = createSignal<MemoriaScope>({ kind: "project" });
  const [entradas, setEntradas] = createSignal<MemoriaEntrada[]>([]);
  const [indice, setIndice] = createSignal<MemoriaIndice | null>(null);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [ocupada, setOcupada] = createSignal<string | null>(null);
  const [formulario, setFormulario] = createSignal<"nueva" | MemoriaEntrada | null>(null);
  const [cuenta, setCuenta] = createSignal<MemoriaDeCuenta | null>(null);
  const [carpeta, setCarpeta] = createSignal<string | null>(null);
  const [historial, setHistorial] = createSignal<MemoriaEntrada | null>(null);
  const [aviso, setAviso] = createSignal<string | null>(null);

  const encargados = () => props.encargados ?? [];
  /** La web no tiene motor propio: la memoria es la de la cuenta. */
  const enLaCuenta = () => Boolean(capabilities().accountMemory);
  const copias = () => entradas().filter((e) => conflictCopyOf(e.file) !== null);

  createEffect(() => {
    const ws = props.workspace;
    setCuenta(null);
    void memoriaDeCuenta(ws).then((c) => props.workspace === ws && setCuenta(c));
  });

  async function refrescar() {
    setFallo(null);
    if (enLaCuenta()) {
      const c = cuenta();
      if (!c) return;
      try {
        const leido = await entradasDeCuenta(c, props.project, scope());
        setCarpeta(leido.carpeta);
        setEntradas(leido.entradas);
        setIndice(null);
      } catch (e) {
        const kind = (e as { kind?: string })?.kind;
        setFallo({ what: t(kind === "busy" ? "projects.memory.busy" : "projects.memory.error_list"), detail: kind ?? "" });
      }
      return;
    }
    try {
      const listado = await invoke<MemoriaListado>("list_memory_entries", {
        project: props.project,
        scope: scope(),
      });
      setEntradas(listado.entries);
      setIndice(listado.index);
    } catch (e) {
      setFallo({ ...asFailure(e), what: t("projects.memory.error_list") });
    }
  }

  // Se relee al cambiar de proyecto o de alcance: es la lista de ese par,
  // no de la pantalla, y arrastrar la del anterior mostraría memoria ajena.
  createEffect(() => {
    props.project;
    scope();
    if (enLaCuenta()) cuenta();
    setAviso(null);
    void refrescar();
  });

  const editando = () => {
    const f = formulario();
    return f === "nueva" ? null : f;
  };

  function nombreDeAgente(id: string) {
    return props.agents.find((a) => a.id === id)?.label ?? id;
  }

  function quien(e: MemoriaEntrada) {
    return e.origin.provider ? nombreDeAgente(e.origin.provider) : t("projects.memory.person");
  }

  // El único borrado físico del módulo: pide confirmación antes de mandarlo.
  async function borrar(file: string) {
    if (!(await confirm(t("projects.memory.delete_confirm"), { kind: "warning" }))) return;
    setOcupada(file);
    setFallo(null);
    try {
      const c = cuenta();
      const e = entradas().find((x) => x.file === file) as EntradaDeCuenta | undefined;
      if (enLaCuenta() && c && e) {
        const answer = await deleteMemoryFile(c.source, c.workspace, e.path, e.oid);
        if (answer.kind === "conflict") setAviso(t("projects.memory.changed_meanwhile"));
        else if (answer.kind === "busy") setFallo({ what: t("projects.memory.busy"), detail: "busy" });
        else if (answer.kind !== "ok" && answer.kind !== "missing") setFallo({ what: t("projects.memory.error_delete"), detail: answer.kind });
      } else {
        await invoke("delete_memory_entry", { project: props.project, scope: scope(), file });
      }
      await refrescar();
    } catch (e) {
      setFallo({ ...asFailure(e), what: t("projects.memory.error_delete") });
    } finally {
      setOcupada(null);
    }
  }

  return (
    <Panel
      title={t("projects.memory.title")}
      action={
        <Button variant="ghost" size="sm" onClick={() => setFormulario("nueva")}>
          <Plus size={14} />
          {t("projects.memory.write")}
        </Button>
      }
    >
      <div class="grid gap-2 px-3 pb-3">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex flex-wrap gap-1" role="group" aria-label={t("projects.memory.scope_label")}>
          <Button
            variant={scope().kind === "project" ? "secondary" : "outline"}
            size="compact"
            aria-pressed={scope().kind === "project"}
            onClick={() => setScope({ kind: "project" })}
          >
            {t("projects.memory.scope_project")}
          </Button>
          <Button
            variant={scope().kind === "workspace" ? "secondary" : "outline"}
            size="compact"
            aria-pressed={scope().kind === "workspace"}
            onClick={() => setScope({ kind: "workspace" })}
          >
            {t("projects.memory.scope_workspace")}
          </Button>
          <For each={encargados()}>
            {(name) => (
              <Button
                variant={scopeIgual(scope(), { kind: "agent", name }) ? "secondary" : "outline"}
                size="compact"
                aria-pressed={scopeIgual(scope(), { kind: "agent", name })}
                onClick={() => setScope({ kind: "agent", name })}
              >
                {t("projects.memory.scope_agent", { name })}
              </Button>
            )}
          </For>
        </div>
        <Show when={indice()}>
          {(idx) => (
            <span
              class="text-caption text-neutral-500"
              classList={{ "text-warning-strong": idx().lines >= idx().line_limit }}
            >
              {t("projects.memory.index_status", { lines: idx().lines, limit: idx().line_limit })}
            </span>
          )}
        </Show>
      </div>

      <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
      <Show when={aviso()}>
        {(texto) => (
          <p class="m-0 text-ui text-neutral-700" role="status" data-memory-notice="">
            {texto()}
          </p>
        )}
      </Show>
      <Show when={copias().length > 0}>
        <p class="m-0 text-ui text-warning-strong" role="status" data-memory-conflicts="">
          {t("projects.memory.conflicts_notice")}
        </p>
      </Show>

      <Show
        when={entradas().length > 0}
        fallback={<EmptyState title={t("projects.memory.empty")} />}
      >
        <ul class="m-0 grid list-none gap-2 p-0">
          <For each={entradas()}>
            {(e) => (
              <li class="grid gap-1.5 rounded-md border border-border px-3 py-2" aria-busy={ocupada() === e.file}>
                <p class="m-0 text-ui text-neutral-950">{e.text}</p>
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-neutral-500">
                  <Show when={e.type}>{(tipo) => <Badge forma="dato">{tipo()}</Badge>}</Show>
                  <Show when={!e.in_index}>
                    <Badge tone="warning">{t("projects.memory.out_of_index_badge")}</Badge>
                  </Show>
                  <Show when={conflictCopyOf(e.file)}>
                    {(c) => (
                      <Badge tone="warning" data-memory-conflict-copy="">
                        {t("projects.memory.conflict_badge", { file: c().original.slice(c().original.lastIndexOf("/") + 1) })}
                      </Badge>
                    )}
                  </Show>
                  <span class="font-mono">{e.file}</span>
                  <span>{quien(e)}</span>
                  <Show when={e.origin.handler}>
                    {(encargado) => <span>{t("projects.memory.encargado_named", { encargado: encargado() })}</span>}
                  </Show>
                  <Show when={e.origin.task}>{(tarea) => <span>{t("projects.memory.task_named", { task: tarea() })}</span>}</Show>
                  <span>{fecha(e.modified)}</span>
                  <Show when={e.origin.branch}>{(rama) => <span class="font-mono">{rama()}</span>}</Show>
                  <Show when={e.origin.commit}>{(commit) => <span class="font-mono">{commit()}</span>}</Show>
                </div>
                <div class="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="compact"
                    disabled={ocupada() !== null}
                    onClick={() => setFormulario(e)}
                  >
                    <Pencil size={12} />
                    {t("projects.memory.edit")}
                  </Button>
                  <Show when={cuenta()}>
                    <Button variant="ghost" size="compact" onClick={() => setHistorial(e)}>
                      <History size={12} />
                      {t("projects.memory.history")}
                    </Button>
                  </Show>
                  <Button
                    variant="ghost"
                    size="compact"
                    disabled={ocupada() !== null}
                    onClick={() => void borrar(e.file)}
                  >
                    <Trash2 size={12} />
                    {t("projects.memory.delete")}
                  </Button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <FormularioDeEntrada
        abierto={formulario() !== null}
        proyecto={props.project}
        scope={scope()}
        entrada={editando()}
        cuenta={(() => {
          const c = cuenta();
          return enLaCuenta() && c ? { cuenta: c, carpeta: carpeta() ?? `projects/${props.project}/memory/` } : null;
        })()}
        onCerrar={() => setFormulario(null)}
        onGuardado={() => void refrescar()}
        onAviso={setAviso}
      />
      <HistorialDeEntrada
        cuenta={cuenta()}
        project={props.project}
        scope={scope()}
        file={historial()?.file ?? null}
        path={(historial() as EntradaDeCuenta | null)?.path ?? null}
        onCerrar={() => setHistorial(null)}
      />
      </div>
    </Panel>
  );
}
