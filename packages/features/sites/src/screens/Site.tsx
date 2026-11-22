import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import {
  siteClose,
  siteGo,
  siteHide,
  siteNavigate,
  siteOpen,
  siteOpenExternal,
  sitePlace,
  siteReload,
} from "../queries.ts";
import { listen } from "../../../../../apps/desktop/src/lib/serviceEvents";
import { Button } from "../../../../ui/src/Button";
import { aDireccion, corta, hayCapaEncima, seguirHueco, zonasEncima } from "../../../../../apps/desktop/src/lib/sites";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { prosaDe } from "../../../../ui/src/Failure";

/**
 * Un sitio dentro de la ventana. **Lo que este componente pinta es el hueco**;
 * la página la pinta una capa nativa que flota encima.
 *
 * El motivo de que sea una capa nativa y no un `<iframe>` está en
 * `src-tauri/src/environment/sites.rs`: la política de la ventana dice `frame-src 'self'`
 * y **no se afloja** —lo que impide está medido en `tests/security/window.mjs`—,
 * mientras que un webview hijo no es contenido de este documento y trae la
 * suya.
 *
 * **Este componente posee la capa y nada más**: la crea al montarse, la mueve
 * donde esté su hueco, la esconde cuando no toca y **la cierra al
 * desmontarse**. Una capa nativa que sobreviva a su pestaña se queda flotando
 * sobre la interfaz, tapándola, sin nada en pantalla que la explique ni un gesto
 * que la cierre.
 *
 * **Se enseña con tres condiciones a la vez**: la pestaña es la activa, la capa
 * ya existe —el servidor contestó— y el DOM no tiene nada abierto sobre su hueco
 * (`lib/sites.ts` · `hayCapaEncima`). En cuanto una falla, se esconde. Esconder
 * y enseñar es barato —la página no se recarga ni pierde el scroll o lo
 * escrito—, así que el criterio puede ser estricto sin costar nada; el error
 * caro es el contrario.
 *
 * **Un webview al que no le contestan no falla: se queda vacío**, y flotando
 * sobre el DOM no deja pintar debajo nada que lo explique. Por eso el estado
 * vive aquí y la capa solo existe cuando hay algo que enseñar:
 *
 * | Estado | Qué se ve | De dónde sale |
 * |---|---|---|
 * | `abriendo` | «Abriendo…» | Rust está preguntándole al puerto (`sites::responde`, 3 s) |
 * | `cargando` · `listo` | La capa | `on_page_load` del webview, por el evento `site` |
 * | `fallo` | La frase y **Reintentar** | El puerto no contestó, o la página no terminó de cargar |
 *
 * **«No hay red» no aplica**: lo que se abre aquí escucha en esta computadora,
 * así que lo que falla es el servidor de la tarea y la frase lo dice — «revisa
 * tu conexión» mandaría a mirar donde no hay nada que ver.
 */

/** Cuánto se espera a que la página termine antes de dar la carga por perdida. */
const PACIENCIA = 20_000;

/** `inicio` es la pestaña de navegador recién abierta: no hay capa hasta que se teclea a dónde ir. */
type Estado = "inicio" | "abriendo" | "cargando" | "listo" | "fallo";

