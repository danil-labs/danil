import { invoke } from "../../../engine-client/src/client.ts";
import { For, Match, Show, Switch, createSignal, onMount } from "solid-js";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { TriangleAlert } from "lucide-solid";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import { Button } from "../../../ui/src/Button";
import { SettingsBlock, SettingsRow, SettingsSection } from "./layout";
import { FailureNote, asFailure, type Failure } from "../../../ui/src/Failure";
import { lengua, t } from "../../../../apps/desktop/src/lib/i18n";
import { prosa } from "../../../../apps/desktop/src/lib/prose";
import { releaseNotes } from "../../../../apps/desktop/src/lib/releaseNotes";

/**
 * Si hay una versión nueva, y ponerla.
 *
 * **La llave pública viaja dentro del binario** (`tauri.conf.json`) y es contra
 * ella que se comprueba la firma de lo que se baja. Una copia instalada sin esa
 * llave **no se puede actualizar nunca** — no hay a quién preguntarle—, así que
 * tiene que existir antes de la primera entrega. Por lo mismo **la llave privada
 * no se puede perder**: sin ella no se firma una versión nueva y todas las
 * copias instaladas se quedan donde están.
 *
 * **Comprueba al abrir Configuración, no en bucle.** Cada comprobación es una
 * petición de red, y ese es el momento en que alguien está mirando su
 * instalación.
 *
 * **No poder preguntar NO es estar al día**, y por eso el estado es una sola
 * señal ({@link Version}) con cuatro formas excluyentes por construcción. Con
 * `estado` y `fallo` separados, un `catch` que ponga las dos deja en pantalla
 * «Tienes la versión más reciente» encima de «No pude comprobar si hay una
 * versión nueva»: la primera es falsa justo cuando aparece la segunda y es la
 * que la gente lee. Aquí el fallo solo tiene dónde guardarse dentro de
 * `sin-respuesta`, así que la contradicción no se puede escribir. El error de la
 * descarga vive dentro de `hay`, que es donde ocurre — compartiendo señal se
 * pintaba con la frase de la comprobación.
 *
 * **Un fallo aquí no es un fallo de la app, y aun así se ve distinto.** Sin red
 * la app funciona igual sin saber si hay versión nueva, así que `sin-respuesta`
 * es amarillo y no rojo — pero es amarillo: color, icono y recuadro propios.
 * Distinguirlo solo por el texto lo deja leerse como el renglón gris de al lado,
 * que es el que dice que estás al día. Lo que contesta el plugin —`Could not
 * fetch a valid release JSON from the remote`— sirve para reportar el fallo, no
 * para leerlo, así que va plegado debajo de la frase que sí se puede usar.
 */

/**
 * Lo único que esta pantalla sabe de la versión, y solo una cosa a la vez.
 *
 * `hay` se lleva su propio paso y su propio fallo dentro: fuera de esa forma no
 * hay ninguna versión nueva que bajar, así que «bajando» sin actualización no
 * existe.
 */
type Version =
  | { t: "mirando" }
  | { t: "al-dia" }
  /** Se preguntó y no se pudo saber. `crudo` es para reportar, no para leer. */
  | { t: "sin-respuesta"; crudo: string }
  | {
      t: "hay";
      u: Update;
      paso: "quieto" | "bajando" | "listo";
      /** Falló la descarga. La comprobación ya salió bien: sigue habiendo versión. */
      fallo: Failure | null;
      /** Qué retiene el servicio, cuando no se pudo detener. */
      ocupan: Ocupacion | null;
    };

/**
 * Lo arma el servicio (`lifecycle::quien_ocupa`). Un servicio de otra versión
 * puede no traer algún campo.
 */
type Ocupacion = {
  tasks?: { title: string }[];
  elsewhere?: { workspace: string; count: number }[];
  operations?: { command: string }[];
  downloading?: boolean;
};

function ocupacionDe(e: unknown): Ocupacion | null {
  return e && typeof e === "object" && "busy" in e ? (e as { busy: Ocupacion }).busy : null;
}

