import { groupAccounts } from "../../../../ui/src/lib/account-usage.ts";
import { createEffect, createMemo, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { createCopied } from "../../../../host/src/clipboard";
import { type Failure, prosaDe } from "../../../../ui/src/Failure";
import { accountPresentation } from "../screens/AccountCard";
import { type Account, type AccountList, type AccountStatus, type AgentOpt, type EnEspera } from "../queries/accounts-store";
import type Accounts from "./AccountsView";

export function createCuentas(props: Parameters<typeof Accounts>[0]) {
  const { machineOf } = props.maquinas;
  const [agentes, setAgentes] = createSignal<AgentOpt[]>([]);
  const [agente] = createSignal(props.agente);
  const [lista, setLista] = createSignal<AccountList | null>(null);
  const [cargando, setCargando] = createSignal(true);
  const [estados, setEstados] = createSignal<Record<string, AccountStatus>>({});
  const agrupadas = createMemo<Account[]>(() => {
    const accounts = lista()?.accounts ?? [];
    if (!accounts.some((a) => a.machines?.length)) return accounts;
    const groups = groupAccounts(agente(), accounts.flatMap((a) => (a.machines ?? []).map((m) => ({
      machine: m.machine,
      on: m.on,
      accounts: [{ ...a, id: m.id, plan: accountPresentation(a, estados()[m.id]).plan }],
    }))));
    return groups.map((g) => ({ ...g.row, machines: g.members }));
  });
  // Cada tarjeta conserva su objeto por id: `For` las sigue por referencia, y
  // un objeto nuevo desmonta la tarjeta y vuelve a pedir su consumo. Sin esto,
  // cada `account_status` que contestaba (cambia `estados`, y con él el plan)
  // y cada refresco de la lista montaban todas las tarjetas desde cero.
  const [tarjetas, setTarjetas] = createStore<Account[]>([]);
  // Copia: `reconcile` escribe en los objetos que recibe, y son los de `lista()`.
  createEffect(() => setTarjetas(reconcile(structuredClone(agrupadas()), { key: "id" })));
  const [comprobando, setComprobando] = createSignal<Record<string, boolean>>({});
  // Las que la última consulta de estado no pudo responder. No es «sin
  // conectar» —nadie lo dijo— ni «conectada»: una cuenta cuyo `account_status`
  // se corta por plazo cada vez se veía conectada con un error encima.
  const [sinComprobar, setSinComprobar] = createSignal<Record<string, boolean>>({});
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  // Quitar borra la credencial y no se puede deshacer: el primer clic pregunta.
  const [porQuitar, setPorQuitar] = createSignal<string | null>(null);
  const [esperando, setEsperando] = createSignal<EnEspera[]>([]);
  const [reponiendo, setReponiendo] = createSignal(false);
  const [repuestas, setRepuestas] = createSignal<number | null>(null);
  // Cuántas veces cambió el estado de cada cuenta desde fuera. Lo consume el
  // bloque de consumo: sin esto se queda diciendo «no está conectada» al lado
  // de la etiqueta `conectada`.
  const [conectadaVez, setConectadaVez] = createSignal<Record<string, number>>({});

  // Conexión en curso: qué cuenta, qué pasó, y si el agente espera un código.
  const [enCurso, setEnCurso] = createSignal<string | null>(null);
  /** Qué agente se está bajando ahora mismo. Su progreso va a la vista: bajar un
   *  CLI tarda, y sin decirlo la conexión parece colgada. */
  const [instalando, setInstalando] = createSignal<string | null>(null);
  const [url, setUrl] = createSignal<string | null>(null);
  // El fallo de copiar va dentro del diálogo: `FailureNote` queda detrás.
  const [copiaFallida, setCopiaFallida] = createSignal<string | null>(null);
  const { copied: enlaceCopiado, copy: copiarLaUrl, reset: olvidarEnlaceCopiado } = createCopied(1400, (e) => setCopiaFallida(prosaDe(e)));
  // El código que la página va a pedir. Se enseña ANTES de abrir el navegador:
  // llegar a «enter the code shown in your terminal» sin tenerlo delante es
  // donde la conexión se atasca.
  const [porConfirmar, setPorConfirmar] = createSignal<string | null>(null);
  const [pideCodigo, setPideCodigo] = createSignal(false);
  const [codigo, setCodigo] = createSignal("");
  const [salida, setSalida] = createSignal<string[]>([]);

  // Una conexión que terminó mal. No se cierra el panel al fallar: ahí está
  // el motivo que dijo el agente, y cerrarlo obliga a reintentar a ciegas.
  const [conexionFallida, setConexionFallida] = createSignal<{
    id: string;
    texto: string;
  } | null>(null);
  // Si el CLI no ha dicho nada en un rato, se ofrece la Terminal — ver arriba.
  const [ofrecerTerminal, setOfrecerTerminal] = createSignal(false);
  return {
    agentes, agente, machineOf, setAgentes, setFallo, setInstalando, lista, setCargando, setLista,
    setEstados, setSinComprobar, setPorQuitar, enCurso, setUrl, setPorConfirmar, setPideCodigo, setEnCurso,
    setSalida, setConexionFallida, setConectadaVez, setOfrecerTerminal, setComprobando, fallo,
    olvidarEnlaceCopiado, setCopiaFallida, setCodigo, copiarLaUrl, codigo, setRepuestas, setEsperando,
    setReponiendo, conexionFallida, agrupadas, tarjetas, instalando, cargando, estados, esperando, reponiendo,
    repuestas, comprobando, sinComprobar, conectadaVez, porQuitar, url, pideCodigo, porConfirmar,
    enlaceCopiado, copiaFallida, salida, ofrecerTerminal,
  };
}
