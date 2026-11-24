import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { invoke } from "../../../engine-client/src/client.ts";
import { legible, type Query, type Read } from "../../../ui/src/lib/limits";
import { detalleDe } from "../../../ui/src/Failure";
import { displayWorkspaceContext } from "../../../session/src/workspace-context";
import { workspaceMachineSources } from "../../../features/machines/src/queries/danil-source";
import { machines, machineOf } from "../../../features/machines/src/queries/store";
import type { Account, AccountList, AccountStatus } from "../../../features/settings/src/queries/accounts-store";

// Consumo de las cuentas activas; las lecturas fallidas conservan el último dato marcado como antiguo.
// El refresco automático debe respetar el caché y evitar cuentas sin consumo disponible.

export type AgentOpt = {
  id: string;
  label: string;
  limits: boolean;
};

export type AccountsByAgent = {
  agent: string;
  label: string;
  active: string | null;
  accounts: Account[];
};

export type ActiveCard = AccountsByAgent & { cuenta: Account };

export const usageKey = (agent: string, id: string) => `${agent}\u0000${id}`;

// El reloj consulta el caché; forzarlo cada cinco minutos provoca límites del proveedor.
const REFRESH_INTERVAL_MS = 5 * 60_000;

/** Una sola instancia por ventana: cada copia repetiría las consultas al proveedor. */
export function createUsage(props: {
  agents: () => AgentOpt[];
  agent: () => string;
  busy: () => boolean;
  // Conectar una cuenta desde Configuración debe invalidar la lista visible.
  reload: () => number;
  workspace: () => string | null;
}) {
  const [accountsByAgent, setAccountsByAgent] = createSignal<AccountsByAgent[]>([]);
  const [reads, setReads] = createSignal<Record<string, Query>>({});
  // Un fallo de lectura no invalida la última lectura buena.
  const [lastGoodReads, setLastGoodReads] = createSignal<Record<string, Read>>({});
  const [statuses, setStatuses] = createSignal<Record<string, AccountStatus>>({});
  const [inProgress, setInProgress] = createSignal<Record<string, boolean>>({});

  let running = props.busy();
  const scope = createMemo(() => JSON.stringify([displayWorkspaceContext(), props.workspace()]));
  const sources = createMemo(() => workspaceMachineSources(props.workspace(), displayWorkspaceContext()));
  const online = createMemo(() => JSON.stringify(machines().filter(machine => machine.on && machine.hosts !== false)
    .map(machine => machine.id).sort()));
  let accountScope = scope();

  const accountLabel = (id: string) =>
    props.agents().find((a) => a.id === id)?.label ?? id;

  async function queryAccount(agent: string, id: string, force: boolean) {
    const requestedScope = scope();
    const k = usageKey(agent, id);
    setInProgress((p) => ({ ...p, [k]: true }));
    try {
      const r = await invoke<Query>("account_limits", {
        provider: agent,
        id,
        // force es el nombre del parámetro del puente; otro nombre no forzaría la consulta.
        force: force,
      }, machineOf(id));
      if (scope() !== requestedScope) return;
      setReads((p) => ({ ...p, [k]: r }));
      const lastGood = legible(r);
      if (lastGood) setLastGoodReads((p) => ({ ...p, [k]: lastGood }));
    } catch (e) {
      // Un fallo del comando no significa consumo cero.
      setReads((p) => ({
        ...p,
        [k]: {
          mode: "failed",
          what: t("usage.query.failed", { agent: accountLabel(agent) }),
          detail: detalleDe(e),
        },
      }));
    } finally {
      if (scope() === requestedScope) setInProgress((p) => ({ ...p, [k]: false }));
    }
  }

  // Consultar las cuentas a la vez puede hacer que el proveedor limite todas las solicitudes.
  async function querySequentially(pairs: [string, string][], force: boolean) {
    const requestedScope = scope();
    for (const [a, id] of pairs) {
      if (scope() !== requestedScope) return;
      await queryAccount(a, id, force);
    }
  }

  // Solo los agentes con consumo publicado tienen un dato que consultar.
  const agentIds = () =>
    props.agents()
      .filter((a) => a.limits)
      .map((a) => a.id)
      .join(",");

  createEffect(
    on([agentIds, props.reload, scope, sources, online], ([ids, , nextScope]) => {
      if (accountScope !== nextScope) {
        accountScope = nextScope;
        setAccountsByAgent([]);
        setReads({});
        setLastGoodReads({});
        setStatuses({});
        setInProgress({});
      }
      if (!ids) {
        setAccountsByAgent([]);
        return;
      }
      let alive = true;
      onCleanup(() => {
        alive = false;
      });
      void (async () => {
        const rowCount = await Promise.all(
          ids.split(",").map(async (id): Promise<AccountsByAgent | null> => {
            try {
              const l = await invoke<AccountList>("list_accounts", { provider: id });
              return {
                agent: id,
                label: accountLabel(id),
                active: l.active,
                accounts: l.accounts,
              };
            } catch {
              return null;
            }
          }),
        );
        if (alive) setAccountsByAgent(previous => ids.split(",").flatMap((id, index) => {
          const row = rowCount[index] ?? previous.find(item => item.agent === id);
          return row ? [row] : [];
        }));
      })();
    }),
  );

  const activeAccounts = (): [string, string][] =>
    accountsByAgent()
      .filter((p) => p.active)
      .map((p) => [p.agent, p.active as string]);

  const activeCards = (): ActiveCard[] =>
    accountsByAgent().flatMap((p) => {
      const account = p.accounts.find((c) => c.id === p.active);
      return account ? [{ ...p, cuenta: account }] : [];
    });

  createEffect(
    on(activeAccounts, (list) => {
      const pending = list.filter(
        ([a, id]) => !(usageKey(a, id) in reads()),
      );
      if (pending.length) void querySequentially(pending, false);
    }),
  );

  // detail cubre el intervalo entre descubrir el correo y releer meta.json.
  createEffect(
    on(activeCards, (cards) => {
      let alive = true;
      onCleanup(() => {
        alive = false;
      });
      void Promise.all(
        cards.map(async (p) => {
          try {
            const status = await invoke<AccountStatus>("account_status", {
              provider: p.agent,
              id: p.cuenta.id,
            }, machineOf(p.cuenta.id));
            if (!alive) return;
            setStatuses((previous) => ({
              ...previous,
              [usageKey(p.agent, p.cuenta.id)]: status,
            }));
          } catch {
          }
        }),
      );
    }),
  );

  createEffect(
    on(props.busy, (busy) => {
      const justFinished = running && !busy;
      running = busy;
      if (!justFinished) return;
      const agent = props.agent();
      const id = accountsByAgent().find((p) => p.agent === agent)?.active;
      if (!id) return;
      // Forzar aquí salta el caché y consulta al proveedor en cada turno: da 429.
      void querySequentially([[agent, id]], false);
    }),
  );

  // El temporizador debe consultar busy y la lista al dispararse para no usar estado antiguo.
  createEffect(
    on(
      () => activeAccounts().length,
      (accountCount) => {
        if (!accountCount) return;
        // Un temporizador llamado t ocultaría la función del catálogo.
        const timer = setInterval(() => {
          if (document.visibilityState !== "visible") return;
          if (props.busy()) return;
          void querySequentially(activeAccounts(), false);
        }, REFRESH_INTERVAL_MS);
        onCleanup(() => clearInterval(timer));
      },
    ),
  );

  const updating = () => activeAccounts().some(([a, id]) => inProgress()[usageKey(a, id)]);

  async function rename(agent: string, id: string, label: string) {
    try {
      const updated = await invoke<Account>(
        "rename_account",
        { provider: agent, id, label },
        machineOf(id),
      );
      setAccountsByAgent((previous) =>
        previous.map((group) =>
          group.agent !== agent
            ? group
            : {
                ...group,
                accounts: group.accounts.map((acc) =>
                  acc.id === id
                    ? { ...acc, label: updated.label, custom_label: updated.custom_label ?? true }
                    : acc,
                ),
              },
        ),
      );
    } catch {
      // Un motor anterior sin `rename_account` deja el nombre como estaba.
    }
  }

  return {
    accountsByAgent,
    activeCards,
    reads,
    lastGoodReads,
    statuses,
    inProgress,
    updating,
    rename,
    refresh: (agent: string, id: string) => void querySequentially([[agent, id]], true),
    refreshAll: () => void querySequentially(activeAccounts(), true),
  };
}

export type Usage = ReturnType<typeof createUsage>;