/** Estrecha sin castear, que es lo que permite leer una forma en el render. */
function es<T extends Version["t"]>(v: Version, forma: T): v is Extract<Version, { t: T }> {
  return v.t === forma;
}

export default function Actualizacion(props: { build?: string }) {
  const [version, setVersion] = createSignal<Version>({ t: "mirando" });
  const [instalada, setInstalada] = createSignal<string | null>(null);

  const hay = () => {
    const v = version();
    return es(v, "hay") ? v : null;
  };
  const sinRespuesta = () => {
    const v = version();
    return es(v, "sin-respuesta") ? v : null;
  };

  async function mirar() {
    const actual = hay();
    if (actual && actual.paso !== "quieto") return;
    setVersion({ t: "mirando" });
    try {
      const u = await check();
      setVersion(u ? { t: "hay", u, paso: "quieto", fallo: null, ocupan: null } : { t: "al-dia" });
    } catch (e) {
      // `asFailure` ya separa la frase del crudo; aquí la frase la pone la
      // pantalla, porque solo aquí se sabe qué se estaba preguntando.
      const f = asFailure(e);
      setVersion({ t: "sin-respuesta", crudo: f.detail || prosa(f.what) });
    }
  }

  onMount(() => {
    void mirar();
    void getVersion()
      .then(setInstalada)
      .catch(() => {});
  });

  async function poner() {
    let v = version();
    if (!es(v, "hay") || v.paso !== "quieto") return;
    setVersion({ ...v, paso: "bajando", fallo: null, ocupan: null });
    let stopped = false;
    let checked = false;
    try {
      const u = await check();
      checked = true;
      if (!u) {
        setVersion({ t: "al-dia" });
        return;
      }
      v = { ...v, u };
      setVersion({ ...v, paso: "bajando", fallo: null, ocupan: null });
      await invoke("service_prepare_update");
      stopped = true;
      // En Windows `downloadAndInstall` cierra la app; Rust instala sin cerrarla.
      await invoke("update_install");
      setVersion({ ...v, paso: "listo", fallo: null, ocupan: null });
    } catch (e) {
      if (!checked) {
        const f = asFailure(e);
        setVersion({ t: "sin-respuesta", crudo: f.detail || prosa(f.what) });
        return;
      }
      await invoke("service_cancel_update");
      setVersion({
        ...v,
        paso: "quieto",
        fallo: { ...asFailure(e), what: stopped ? t("settings.update.error_download") : t("settings.update.service_busy") },
        ocupan: stopped ? null : ocupacionDe(e),
      });
    }
  }

  return (
    <SettingsSection title={t("settings.update.title")}>
      <SettingsRow
        label={
          <span title={props.build}>{t("settings.update.current", { version: instalada() ?? "" })}</span>
        }
        description={
          <>
            {/* Un `Switch`, y no cuatro `Show`: cuatro condiciones sueltas vuelven a
                admitir que dos se cumplan a la vez. */}
            <Switch>
              <Match when={version().t === "mirando"}>{t("settings.update.checking")}</Match>

              {/* «Al día» solo se dice después de mirar y con respuesta. */}
              <Match when={version().t === "al-dia"}>{t("settings.update.uptodate")}</Match>

              <Match when={hay()}>
                {(v) => (
                  <>
                    {/* El número va en su propio `span` para poder ir en negrita, así
                        que la frase es un rótulo y no lleva el dato dentro. */}
                    {t("settings.update.available")}{" "}
                    <span class="font-semibold text-neutral-950">{v().u.version}</span>
                  </>
                )}
              </Match>
            </Switch>
          </>
        }
      >
        <Switch>
          <Match when={hay()}>
            {(v) => (
              <Show when={v().paso === "quieto"}>
                <Button variant="primary" size="sm" onClick={() => void poner()}>
                  {t("settings.update.install")}
                </Button>
              </Show>
            )}
          </Match>
          <Match when={!hay()}>
            <Button
              variant="secondary"
              size="sm"
              disabled={version().t === "mirando"}
              onClick={() => void mirar()}
            >
              <RefreshCw size={14} />
              {t("settings.update.check")}
            </Button>
          </Match>
        </Switch>
      </SettingsRow>

      <Show when={sinRespuesta()}>
        {(s) => (
          <SettingsBlock>
            <div class="grid gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2.5">
              <p class="m-0 flex items-start gap-1.5 text-ui font-semibold text-warning-strong">
                <TriangleAlert size={14} class="mt-0.5 shrink-0" />
                <span>{t("settings.update.unreachable")}</span>
              </p>
              <p class="m-0 text-xs text-neutral-500">
                {t("settings.update.unreachable_hint")}
              </p>

              {/* Plegado y al final: hace falta para reportar el fallo y no
                  significa nada para quien lo tiene delante. */}
              <details>
                <summary class="cursor-pointer text-xs text-neutral-500">
                  {t("settings.update.detail")}
                </summary>
                <p class="m-0 mt-1 font-mono text-caption break-all whitespace-pre-wrap text-neutral-500">
                  {s().crudo}
                </p>
              </details>
            </div>
          </SettingsBlock>
        )}
      </Show>

      <Show when={hay()}>
        {(v) => (
          <Show
            when={
              releaseNotes(v().u, lengua()) ||
              v().paso !== "quieto" ||
              v().fallo ||
              v().ocupan
            }
          >
            <SettingsBlock>
              <Show when={releaseNotes(v().u, lengua())}>
                <p class="m-0 whitespace-pre-wrap text-xs text-neutral-500">{releaseNotes(v().u, lengua())}</p>
              </Show>

              <Show when={v().paso === "bajando"}>
                <p class="m-0 text-xs text-neutral-500">{t("settings.update.downloading")}</p>
              </Show>

              {/* Reiniciar es un acto de la persona y no de la app: un turno en
                  vuelo se pierde entero al cerrarse —la respuesta y su consumo se
                  guardan al cerrar el turno— así que quien sabe si hay algo
                  corriendo es quien está delante. */}
              <Show when={v().paso === "listo"}>
                <p class="m-0 text-xs text-neutral-500">{t("settings.update.ready")}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  class="justify-self-start"
                  onClick={() => void invoke("restart_app")}
                >
                  {t("settings.update.relaunch")}
                </Button>
              </Show>

              <Show when={v().fallo}>{(f) => <FailureNote f={f()} />}</Show>
              <Show when={v().ocupan}>{(o) => <Ocupan o={o()} />}</Show>
            </SettingsBlock>
          </Show>
        )}
      </Show>
    </SettingsSection>
  );
}

function Ocupan(props: { o: Ocupacion }) {
  const tasks = () => props.o.tasks ?? [];
  const elsewhere = () => props.o.elsewhere ?? [];
  const operations = () => props.o.operations ?? [];
  return (
    <div class="grid gap-1 text-xs text-neutral-500">
      <Show when={tasks().length || elsewhere().length}>
        <p class="m-0">{t("settings.update.busy_tasks")}</p>
        <ul class="m-0 grid gap-0.5 pl-4">
          <For each={tasks()}>{(tarea) => <li class="font-semibold">{tarea.title}</li>}</For>
          <For each={elsewhere()}>
            {(otro) => <li>{t("settings.update.busy_elsewhere", { count: otro.count, workspace: otro.workspace })}</li>}
          </For>
        </ul>
      </Show>
      <Show when={operations().length}>
        <p class="m-0">{t("settings.update.busy_operations")}</p>
        <ul class="m-0 grid gap-0.5 pl-4 font-mono">
          <For each={operations()}>{(abierta) => <li>{abierta.command}</li>}</For>
        </ul>
      </Show>
      <Show when={props.o.downloading}>
        <p class="m-0">{t("settings.update.busy_download")}</p>
      </Show>
    </div>
  );
}
