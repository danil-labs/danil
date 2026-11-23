import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { AvanceDeDescarga, BarraDeCarga, CodigoParaConfirmar, Peso } from "./DownloadProgress";
import Check from "lucide-solid/icons/check";
import FileText from "lucide-solid/icons/file-text";
import { For, Match, Show, Switch } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { CancelButton, RemoveButton } from "../../../../ui/src/IconAction";
import { Spinner } from "../../../../ui/src/Spinner";
import { ErrorDeTarjeta } from "./ConnectAI";
import { explicar } from "../queries/connect-store";
import {
  disconnectGitHost,
  disconnectGoogleDrive,
  disconnectKnownMcp,
  getZoteroBibLinks,
  openGoogleDriveDesktop,
  openZotero,
  setGoogleDriveDesktopUse,
  syncZoteroBibs,
  unlinkZoteroBib,
} from "../queries";
import { type Integracion, type IntegracionesProps, nombreDeArchivo } from "../model/tool-cards";
import { createEstadoDeIntegraciones } from "../queries/integrations-state";
import { createConexiones } from "../queries/integrations-connect";
import { createFormulario } from "./IntegrationForm";
import { MarcaIntegracion, VerMas } from "./ToolCardParts";

/** Las integraciones: cada tarjeta mide lo mismo en todos sus estados y se conecta o desconecta en su sitio. */
export function Integraciones(props: IntegracionesProps) {
  const estado = createEstadoDeIntegraciones(props);
  const conexiones = createConexiones(props, estado);
  const { integraciones, estados, setEstados, errores, setErrores, verMas, setVerMas, falloDeCarga, escritorio, setEscritorio, zotero, bibs, setBibs, sincronizandoBibs, setSincronizandoBibs, oficial, scope, guardado, contarConectadas, formularioAbierto, detalle } = estado;
  const { cargar, conectar, cancelar } = conexiones;
  const { Formulario } = createFormulario(estado, conexiones);
  async function desconectar(i: Integracion) {
    setErrores(i.id, null);
    // Solo deja de usarla Terminus: la app de Google sigue instalada y con su sesión.
    if (i.via === "drive" && oficial()) {
      try {
        await setGoogleDriveDesktopUse(false);
        setEscritorio((o) => (o ? { ...o, unused: true } : o));
      } catch (e) {
        setErrores(i.id, explicar(e));
      }
      setEstados(i.id, guardado(i));
      return contarConectadas();
    }
    setEstados(i.id, { k: "saliendo" });
    try {
      if (i.via === "drive") await disconnectGoogleDrive();
      else if (i.via === "proveedor") await disconnectGitHost(i.id, await scope);
      else await disconnectKnownMcp(i.id);
    } catch (e) {
      setErrores(i.id, explicar(e));
    }
    setEstados(i.id, { k: "libre" });
    await cargar();
  }

  function Tarjeta(p: { i: Integracion }) {
    const e = () => estados[p.i.id];
    const nombre = p.i.nombre;
    const fallo = () => Boolean(errores[p.i.id]) && !formularioAbierto(p.i);
    const cancelarEsta = () => (
      <CancelButton label={t("onboarding.tools.cancel_connect", { name: nombre })} onClick={() => void cancelar(p.i)} />
    );
    // El aviso de Zotero se despliega dentro de su tarjeta, no en una caja aparte.
    const permiso = () => p.i.id === "zotero" && e()?.k === "permiso";
    return (
      <div
        class={cn(
          "relative grid overflow-hidden rounded-lg border",
          permiso() && "sm:col-span-2",
          e()?.k === "conectada" && p.i.via !== "incluido" && "border-success-strong/40 bg-success/5",
          ["conectando", "formulario", "descargando", "instalando", "sesion", "abriendo", "permiso"].includes(e()?.k ?? "") && "border-primary bg-primary/5",
          (!e() || ["libre", "saliendo", "detectada"].includes(e()!.k) || p.i.via === "incluido") && "border-border bg-surface-raised",
          // Al final: `cn` deja la última clase de borde, y un fallo tiene que verse rojo.
          fallo() && "animate-sacudir border-error-strong bg-surface-raised",
        )}
      >
        <div class="relative flex h-[56px] items-center gap-3 px-3 py-2">
        <span class="grid size-[26px] shrink-0 place-items-center rounded-md bg-surface-muted text-neutral-950">
          <MarcaIntegracion id={p.i.id} size={15} />
        </span>
        <span class="grid min-w-0 flex-1 gap-px">
          <strong class="truncate text-ui font-semibold text-neutral-950">{nombre}</strong>
          <span class={cn("truncate text-caption", fallo() ? "text-error-strong" : "text-neutral-500")} title={fallo() ? (errores[p.i.id] ?? "") : detalle(p.i)}>
            {fallo() ? errores[p.i.id] : detalle(p.i)}
          </span>
        </span>
        <span class="flex w-[148px] shrink-0 items-center justify-end gap-1.5">
          <Switch
            fallback={
              <>
                <Show when={fallo()}>
                  <TriangleAlert size={15} class="shrink-0 text-error-strong" aria-hidden="true" />
                </Show>
                <Show when={!fallo() && p.i.via === "drive" && oficial() && !escritorio()?.installed}>
                  <Peso bytes={escritorio()?.installer_bytes} />
                </Show>
                <Show when={!fallo() && p.i.id === "zotero" && zotero() && !zotero()!.installed}>
                  <Peso bytes={zotero()?.installer_bytes} />
                </Show>
                <Button size="compact" variant="secondary" onClick={() => void conectar(p.i)}>
                  {fallo() ? t("onboarding.ai.retry") : t("onboarding.ai.connect")}
                </Button>
              </>
            }
          >
            <Match when={p.i.via === "incluido"}>
              <Badge tone="success" class="gap-1">
                <Check size={11} stroke-width={3} aria-hidden="true" />
                {t("onboarding.tools.included")}
              </Badge>
            </Match>
            <Match when={e()?.k === "conectada"}>
              <Badge tone="success" class="gap-1">
                <Check size={11} stroke-width={3} aria-hidden="true" />
                {t("onboarding.tools.connected")}
              </Badge>
              {/* Zotero no tiene sesión que cerrar: es la app de la persona. */}
              <Show when={p.i.id !== "zotero"}>
                <RemoveButton
                  icon="unlink"
                  label={p.i.via === "drive" && oficial() ? t("onboarding.tools.drive_app.stop") : t("onboarding.ai.disconnect", { name: nombre })}
                  onClick={() => void desconectar(p.i)}
                />
              </Show>
            </Match>
            <Match when={e()?.k === "abriendo"}>
              <Spinner size={18} class="text-primary" />
              {cancelarEsta()}
            </Match>
            <Match when={e()?.k === "permiso"}>{null}</Match>
            <Match when={e()?.k === "detectada"}>
              <Button size="compact" variant="secondary" onClick={() => void conectar(p.i)}>
                {p.i.via === "drive" ? t("onboarding.ai.use_this") : t("onboarding.tools.authorize")}
              </Button>
            </Match>
            <Match when={e()?.k === "instalando"}>
              <Spinner size={18} class="text-primary" />
            </Match>
            <Match when={e()?.k === "sesion"}>
              <Button
                size="compact"
                variant="secondary"
                onClick={() => void openGoogleDriveDesktop().catch((x) => setErrores(p.i.id, explicar(x)))}
              >
                {t("onboarding.tools.drive_app.open")}
              </Button>
              {cancelarEsta()}
            </Match>
            <Match when={e()?.k === "descargando" && e()}>
              {(d) => {
                const x = () => d() as { hecho: number; total: number | null };
                return (
                  <AvanceDeDescarga
                    total={x().total}
                    cancelar={t("onboarding.tools.cancel_connect", { name: nombre })}
                    onCancelar={() => void cancelar(p.i)}
                  />
                );
              }}
            </Match>
            <Match when={e()?.k === "conectando"}>
              <Show when={(e() as { codigo?: string }).codigo} fallback={<Spinner size={18} class="text-primary" />}>
                {(c) => <CodigoParaConfirmar codigo={c()} />}
              </Show>
              <Show when={!formularioAbierto(p.i)}>{cancelarEsta()}</Show>
            </Match>
            <Match when={e()?.k === "formulario"}>{cancelarEsta()}</Match>
            <Match when={e()?.k === "saliendo"}>
              <Spinner class="text-neutral-500" />
            </Match>
          </Switch>
        </span>
        <Show when={e()?.k === "descargando" && (e() as { hecho: number; total: number | null })}>
          {(d) => <BarraDeCarga hecho={d().hecho} total={d().total} />}
        </Show>
        <Show when={e()?.k === "instalando"}>
          <BarraDeCarga hecho={0} total={null} />
        </Show>
        </div>
        <Show when={permiso()}>
          <div class="grid gap-2 border-t border-primary/30 px-3 py-3 motion-safe:animate-entrar" role="status">
            <strong class="text-ui font-semibold">{t("onboarding.tools.references.zotero_permission_title")}</strong>
            <p class="m-0 text-ui">{t("settings.references.zotero.error_local_api")}</p>
            <div class="mt-0.5 flex flex-wrap items-center gap-2">
              <span class="text-xs text-neutral-500">{t("onboarding.tools.references.zotero_permission_why")}</span>
              <span class="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => void openZotero().catch((x) => setErrores("zotero", explicar(x)))}>
                {t("onboarding.tools.references.zotero_open")}
              </Button>
              <Button size="sm" onClick={() => void conectar(p.i)}>
                {t("onboarding.ai.retry")}
              </Button>
            </div>
          </div>
        </Show>
        {/* Los `.bib` que siguen a Zotero los vincula el agente («conecta refs.bib con mi colección X»). */}
        <Show when={p.i.id === "zotero" && e()?.k === "conectada" && bibs().length > 0}>
          <div class="grid gap-1 border-t border-border px-3 py-2">
            <For each={bibs()}>
              {(b) => (
                <div class="flex min-h-7 min-w-0 items-center gap-2 text-xs">
                  <FileText size={13} class="shrink-0 text-neutral-500" aria-hidden="true" />
                  <span class="min-w-0 flex-1 truncate font-medium" title={b.archivo}>
                    {nombreDeArchivo(b.archivo)}
                  </span>
                  <span class={cn("min-w-0 truncate", b.fallo ? "text-error-strong" : "text-neutral-500")} title={b.fallo ?? undefined}>
                    {b.fallo
                      ? t("settings.references.zotero.bib_failed")
                      : b.coleccion
                        ? t("settings.references.zotero.bib_collection", { name: b.coleccion })
                        : t("settings.references.zotero.bib_cited")}
                  </span>
                  <RemoveButton
                    icon="unlink"
                    label={t("settings.references.zotero.bib_unlink", { name: nombreDeArchivo(b.archivo) })}
                    onClick={() => void desvincularBib(b.archivo)}
                  />
                </div>
              )}
            </For>
            <div class="flex justify-end">
              <Button size="sm" variant="ghost" disabled={sincronizandoBibs()} onClick={() => void sincronizarBibs()}>
                {sincronizandoBibs() ? t("settings.references.zotero.bib_syncing") : t("settings.references.zotero.bib_sync")}
              </Button>
            </div>
          </div>
        </Show>
      </div>
    );
  }

  /** «Sincronizar con Zotero»: vuelve a traer cada `.bib` vinculado; el fallo de uno queda en su fila. */
  async function sincronizarBibs() {
    setSincronizandoBibs(true);
    setErrores("zotero", null);
    try {
      setBibs(await syncZoteroBibs());
    } catch (x) {
      setErrores("zotero", explicar(x));
    } finally {
      setSincronizandoBibs(false);
    }
  }

  async function desvincularBib(archivo: string) {
    try {
      await unlinkZoteroBib(archivo);
      setBibs(await getZoteroBibLinks());
    } catch (x) {
      setErrores("zotero", explicar(x));
    }
  }

  const visibles = () => {
    const base = integraciones().filter(
      (i) =>
        i.comun ||
        (i.via !== "incluido" &&
          ["formulario", "descargando", "instalando", "sesion", "conectando", "abriendo", "permiso", "conectada"].includes(estados[i.id]?.k ?? "")),
    );
    // Por id: integraciones() arma objetos nuevos en cada lectura.
    const vistas = new Set(base.map((i) => i.id));
    return verMas() ? [...base, ...integraciones().filter((i) => !vistas.has(i.id))] : base;
  };
  // Como el diseño: la pila de «Ver más» enseña todo lo que no es común, aunque ya esté a la vista.
  const escondidas = () => integraciones().filter((i) => !i.comun);

  return (
    <>
      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <For each={visibles()}>{(i) => <Tarjeta i={i} />}</For>
      </div>
      <Show when={falloDeCarga()}>{(e) => <ErrorDeTarjeta class="rounded-md border-t" texto={e()} />}</Show>
      <For each={integraciones().filter(formularioAbierto)}>{(i) => <Formulario i={i} />}</For>
      <VerMas
        abierto={verMas()}
        resto={escondidas().map((i) => ({ id: i.id, nombre: i.nombre, icono: <MarcaIntegracion id={i.id} size={12} /> }))}
        primero={["bitbucket", "notion"]}
        onClick={() => setVerMas((v) => !v)}
      />
    </>
  );
}