export default function Sitio(props: {
  url: string;
  visible: boolean;
  /** Pestaña de navegador (`lib/tabs.ts`): la barra se edita y la vacía empieza en `inicio`. */
  navegador?: boolean;
  /** Cada página que carga la capa, para que la pestaña diga dónde está. */
  onNavego?: (url: string) => void;
}) {
  let hueco: HTMLDivElement | undefined;
  let barra: HTMLInputElement | undefined;
  const [estado, setEstado] = createSignal<Estado>(props.url ? "abriendo" : "inicio");
  /** A dónde se abre la capa: la de la pestaña, o la que se tecleó antes de que hubiera capa. */
  const [destino, setDestino] = createSignal(props.url);
  /** Lo que hay escrito en la barra. Lo pisa cada carga, salvo mientras se escribe. */
  const [escrito, setEscrito] = createSignal(props.url);
  let escribiendo = false;
  /** Hay un `site_open` sin contestar. */
  let abriendo = false;
  /** El componente ya se desmontó: lo que llegue tarde se cierra. */
  let cerrado = false;
  let recienEnfocada = false;
  const [fallo, setFallo] = createSignal("");
  const [label, setLabel] = createSignal<string | null>(null);
  /**
   * Dónde está la capa **ahora**, que no es dónde se abrió.
   *
   * Desde que un sitio puede salir de esta computadora, la dirección con la que
   * nació deja de decir dónde estás: un enlace dentro de la página navega la
   * capa y la pestaña seguiría nombrando la primera. La manda el backend en
   * cada carga (`sites::site_open` · `on_page_load`), así que esto no adivina.
   */
  const [donde, setDonde] = createSignal(props.url);
  /**
   * Ir a lo que se tecleó en la barra. Con capa, la capa navega; sin ella —la
   * pestaña recién abierta, o una que no llegó a abrir— se abre con ese destino.
   */
  function navegarA(texto: string) {
    const url = aDireccion(texto);
    if (!url) return;
    // `donde` antes del `blur`: soltar la barra la vuelve a llenar con él.
    setDonde(url);
    setEscrito(url);
    barra?.blur();
    props.onNavego?.(url);
    const l = label();
    if (!l) {
      // Con una apertura en curso solo cambia el destino: `abrir` lo aplica
      // al volver. Una segunda capa dejaría la primera sin pestaña que la cierre.
      setDestino(url);
      if (!abriendo) void abrir();
      return;
    }
    navegar(l, url);
  }

  function navegar(l: string, url: string) {
    setEstado("cargando");
    setFallo("");
    esperar();
    void siteNavigate(l, url)
      .then(colocar)
      .catch((e) => {
        setEstado("fallo");
        setFallo(prosaDe(e));
      });
  }

  /** El último hueco medido, para poder colocar la capa al enseñarla. */
  let ultimo = { x: 0, y: 0, width: 1, height: 1 };
  let reloj: ReturnType<typeof setTimeout> | undefined;

  const esperar = () => {
    clearTimeout(reloj);
    reloj = setTimeout(() => {
      if (estado() === "listo") return;
      // Se esconde antes de contar nada: la capa está encima del hueco, así que
      // el mensaje no se vería debajo de ella.
      const l = label();
      if (l) void siteHide(l).catch(() => {});
      setEstado("fallo");
      setFallo(t("sites.error.stalled", { site: corta(donde()) }));
    }, PACIENCIA);
  };

  /**
   * Volver a intentarlo, que **no es siempre lo mismo**.
   *
   * Si la capa llegó a existir —el servidor contestó y luego la página se
   * atascó— se recarga la que hay. Abrir otra dejaría la primera viva y sin
   * pestaña que la cierre: una capa nativa huérfana flotando sobre la interfaz.
   */
  /** Un paso del historial de la capa. Ver `sites::site_go`. */
  function ir(delta: number) {
    const l = label();
    if (l) void siteGo(l, delta).catch(() => {});
  }

  function reintentar() {
    const l = label();
    if (!l) return void (destino() && abrir());
    setEstado("cargando");
    setFallo("");
    esperar();
    void siteReload(l)
      .then(colocar)
      .catch((e) => {
        setEstado("fallo");
        setFallo(prosaDe(e));
      });
  }

  /** Una sola apertura a la vez: la pestaña posee una sola capa. */
  async function abrir() {
    if (abriendo || label() || cerrado) return;
    abriendo = true;
    setEstado("abriendo");
    setFallo("");
    medir();
    const pedido = destino();
    let s: { label: string; url: string };
    try {
      s = await siteOpen({
        url: pedido,
        x: ultimo.x,
        y: ultimo.y,
        width: ultimo.width,
        height: ultimo.height,
      });
    } catch (e) {
      abriendo = false;
      if (cerrado) return;
      // Mientras fallaba se pidió otra dirección: esa es la que vale.
      if (destino() !== pedido) return void abrir();
      setEstado("fallo");
      setFallo(prosaDe(e));
      return;
    }
    abriendo = false;
    // La pestaña se cerró mientras Rust abría: la capa no tiene dueño.
    if (cerrado) return void siteClose(s.label).catch(() => {});
    setLabel(s.label);
    if (destino() !== pedido) return navegar(s.label, destino());
    setEstado("cargando");
    esperar();
    colocar();
  }

  /** El hueco tal como está ahora mismo. */
  function medir() {
    if (!hueco) return;
    const r = hueco.getBoundingClientRect();
    ultimo = { x: r.x, y: r.y, width: r.width, height: r.height };
  }

  /** Enseñar o esconder, según las tres condiciones. Es el único sitio. */
  function colocar() {
    const l = label();
    if (!l) return;
    // Se remide antes de decidir. Mientras la pestaña está escondida su
    // hueco mide 0×0 —`hidden` en el contenedor de `App.tsx`— y el observador
    // avisa **después** del efecto que la vuelve visible: sin esto, la capa
    // aparecería un fotograma en la esquina superior izquierda.
    medir();
    const puede =
      props.visible &&
      !hayCapaEncima(ultimo) &&
      estado() !== "fallo" &&
      estado() !== "abriendo" &&
      estado() !== "inicio";
    if (!puede) {
      void siteHide(l).catch(() => {});
      return;
    }
    void sitePlace({ label: l, ...ultimo }).catch(() => {});
  }

  onMount(() => {
    if (hueco) {
      seguirHueco(hueco, (h) => {
        ultimo = h;
        colocar();
      });
    }
    if (estado() !== "inicio") void abrir();

    const parar = listen<{ label: string; estado: string; url: string }>(
      "site",
      (e) => {
        if (e.payload.label !== label()) return;
        setDonde(e.payload.url);
        if (!escribiendo) setEscrito(e.payload.url);
        props.onNavego?.(e.payload.url);
        if (e.payload.estado === "listo") {
          clearTimeout(reloj);
          setEstado("listo");
        } else {
          // Navegar dentro del sitio vuelve a empezar el reloj: la página que
          // ya estaba pintada no dice nada de la que se está pidiendo.
          setEstado("cargando");
          esperar();
        }
        colocar();
      },
    );
    onCleanup(() => void parar.then((f) => f()));
  });

  // La pestaña de navegador vacía pide el foco para la barra en cuanto se ve.
  // Al montarse todavía está escondida (`hidden` en `App.tsx`) y un elemento
  // escondido no lo acepta.
  createEffect(() => {
    if (props.visible && estado() === "inicio") requestAnimationFrame(() => barra?.focus());
  });

  // Cambiar de pestaña, abrir un diálogo o pasar a `fallo` mueve la capa. Es un
  // efecto y no un manejador porque las tres condiciones son señales.
  createEffect(on([() => props.visible, zonasEncima, estado], colocar));

  onCleanup(() => {
    cerrado = true;
    clearTimeout(reloj);
    const l = label();
    if (l) void siteClose(l).catch(() => {});
  });

  return (
    // `h-full` y no `flex-1`: el contenedor de una pestaña de contenido en
    // `App.tsx` no es un flex, así que aquí `flex-1` no mide nada — y un hueco
    // de altura cero deja la capa nativa en una franja de un píxel.
    <div class="relative flex h-full flex-col">
      {/* **La barra existe desde que un sitio puede no ser de esta computadora.**
          Con solo loopback sobraba: el destino era siempre el servidor que
          acababa de levantar la tarea y no había a dónde ir. Con un dominio de
          fuera, un enlace te mueve y sin esto no sabes dónde estás ni cómo
          volver. */}
      <div class="flex items-center gap-1 border-b border-border bg-surface px-2 py-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("sites.back")}
          title={t("sites.back")}
          onClick={() => ir(-1)}
        >
          ←
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("sites.forward")}
          title={t("sites.forward")}
          onClick={() => ir(1)}
        >
          →
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("sites.reload")}
          title={t("sites.reload")}
          onClick={reintentar}
        >
          ⟳
        </Button>
        {/* En un sitio de tarea la dirección se enseña y no se edita: acompaña
            a una tarea, no es la barra de un navegador. Que se pueda leer
            entera es lo que dice si sigues donde creías. La pestaña del «+» sí
            es un navegador, y ahí se teclea. */}
        <Show
          when={props.navegador}
          fallback={
            <span class="ml-1 min-w-0 flex-1 truncate font-mono text-caption text-neutral-500">
              {donde()}
            </span>
          }
        >
          <input
            ref={barra}
            type="text"
            spellcheck={false}
            autocomplete="off"
            aria-label={t("sites.address")}
            placeholder={t("sites.address_placeholder")}
            value={escrito()}
            onFocus={(e) => {
              escribiendo = true;
              recienEnfocada = true;
              e.currentTarget.select();
            }}
            // El clic que enfoca soltaría la selección y dejaría el cursor
            // donde cayó: como en un navegador, el primero selecciona todo.
            onMouseUp={(e) => {
              if (recienEnfocada) e.preventDefault();
              recienEnfocada = false;
            }}
            onBlur={() => {
              escribiendo = false;
              setEscrito(donde());
            }}
            onInput={(e) => setEscrito(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                navegarA(e.currentTarget.value);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            class="ml-1 h-6 min-w-0 flex-1 rounded-sm border border-border bg-surface-muted px-2 font-mono text-caption text-neutral-950 outline-none placeholder:text-neutral-500 focus:border-primary"
          />
        </Show>
        {/* **La salida, y va aquí porque aquí es donde uno se queda atascado.**
            Esta capa nace en incógnito y Google bloquea por política el inicio
            de sesión en un webview embebido: un Sheet abierto aquí no se puede
            usar, y hasta ahora no había a dónde ir desde dentro. Lo que faltaba
            no era persistir sesión —eso volvería a la app depositaria de
            sesiones de terceros— era **poder salir**.

            La dirección que se manda es `donde()` y no `props.url`: si la capa
            navegó, lo que se abre fuera es lo que se está mirando y no por
            dónde se entró. */}
        <Button
          variant="ghost"
          size="sm"
          disabled={!donde()}
          aria-label={t("sites.outside")}
          title={t("sites.outside")}
          onClick={() =>
            void siteOpenExternal(donde()).catch(() => {})
          }
        >
          ↗
        </Button>
      </div>

      {/* El hueco. Está vacío a propósito: lo que se ve aquí lo pinta la capa
          nativa, que no es parte de este árbol. El fondo es el de la app y no
          blanco: mientras la capa no esté, esto es un hueco de la interfaz. */}
      <div ref={hueco} class="min-h-0 flex-1 bg-surface" />

      <Show when={estado() === "abriendo"}>
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span class="text-ui text-neutral-500">
            {t("sites.opening", { site: corta(destino()) })}
          </span>
        </div>
      </Show>

      <Show when={estado() === "inicio"}>
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span class="text-ui text-neutral-500">{t("sites.start")}</span>
        </div>
      </Show>

      <Show when={estado() === "fallo"}>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <span class="max-w-[46ch] text-ui text-neutral-700">{fallo()}</span>
          <Button variant="secondary" size="sm" onClick={reintentar}>
            {t("sites.retry")}
          </Button>
        </div>
      </Show>
    </div>
  );
}
