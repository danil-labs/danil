import { Show, createEffect, createSignal } from "solid-js";
import { memoryEntryText } from "../model/memory.ts";
import { writeMemoryEntry } from "../queries";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { asFailure, FailureNote, type Failure } from "../../../../ui/src/Failure";
import { Input } from "../../../../ui/src/Input";
import { Textarea } from "../../../../ui/src/Textarea";
import { enfocar } from "../../../../ui/src/lib/focus";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { MemoriaEntrada, MemoriaScope } from "../../../../ui/src/lib/model";
import { type EntradaDeCuenta, type MemoriaDeCuenta, writeMemoryFile } from "../queries/memory-account";

/**
 * El mismo formulario para escribir y para editar. `file` es la identidad:
 * al editar se manda fija, y escribir con el mismo nombre reescribe el
 * cuerpo en el sitio en vez de dejar una segunda versión. Igual en los tres
 * alcances: el motor ya guarda `workspace` en el mismo formato que `project`.
 */
export function FormularioDeEntrada(props: {
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
        await writeMemoryEntry({
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
