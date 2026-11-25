import { Show, Suspense, lazy } from "solid-js";
import Navegador from "lucide-solid/icons/external-link";
import IconoDescarga from "lucide-solid/icons/download";
import IconoCodigo from "lucide-solid/icons/code";
import IconoLado from "lucide-solid/icons/columns-2";
import IconoPrevia from "lucide-solid/icons/eye";
import IconoCambios from "lucide-solid/icons/git-compare";
import { Button } from "../../../../ui/src/Button";
import { FailureNote } from "../../../../ui/src/Failure";
import { cn } from "../../../../ui/src/lib/utils";
import { HEADER_HEIGHT } from "../../../../host/src/window";
import { t } from "../../../../ui/src/lib/i18n";
import { ariaDeAtajo, textoDeAtajo } from "../../../../ui/src/lib/shortcuts";
import { comoDiff } from "../model/diff";
import { CuerpoDeArchivo, SelectorDeDisposicion } from "../components/Changes";
import { cargarEditor } from "../model/editorLoad";
import { alternarAjuste, esAtajoDeAjuste } from "../../../../ui/src/lib/wrap";
import PaginaEnVivo from "../components/PagePreview";
import { consumirSalto } from "../queries/typst";
import { type VisorProps, reparto, extension } from "./file-viewer-model";
import { Divisor, Migas, BotonDeBarra, Previa, BarraDeEstado } from "./file-viewer-parts";
import { CON_SU_APP, Cuerpo } from "./file-viewer-body";
import { type EstadoDelVisor } from "./file-viewer-state";
import { type DisposicionDelVisor } from "./file-viewer-layout";
import { type MarcasDelVisor } from "./file-viewer-marks";
import { type LecturaDelVisor } from "./file-viewer-io";
import { type TypstDelVisor } from "./file-viewer-typst";

const EditorDeCodigo = lazy(cargarEditor);
const VistaPreviaTypst = lazy(() => import("./TypstPreview"));
const VistaTypstExportada = lazy(() => import("./TypstExportPreview"));

