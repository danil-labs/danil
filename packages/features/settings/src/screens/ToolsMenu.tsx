import { For, Show, createSignal, onMount } from "solid-js";
import { SignalDot } from "../../../../ui/src/SignalDot";
import { listKnownMcp, listMcpServers } from "../queries/engine-mcp";
import { openExternal } from "../queries/engine-open";
import { Button } from "../../../../ui/src/Button";
import { FailureNote } from "../../../../ui/src/Failure";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { McpMark } from "../../../../ui/src/icons";
import { MarcaServicio } from "../../../../ui/src/marcas";
import { toolMarkId } from "@terminus/design";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../../../ui/src/Popover";
import { mcpLoginUrl, mcpPendingSignIn, mcpSignIn, mcpSignInFailure, mcpSignInState } from "./McpSignInNotice";
import { type Conocido, type Puesto, sinSecretos } from "./ToolsModel";

// -------------------------------------------------------------- vistazo

/**
 * Qué MCP tiene conectados este workspace, de un vistazo desde el pie del
 * riel, al lado de `WorkspaceMenu` y no dentro de Configuración: esa pantalla
 * conecta y administra, y para «¿qué tiene puesto este cliente ahora mismo?»
 * era una puerta de más.
 *
 * Reusa `list_known_mcp` / `list_mcp_servers`, mismos datos que la pantalla
 * completa, y no llama a `check_mcp`: la comprobación en vivo es una
 * petición de red por servidor, y esto es un vistazo bajo demanda.
 *
 * No pinta verde nada: ese color es «se le habló en MCP y contestó»
 * (`estado`, arriba), y este vistazo nunca hace esa llamada. Un local sin
 * nada escuchando se marca en ámbar —dato gratis, un `connect_timeout` de
 * TCP—: un local muerto rompe todos los turnos de este workspace.
 *
 * Ícono chico siempre, sin variante con rótulo: va al lado de `WorkspaceMenu`
 * y del ícono de Configuración, a la misma altura; un botón del tamaño de
 * «Nueva tarea» pesaría como una acción, y esto es una consulta de estado.
 */
