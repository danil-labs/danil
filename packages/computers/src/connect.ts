/**
 * «Conectar otra máquina»: el comando que instala Seldon Host en un VPS, otra
 * laptop o una Raspberry Pi y la conecta a la cuenta con un código
 * (seldon-host `scripts/host-install/install.sh` y `danil machines
 * connect`), y la espera a que aparezca en `GET /v1/computers`.
 *
 * Conectar es gratis y sin tope de máquinas; controlarla desde la web o el
 * teléfono es lo de pago. Una máquina propia no se enciende desde Terminus
 * (`not_remotely_startable`): apagada, se ve apagada.
 */
import type { Answer, Computer } from "./api.ts";

/** Donde Danil publica el instalador. */
export const INSTALL_URL = "https://alfa-app.danil.ai/install.sh";

/** Lo que se espera a que la máquina nueva aparezca: el código vence a los 10 min. */
export const APPEAR_WAIT = 11 * 60_000;
/** Inscrita, lo que se espera a que el motor abra el relay. */
export const ONLINE_WAIT = 90_000;
export const POLL_EVERY = 3_000;

/** El comando a pegar en la terminal de la otra máquina. */
export function installCommand(options: { name?: string | null; url?: string } = {}): string {
  const base = `curl -fsSL ${options.url ?? INSTALL_URL} | sh`;
  const name = options.name?.trim();
  if (!name) return base;
  // Comillas simples de sh: el nombre no se expande; una comilla se cierra, se escapa y se reabre.
  return `${base} -s -- --name '${name.replaceAll("'", `'\\''`)}'`;
}

/**
 * El camino de quien conecta: instalar y aprobar el código pasan en la otra
 * máquina y en la página de Danil; aquí solo se ve el resultado.
 */
export type ConnectHop = "account" | "approval" | "relay" | "version";

export type ConnectProgress =
  | { stage: "waiting" }
  /** Ya es de la cuenta; falta que su motor abra el relay. */
  | { stage: "enrolled"; computer: Computer }
  | { stage: "online"; computer: Computer }
  | { stage: "failed"; hop: ConnectHop; code: string; computer?: Computer };

export type WatchOptions = {
  /** `GET /v1/computers` con la sesión de quien conecta. */
  list: () => Promise<Answer<Computer[]>>;
  /** Las computadoras que ya había al abrir: las demás son nuevas. */
  known: Iterable<string>;
  /** Si su motor no habla el contrato de este cliente (`machineCompatibility`). */
  outdated?: (computer: Computer) => boolean;
  onProgress: (progress: ConnectProgress) => void;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  appearWait?: number;
  onlineWait?: number;
  every?: number;
};

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sondea la lista hasta que haya una computadora nueva en línea, o hasta decir
 * en qué tramo se quedó. Termina con `online` o `failed`, o sin nada si se
 * cancela. Un fallo de red de una vuelta no decide nada: se vuelve a preguntar.
 */
export async function watchNewComputer(options: WatchOptions): Promise<ConnectProgress | null> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? pause;
  const every = options.every ?? POLL_EVERY;
  const known = new Set(options.known);
  const appearBy = now() + (options.appearWait ?? APPEAR_WAIT);
  let onlineBy: number | null = null;
  let last: ConnectProgress | null = null;
  const report = (progress: ConnectProgress) => {
    const same =
      last?.stage === progress.stage &&
      ("computer" in last ? last.computer?.computer_id : null) === ("computer" in progress ? progress.computer?.computer_id : null);
    last = progress;
    if (!same || progress.stage === "failed" || progress.stage === "online") options.onProgress(progress);
    return progress;
  };
  report({ stage: "waiting" });
  while (!options.signal?.aborted) {
    const answer = await options.list().catch((): Answer<Computer[]> => ({ kind: "error", status: null }));
    if (options.signal?.aborted) break;
    if (answer.kind === "unauthorized") return report({ stage: "failed", hop: "account", code: "unauthorized" });
    if (answer.kind === "license") return report({ stage: "failed", hop: "account", code: "license_required" });
    if (answer.kind === "ok") {
      const fresh = answer.value.filter((c) => !known.has(c.computer_id));
      const ready = fresh.find((c) => c.state === "online");
      if (ready) {
        if (options.outdated?.(ready)) return report({ stage: "failed", hop: "version", code: "version_mismatch", computer: ready });
        return report({ stage: "online", computer: ready });
      }
      const enrolled = fresh[0];
      if (enrolled) {
        onlineBy ??= now() + (options.onlineWait ?? ONLINE_WAIT);
        if (now() >= onlineBy) return report({ stage: "failed", hop: "relay", code: "machine_off", computer: enrolled });
        report({ stage: "enrolled", computer: enrolled });
      }
    }
    if (onlineBy === null && now() >= appearBy) return report({ stage: "failed", hop: "approval", code: "machine_timeout" });
    await sleep(every);
  }
  return null;
}