/** Lo que pinta el visor de archivos con su estado: la barra, los avisos, el código y la vista previa. */
export function vistaDelVisor(props: VisorProps, deps: EstadoDelVisor & DisposicionDelVisor & MarcasDelVisor & LecturaDelVisor & TypstDelVisor) {
  const {
    previa, contenido, diff, leyendo, comparando, fallo, borrador, setBorrador, guardando, desincronizado,
    borrado, falloAfuera, hayCambios, deCodigo, editable, esTexto, sucio, textoActual, typst, vistaTypst,
    typstExportado, guardaSolo, conPrevia, disposicion, ladoCodigo, ladoPrevia, elegir, marcas, irA,
    irAlDiagnostico, partida, pagina, verCambios, mostrarCambios, alternarCambios, cursor, setCursor,
    lenguaje, guardar, conDescarga, canOpenExternal, bajando, bajar, openExternal, conEditor, leerParte,
    pedirOffice, descartar, conGuardadoManual, textoDeLaPrevia, dondeTypst, mostrarEnLaVista,
  } = deps;
  let fila: HTMLDivElement | undefined;

  return (
    <div
      tabindex="-1"
      classList={{ "outline-none": true }}
      onKeyDown={(e) => {
        // Desde la vista previa el editor está escondido y su Mod-s no oye nada.
        if (!e.defaultPrevented && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && editable()) {
          e.preventDefault();
          void guardar();
          return;
        }
        if (!esAtajoDeAjuste(e)) return;
        e.preventDefault();
        alternarAjuste();
      }}
      class="@container flex h-full min-h-0 flex-col"
    >
      {/* Los controles de escritura van en esta fila: es la única que está siempre. */}
      <div class={cn("flex shrink-0 items-center gap-2 border-b border-border pr-1.5 pl-2.5", HEADER_HEIGHT)}>
        <Migas ruta={props.ruta}>
          <Show when={sucio() || guardando()}>
            <span
              title={
                desincronizado()
                  ? t("code.file.save.over_agent")
                  : guardaSolo() && editable()
                    ? t("code.typst.autosave.title")
                    : t("code.file.save.title")
              }
              class="shrink-0 text-caption text-warning-strong"
            >
              ●
            </span>
          </Show>
        </Migas>

        <span aria-live="polite" class="sr-only">
          {guardando() ? t("code.file.saving") : ""}
        </span>

        <Show when={conGuardadoManual()}>
          <Button
            variant="ghost"
            size="compact"
            class="shrink-0"
            disabled={guardando() || props.readOnly}
            onClick={descartar}
            title={desincronizado() ? t("code.file.discard.keep_agent") : t("code.file.discard.leave")}
          >
            {t("code.file.discard")}
          </Button>
          <Button
            variant="secondary"
            size="compact"
            class="shrink-0"
            disabled={guardando() || props.readOnly}
            onClick={() => void guardar()}
            aria-keyshortcuts={ariaDeAtajo("saveFile")}
            title={
              desincronizado()
                ? t("code.file.save.over_agent")
                : `${t("code.file.save.title")} (${textoDeAtajo("saveFile")})`
            }
          >
            {t("code.file.save")}
          </Button>
        </Show>

        <Show when={hayCambios() && !previa()}>
          <BotonDeBarra
            pulsado={verCambios()}
            titulo={t("code.file.changes.title")}
            onClick={alternarCambios}
          >
            <IconoCambios size={13} aria-hidden="true" />
            <span class="sr-only">{t("code.file.view.changes")}</span>
          </BotonDeBarra>
        </Show>
        <Show when={mostrarCambios()}>
          <div class="flex @max-[560px]:hidden"><SelectorDeDisposicion /></div>
        </Show>

        <Show when={conPrevia()}>
          <div role="group" aria-label={t("code.file.layout.label")} class="flex shrink-0 gap-0.5">
            <BotonDeBarra pulsado={disposicion() === "codigo"} onClick={() => elegir("codigo")} titulo={t("code.file.layout.code")}>
              <IconoCodigo size={13} aria-hidden="true" />
              <span class="sr-only">{t("code.file.layout.code")}</span>
            </BotonDeBarra>
            <BotonDeBarra pulsado={disposicion() === "lado"} onClick={() => elegir("lado")} titulo={t("code.file.layout.split.title")} class="@max-[560px]:hidden">
              <IconoLado size={13} aria-hidden="true" />
              <span class="sr-only">{t("code.file.layout.split")}</span>
            </BotonDeBarra>
            <BotonDeBarra pulsado={disposicion() === "previa"} onClick={() => elegir("previa")} titulo={t("code.file.view.preview")}>
              <IconoPrevia size={13} aria-hidden="true" />
              <span class="sr-only">{t("code.file.view.preview")}</span>
            </BotonDeBarra>
          </div>
        </Show>

        {/* Los scripts se muestran en su carpeta; no se ejecutan al abrirlos. */}
        <Show when={canOpenExternal()}>
          <Button
            variant="ghost"
            size="compact"
            class="shrink-0 gap-1.5 text-neutral-500"
            title={t("code.file.open_external.title")}
            onClick={() => void openExternal()}
          >
            <Navegador size={13} aria-hidden="true" />
            <span class="sr-only">{CON_SU_APP.includes(extension(props.ruta)) ? t("code.file.open_with_app") : t("code.file.open_external")}</span>
          </Button>
        </Show>
        <Show when={conDescarga()}>
          <Button
            variant="ghost"
            size="compact"
            class="shrink-0 gap-1.5 text-neutral-500"
            title={bajando() ? t("code.file.download.busy") : t("code.file.download")}
            disabled={bajando()}
            onClick={() => void bajar()}
          >
            <IconoDescarga size={13} aria-hidden="true" />
            <span class="sr-only">{bajando() ? t("code.file.download.busy") : t("code.file.download")}</span>
          </Button>
        </Show>
      </div>

      <Show when={borrado()}>
        <div class="flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-3 py-1.5">
          <p class="m-0 min-w-0 flex-1 text-caption text-warning-strong">{t("code.file.deleted")}</p>
          <Button variant="ghost" size="compact" class="shrink-0" disabled={guardando() || props.readOnly} onClick={() => props.onBorrado?.()}>
            {t("code.file.deleted.close")}
          </Button>
          <Button variant="secondary" size="compact" class="shrink-0" disabled={guardando() || props.readOnly} onClick={() => void guardar()}>
            {t("code.file.deleted.save")}
          </Button>
        </div>
      </Show>

      {/* Sin este aviso, guardar pisaba el turno del agente en silencio. */}
      <Show when={desincronizado()}>
        <p class="m-0 border-b border-border bg-surface-raised px-3 py-2 text-caption text-warning-strong">
          {t("code.file.raced")}
        </p>
      </Show>

      <Show when={falloAfuera()}>
        {(f) => (
          <div class="border-b border-border p-3">
            <FailureNote f={f()} />
          </div>
        )}
      </Show>

      <Show when={fallo()}>
        {(f) => (
          <div class="p-3">
            <FailureNote f={f()} />
          </div>
        )}
      </Show>

      {/* Solo el lado del código espera al archivo: el panel de la vista existe desde que se abre la pestaña. */}
      <div ref={fila} class="flex min-h-0 min-w-0 flex-1">
        <div
          class={cn("min-h-0 min-w-0 flex-col", ladoCodigo() ? "flex" : "hidden", !partida() && "flex-1")}
          style={partida() ? { flex: `0 0 ${reparto() * 100}%` } : undefined}
        >
          <Show
            when={contenido()}
            fallback={
              <Show when={!fallo()}>
                <p class="m-0 p-3 text-xs text-neutral-500">
                  {leyendo() ? t("code.file.opening") : t("code.file.unreadable")}
                </p>
              </Show>
            }
          >
            {(c) => (
              <>
                <Show when={mostrarCambios()}>
                  <Show
                    when={diff()}
                    fallback={
                      <p class="m-0 p-3 text-xs text-neutral-500">
                        {comparando() ? t("code.comparing") : t("code.file.gone_from_diff")}
                      </p>
                    }
                  >
                    {(d) => (
                      <div data-select-scope class="min-h-0 min-w-0 flex-1 overflow-hidden bg-surface-muted">
                        {/* Ya llega con el archivo entero de contexto: no hay tramo que traer. */}
                        <CuerpoDeArchivo archivo={d()} onDesplegar={() => {}} llena />
                      </div>
                    )}
                  </Show>
                </Show>

                <Show when={!mostrarCambios() && !editable()}>
                  <div data-select-scope class="min-h-0 min-w-0 flex-1 overflow-y-auto bg-surface-muted">
                    <Cuerpo contenido={c()} ruta={props.ruta} onOpenExternal={() => void openExternal()} pedirOffice={pedirOffice} leerParte={leerParte()} conDescarga={conDescarga()} visores={props.visores} />
                  </div>
                </Show>

                {/* Montado mientras se pueda escribir, también escondido o con un fallo encima. */}
                <Show when={conEditor() && editable()}>
                  <div class={cn("min-h-0 min-w-0 flex-1 flex-col", mostrarCambios() ? "hidden" : "flex")}>
                    <Suspense
                      fallback={<CuerpoDeArchivo archivo={comoDiff(props.ruta, c().text)} onDesplegar={() => {}} />}
                    >
                      <EditorDeCodigo
                        ruta={props.ruta}
                        texto={borrador() ?? c().text}
                        readOnly={props.readOnly}
                        onEscribir={text => { if (!props.readOnly) setBorrador(text); }}
                        onGuardar={() => void guardar()}
                        onCursor={(linea, columna) => setCursor({ linea, columna })}
                        onClic={mostrarEnLaVista}
                        marcas={marcas()}
                        irA={irA()}
                        onIdoA={consumirSalto}
                        typst={typst() && editable() ? dondeTypst : undefined}
                      />
                    </Suspense>
                  </div>
                </Show>
              </>
            )}
          </Show>
        </div>

        <Show when={partida()}>
          <Divisor fila={() => fila} />
        </Show>

        {/* Con «Código» la vista de Typst se esconde sin desmontarse: soltarla apagaría Tinymist y sus marcas. */}
        <Show when={ladoPrevia() || vistaTypst()}>
          <div
            data-select-scope
            class={cn(
              "min-h-0 min-w-0 flex-1 flex-col",
              ladoPrevia() ? "flex" : "hidden",
              !vistaTypst() && !typstExportado() && "overflow-y-auto",
              ladoCodigo() && "border-l border-border",
            )}
          >
            <Show
              when={vistaTypst()}
              fallback={
                <Show
                  when={!typstExportado()}
                  fallback={
                    <Suspense fallback={<p class="m-0 p-3 text-xs text-neutral-500">{t("code.file.opening")}</p>}>
                      <VistaTypstExportada
                        project={props.project}
                        session={props.session}
                        arbol={props.arbol}
                        ruta={props.ruta}
                        version={contenido()?.text ?? ""}
                        onIrA={irAlDiagnostico}
                        renderPdf={props.visores.pdf}
                      />
                    </Suspense>
                  }
                >
                  <Show
                    when={pagina()}
                    fallback={<Previa texto={textoDeLaPrevia()} ruta={props.ruta} aSangre={deCodigo() !== false} visores={props.visores} />}
                  >
                    {(url) => <PaginaEnVivo url={url()} nombre={props.ruta} />}
                  </Show>
                </Show>
              }
            >
              <Suspense fallback={<p class="m-0 p-3 text-xs text-neutral-500">{t("code.file.opening")}</p>}>
                <VistaPreviaTypst
                  project={props.project}
                  session={props.session}
                  arbol={props.arbol}
                  ruta={props.ruta}
                  visible={props.visible && ladoPrevia()}
                  onIrA={irAlDiagnostico}
                />
              </Suspense>
            </Show>
          </div>
        </Show>
      </div>

      {/* Con la vista de Typst la barra existe desde que abre la pestaña: aparecer al cargar encogería el hueco del PDF. */}
      <Show when={esTexto() || vistaTypst()}>
        <BarraDeEstado
          cursor={ladoCodigo() && !mostrarCambios() && editable() ? cursor() : null}
          texto={textoActual()}
          lenguaje={lenguaje()}
        />
      </Show>
    </div>
  );
}