export function ConexionesMenu(props: {
  /** Abre Configuración en el panel de Conexiones. */
  onManage: () => void;
  /** El tamaño del disparador donde lo monten. */
  triggerClass?: string;
}) {
  const [conocidos, setConocidos] = createSignal<Conocido[]>([]);
  const [puestos, setPuestos] = createSignal<Puesto[]>([]);
  const [abierto, setAbierto] = createSignal(false);

  async function cargar() {
    try {
      const [c, p] = await Promise.all([
        listKnownMcp<Conocido[]>(),
        listMcpServers<Puesto[]>(),
      ]);
      setConocidos(c);
      setPuestos(sinSecretos(p));
    } catch {
      // Un vistazo que no pudo cargar se queda vacío: la razón, si hay
      // alguna que decir, la explica la pantalla completa detrás de
      // «Administrar», que es la que ya sabe pintar un `Failure`.
    }
  }

  // Al montar, para que el punto del disparador no dependa de haber abierto el
  // panel una vez, y otra vez cada apertura: lo declarado pudo cambiar desde
  // Configuración mientras el riel seguía a la vista.
  onMount(() => void cargar());

  const conectados = () => conocidos().filter((c) => c.conectado);
  /** Igual que `aMano` de arriba: de `conocidos()`, no de una lista aparte. */
  const declaradas = () => new Set(conocidos().map((c) => c.clave));
  const manuales = () => puestos().filter((p) => !declaradas().has(p.name));
  const pendientes = () => new Set(mcpPendingSignIn().map((s) => s.name));
  /** Los que piden sesión y no aparecen en ninguna de las dos listas. */
  const sueltos = () => {
    const vistos = new Set([...conectados().map((c) => c.clave), ...manuales().map((p) => p.name)]);
    return mcpPendingSignIn().filter((s) => !vistos.has(s.name));
  };
  const total = () => conectados().length + manuales().length + sueltos().length;

  /**
   * Un renglón del menú. La dirección no se pinta: va en el `title`, a la
   * vista solo con el puntero encima. Si el servidor pide sesión, el renglón
   * entero es el botón que la inicia; el punto rojo solo lo señala.
   */
  const Renglon = (p: { name: string; label: string; marca?: string; detalle?: string; muerto?: boolean }) => {
    // Sin grupo (el CLI de Danil, uno pegado a mano) el nombre del servidor
    // sigue diciendo de qué servicio es; sin esto la fila queda sin marca.
    const marca = () => toolMarkId(p.marca ?? p.name);
    const pide = () => pendientes().has(p.name);
    const estado = () => mcpSignInState(p.name);
    const aviso = () => (estado() === "retry" ? t("mcp.task.sign_in_again") : t("mcp.task.sign_in"));
    const contenido = () => (
      <>
        <Show when={marca()}>{(id) => <MarcaServicio id={id()} size={14} />}</Show>
        <span class="min-w-0 flex-1 truncate">{p.label}</span>
      </>
    );
    return (
      <li>
        <Show
          when={pide()}
          fallback={
            <div class="flex min-h-8 items-center gap-2 px-2 py-1 text-ui" title={p.detalle || undefined}>
              {contenido()}
              {/* Ámbar si está muerto, verde si está puesto y sano. */}
              <SignalDot tone={p.muerto ? "warning" : "success"} title={p.muerto ? t("settings.tools.dead_now") : undefined} />
            </div>
          }
        >
          <button
            role="menuitem"
            class={cn(ITEM_DE_MENU, "flex min-h-8 items-center gap-2 py-1")}
            title={p.detalle ? `${aviso()} · ${p.detalle}` : aviso()}
            aria-label={`${aviso()}: ${p.label}`}
            onClick={() => {
              // Esperando al navegador: el clic vuelve a abrir la página, no
              // lanza otro login.
              if (estado() !== "waiting") return void mcpSignIn(p.name);
              const u = mcpLoginUrl();
              if (u) void openExternal({ target: u });
            }}
          >
            {contenido()}
            <Show
              when={estado() === "waiting"}
              fallback={<SignalDot tone="error" />}
            >
              <span class="shrink-0 text-caption text-neutral-500">
                {mcpLoginUrl() ? t("settings.tools.open_login") : t("settings.tools.opening")}
              </span>
            </Show>
          </button>
        </Show>
      </li>
    );
  };

  return (
    <Popover
      open={abierto()}
      onOpenChange={(v) => {
        setAbierto(v);
        if (v) void cargar();
      }}
      placement="right-end"
      gutter={4}
    >
      <PopoverTrigger
        as={(p: object) => (
          <Button
            {...p}
            variant="ghost"
            size="icon"
            class={cn("relative size-7 shrink-0 text-neutral-500", props.triggerClass)}
            aria-haspopup="menu"
            aria-label={t("shell.sidebar.mcp.trigger")}
            title={t("shell.sidebar.mcp.trigger")}
          >
            <McpMark size={props.triggerClass ? 16 : 14} />
            {/* Sin contador: solo el punto, arriba, cuando alguno pide sesión. */}
            <Show when={pendientes().size > 0}>
              <SignalDot tone="error" class="absolute top-0.5 right-0.5" />
            </Show>
          </Button>
        )}
      />

      <PopoverContent
        role="menu"
        class="grid w-[260px] grid-cols-[minmax(0,1fr)] gap-0.5 p-1"
        // Mismo motivo que en `WorkspaceMenu`: con una lista variable el
        // primer renglón no es fiable como «el que importa»; nada se enfoca
        // solo al abrir.
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <Show
          when={total() > 0}
          fallback={
            <p class="m-0 px-2 py-1.5 text-xs text-neutral-500">
              {t("shell.sidebar.mcp.empty")}
            </p>
          }
        >
          <ul class="m-0 grid min-w-0 list-none gap-0.5 p-0">
            <For each={conectados()}>
              {(c) => (
                <Renglon
                  name={c.clave}
                  label={c.name}
                  marca={c.grupo}
                  detalle={puestos().find((p) => p.name === c.clave)?.detalle}
                  muerto={c.escuchando === false}
                />
              )}
            </For>
            <For each={manuales()}>
              {(p) => <Renglon name={p.name} label={p.name} detalle={p.detalle || t("settings.tools.no_source")} />}
            </For>
            <For each={sueltos()}>{(p) => <Renglon name={p.name} label={p.name} />}</For>
          </ul>
        </Show>
        <Show when={mcpSignInFailure()}>{(f) => <FailureNote f={f()} />}</Show>

        <span class="my-1 h-px bg-border" />
        <button
          role="menuitem"
          class={ITEM_DE_MENU}
          onClick={() => {
            setAbierto(false);
            props.onManage();
          }}
        >
          {t("shell.sidebar.mcp.manage")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
