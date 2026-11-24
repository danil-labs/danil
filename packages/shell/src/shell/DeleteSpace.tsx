import ChevronDown from "lucide-solid/icons/chevron-down";
import FileWarning from "lucide-solid/icons/triangle-alert";
import { SignalDot } from "../../../ui/src/SignalDot";
import Save from "lucide-solid/icons/save";
import { createEffect, createResource, createSignal, For, type JSX, onCleanup, Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import {
  claveDeVista,
  type DeleteOutcome,
  type DeletePreview,
  type Space,
  marcasDeCambio,
  spaceName,
  type TaskSeen,
} from "../../../ui/src/lib/spaces";
import { invoke } from "../../../engine-client/src/client.ts";
import { machineOf } from "../../../features/machines/src/queries/store";
import { cn } from "../../../ui/src/lib/utils";
import type { Project } from "../../../ui/src/lib/model";
import { Button } from "../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../ui/src/Dialog";
import { asFailure, type Failure, FailureNote } from "../../../ui/src/Failure";

/**
 * Eliminar un espacio: si no tiene tareas se borra sin preguntar; si tiene,
 * se pide una confirmación con el total de tareas y de lo que se pierde, y el
 * detalle queda a un clic. Se manda de vuelta exactamente lo visto: si el
 * servicio ve algo más, no borra y se pregunta otra vez
 * (`descartar-solo-lo-visto`).
 */
export default function DeleteSpace(props: {
  space: Space;
  proyectos: Project[];
  managed?: {
    taskCount: number;
    defaultSpaceName: string;
    onDelete: () => Promise<number>;
  };
  onAbrir: (folder: string, task: string) => void;
  onCerrar: () => void;
  onEliminada: (archivadas: number, ungrouped?: boolean) => void;
  /** Las carpetas donde el intento pudo archivar algo, falle o no. */
  onTocadas: (folders: string[]) => void;
}) {
  const [previa, { mutate, refetch }] = createResource(
    () => (props.managed ? null : props.space.id),
    (id) => invoke<DeletePreview>("space_delete_preview", { id }, machineOf(id)),
  );
  const [marcas, setMarcas] = createSignal(new Map<string, "new" | "changed">());
  const [fallos, setFallos] = createSignal<{ task: string; title: string; error: Failure }[]>([]);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [borrando, setBorrando] = createSignal(false);
  const [detalle, setDetalle] = createSignal(false);
  // Sin previa a los 1,5 s se enseña el diálogo con la espera; a los 8, que no
  // contestó. Un espacio vacío se borra antes y nunca llega a verse.
  const [lento, setLento] = createSignal(false);
  const [tarde, setTarde] = createSignal(false);
  // Lo archivado en todos los intentos: un reintento solo manda lo que quedó.
  const enviadas = new Set<string>();
  let vacioHecho = false;
  let cancelar: HTMLButtonElement | undefined;
  let aviso: HTMLDivElement | undefined;

  const tareas = () => previa()?.tasks ?? [];
  const trabajando = () => tareas().filter((s) => s.working);
  const sinCommitear = () => tareas().filter((s) => s.files.length > 0);
  const sinGuardar = () => tareas().filter((s) => s.kn_pending.length > 0);
  const avisos = () => trabajando().length + sinCommitear().length + sinGuardar().length;
  const carpeta = (id: string) => props.proyectos.find((p) => p.id === id)?.name ?? id;
  const nombre = () => spaceName(props.space);

  const releer = () => invoke<DeletePreview>("space_delete_preview", { id: props.space.id }, machineOf(props.space.id));

  createEffect(() => {
    if (props.managed || !previa.loading) {
      setLento(false);
      setTarde(false);
      return;
    }
    const pronto = setTimeout(() => setLento(true), 1500);
    const limite = setTimeout(() => setTarde(true), 8000);
    onCleanup(() => {
      clearTimeout(pronto);
      clearTimeout(limite);
    });
  });

  const confirmar = async () => {
    if (borrando()) return;
    if (props.managed) {
      setBorrando(true);
      setFallo(null);
      try {
        const count = await props.managed.onDelete();
        props.onEliminada(count, true);
      } catch (e) {
        setFallo(asFailure(e));
      } finally {
        setBorrando(false);
      }
      return;
    }
    const vista = previa();
    if (!vista) return;
    setBorrando(true);
    setFallo(null);
    for (const s of vista.tasks) enviadas.add(claveDeVista(s));
    try {
      const salida = await invoke<DeleteOutcome>("delete_space", {
        id: props.space.id,
        seen: { tasks: vista.tasks, discard: sinCommitear().length > 0 },
      }, machineOf(props.space.id));
      if (salida.deleted) {
        props.onEliminada(enviadas.size);
        return;
      }
      props.onTocadas([...new Set(vista.tasks.map((s) => s.folder))]);
      const titulos = new Map(vista.tasks.map((s) => [s.task, s.title]));
      setFallos(salida.failures.map((f) => ({ task: f.task, title: titulos.get(f.task) || f.task, error: asFailure(f.error) })));
      // Tras un fallo la previa que vuelve puede contar vivo un turno que ya se
      // detuvo; se pinta la de ahora.
      const hayFallos = salida.failures.length !== 0;
      const ahora = hayFallos ? await releer() : salida.changed;
      if (ahora) {
        const nuevas = marcasDeCambio(vista.tasks, ahora.tasks);
        mutate(ahora);
        setMarcas(nuevas);
        if (nuevas.size > 0) setTimeout(() => aviso?.focus(), 0);
      }
    } catch (e) {
      props.onTocadas([...new Set(vista.tasks.map((s) => s.folder))]);
      setFallo(asFailure(e));
    } finally {
      setBorrando(false);
    }
  };

  // Sin tareas no hay nada que confirmar: se borra y ya. El servicio sigue
  // negándose si algo apareció mientras se miraba.
  createEffect(() => {
    const vista = previa();
    if (props.managed || vacioHecho || !vista || vista.last || vista.tasks.length > 0 || borrando() || fallo()) return;
    vacioHecho = true;
    void confirmar();
  });

  // El diálogo solo existe si hay algo que decir: mientras se lee un espacio
  // vacío no se enseña nada.
  const tardando = () => !props.managed && (lento() || tarde()) && previa.loading;
  const seVe = () => !!props.managed || (!!previa() && (tareas().length > 0 || previa()!.last)) || tardando() || !!previa.error || !!fallo() || fallos().length > 0;

  const Fila = (p: { s: TaskSeen; extra?: JSX.Element }) => {
    const marca = () => marcas().get(claveDeVista(p.s));
    return (
      <li class="grid min-h-12 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md border border-border bg-surface px-3 py-1.5" data-delete-row={p.s.task}>
        <div class="grid min-w-0">
          <span class="flex min-w-0 items-center gap-2 text-ui font-medium text-neutral-950">
            <span class="truncate" title={p.s.title}>{p.s.title || p.s.task}</span>
            <Show when={marca()}>
              {(m) => (
                <span data-delete-mark={m()} class="shrink-0 rounded-sm bg-neutral-950 px-1.5 text-caption leading-4 font-semibold text-neutral-50">
                  {m() === "new" ? t("spaces.delete.mark_new") : t("spaces.delete.mark_changed")}
                </span>
              )}
            </Show>
          </span>
          <span class="truncate text-caption text-neutral-500">{carpeta(p.s.folder)}</span>
        </div>
        <span class="text-xs text-neutral-700">{p.extra}</span>
        <Button
          variant="ghost"
          size="compact"
          aria-label={t("spaces.delete.open_named", { title: p.s.title || p.s.task })}
          onClick={() => props.onAbrir(p.s.folder, p.s.task)}
        >
          {t("spaces.delete.open")}
        </Button>
      </li>
    );
  };

  const Seccion = (p: { icono: JSX.Element; titulo: string; porque: string; filas: TaskSeen[]; extra?: (s: TaskSeen) => JSX.Element; clave: string }) => (
    <Show when={p.filas.length > 0}>
      <section class="grid gap-1.5" data-delete-section={p.clave}>
        <h3 class="m-0 flex items-center gap-2 text-ui font-semibold text-neutral-950">{p.icono}{p.titulo}</h3>
        <p class="m-0 text-xs text-neutral-700">{p.porque}</p>
        <ul class="m-0 grid list-none gap-1.5 p-0">
          <For each={p.filas}>{(s) => <Fila s={s} extra={p.extra?.(s)} />}</For>
        </ul>
      </section>
    </Show>
  );

  const boton = () => {
    if (props.managed) return t("spaces.delete.delete_empty");
    const n = tareas().length;
    if (sinCommitear().length > 0) return t("spaces.delete.discard_and_delete");
    if (n > 0) return t("spaces.delete.archive_and_delete", { count: n });
    return t("spaces.delete.delete_empty");
  };

  return (
    <Show when={seVe()}>
      <Dialog open onOpenChange={(abierto) => { if (!abierto && !borrando()) props.onCerrar(); }}>
        <DialogContent
          role="alertdialog"
          aria-describedby="delete-space-what-happens"
          data-delete-space={props.space.id}
          class="flex max-h-[min(86vh,720px)] max-w-[540px] flex-col gap-0 p-0"
          onOpenAutoFocus={(e: Event) => {
            e.preventDefault();
            setTimeout(() => cancelar?.focus(), 0);
          }}
        >
          <DialogTitle class="m-0 px-5 pt-5 pb-2 text-lead font-semibold">
            {t("spaces.delete.title", { name: nombre() })}
          </DialogTitle>
          <div class="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 pb-4" aria-busy={(!props.managed && previa.loading) || borrando()}>
            <p id="delete-space-what-happens" class="m-0 text-ui leading-relaxed text-neutral-700">
              <Show
                when={props.managed}
                fallback={
                  <Show
                    when={previa()}
                    fallback={tarde() ? t("spaces.delete.no_answer") : t("spaces.delete.reading")}
                  >
                    {previa()?.last
                      ? t("spaces.menu.delete_last")
                      : tareas().length > 0
                        ? t("spaces.delete.body", { count: tareas().length })
                        : t("spaces.delete.body_empty")}
                  </Show>
                }
              >
                {(managed) =>
                  managed().taskCount > 0
                    ? t("spaces.delete.body_ungrouped", { count: managed().taskCount, defaultSpace: managed().defaultSpaceName })
                    : t("spaces.delete.body_empty")
                }
              </Show>
            </p>
            <Show when={!props.managed && avisos() > 0}>
              <ul class="m-0 grid list-none gap-1 p-0 text-ui text-neutral-700" data-delete-totals="">
                <Show when={trabajando().length > 0}>
                  <li data-delete-total="working">{t("spaces.delete.working", { count: trabajando().length })}</li>
                </Show>
                <Show when={sinCommitear().length > 0}>
                  <li data-delete-total="uncommitted">{t("spaces.delete.uncommitted", { count: sinCommitear().length })}</li>
                </Show>
                <Show when={sinGuardar().length > 0}>
                  <li data-delete-total="unsaved">{t("spaces.delete.unsaved", { count: sinGuardar().length })}</li>
                </Show>
              </ul>
            </Show>
            <Show when={marcas().size > 0}>
              <div
                ref={aviso}
                role="alert"
                tabIndex={-1}
                data-delete-notice=""
                class="grid grid-cols-[16px_minmax(0,1fr)] gap-x-2 rounded-md border border-border-strong bg-surface-raised p-3 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <FileWarning size={16} aria-hidden="true" class="mt-0.5 text-error-strong" />
                <b class="text-ui text-neutral-950">{t("spaces.delete.changed_title")}</b>
                <span class="col-start-2 text-xs text-neutral-700">{t("spaces.delete.changed_body")}</span>
              </div>
            </Show>
            <Show when={fallos().length > 0}>
              <section class="grid gap-1.5" data-delete-failures="">
                <h3 class="m-0 text-ui font-semibold text-error-strong">{t("spaces.delete.failed_title", { count: fallos().length })}</h3>
                <p class="m-0 text-xs text-neutral-700">{t("spaces.delete.failed_body")}</p>
                <ul class="m-0 grid list-none gap-1 p-0">
                  <For each={fallos()}>
                    {(f) => (
                      <li class="rounded-md border border-error-strong px-3">
                        <span class="block pt-2 text-ui font-medium text-neutral-950">{f.title}</span>
                        <FailureNote f={f.error} />
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            </Show>
            <Show when={avisos() > 0}>
              <Button
                variant="outline"
                size="compact"
                class="justify-self-start"
                aria-expanded={detalle()}
                disabled={borrando()}
                onClick={() => setDetalle((v) => !v)}
              >
                {t("spaces.delete.see_details")}
                <ChevronDown size={13} aria-hidden="true" class={cn("transition-transform", detalle() && "rotate-180")} />
              </Button>
            </Show>
            <Show when={detalle()}>
              <Seccion
                clave="working"
                icono={<span aria-hidden="true" class="grid size-4 place-items-center"><SignalDot tone="working" /></span>}
                titulo={t("spaces.delete.working", { count: trabajando().length })}
                porque={t("spaces.delete.working_why")}
                filas={trabajando()}
              />
              <Seccion
                clave="uncommitted"
                icono={<FileWarning size={16} aria-hidden="true" class="text-error-strong" />}
                titulo={t("spaces.delete.uncommitted", { count: sinCommitear().length })}
                porque={t("spaces.delete.uncommitted_why")}
                filas={sinCommitear()}
                extra={(s) => t("spaces.delete.files", { count: s.files.length })}
              />
              <Seccion
                clave="unsaved"
                icono={<Save size={16} aria-hidden="true" class="text-neutral-500" />}
                titulo={t("spaces.delete.unsaved", { count: sinGuardar().length })}
                porque={t("spaces.delete.unsaved_why")}
                filas={sinGuardar()}
              />
            </Show>
            <Show when={!props.managed && previa.error}>{(e) => <FailureNote f={asFailure(e())} />}</Show>
            <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
          </div>
          <div class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
            <Show when={!props.managed && (previa.error || tardando())}>
              <Button variant="secondary" size="sm" disabled={borrando()} onClick={() => { setTarde(false); refetch(); }}>
                {t("common.part.retry")}
              </Button>
            </Show>
            <Button ref={cancelar} variant="secondary" size="sm" disabled={borrando()} onClick={() => props.onCerrar()}>
              {t("spaces.delete.cancel")}
            </Button>
            <Button variant="danger" size="sm" disabled={(!props.managed && (!previa() || !!previa()?.last)) || borrando()} onClick={() => void confirmar()}>
              {boton()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Show>
  );
}
