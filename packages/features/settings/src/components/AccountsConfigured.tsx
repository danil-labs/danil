import { canonicalAgentId, OPENCODE } from "../../../../ui/src/lib/tasks.ts";
import { type JSX } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { revocada } from "../../../../../apps/desktop/src/lib/limits";
import type { MaquinasDeAjustes } from "../model/machines-port";
import AccountCard from "../screens/AccountCard";
import { type Account, type AccountStatus, createAccountLimit } from "../queries/accounts-store";

export function CuentaConfigurada(props: {
  account: Account;
  maquinas: MaquinasDeAjustes;
  agent: string;
  agentLabel: string;
  active: boolean;
  status?: AccountStatus;
  checkingStatus?: boolean;
  /** Autenticada, pero la última consulta de estado falló. */
  statusUnknown?: boolean;
  onRecheckStatus?: () => void | Promise<unknown>;
  supportsLimits: boolean;
  order: number;
  afterStatusChange: number;
  /**
   * Función y no nodo: quien pregunta al proveedor es esta fila, y el padre
   * no puede saber que la credencial fue rechazada hasta que ella se lo
   * diga. Sin esto, el botón de reconectar dependería solo de
   * `account_status` —que solo mira si el archivo está en disco— y no
   * aparecería en el caso que más lo necesita: cuenta presente, token
   * muerto.
   *
   * En Solid tiene que ser una función: un nodo del DOM creado arriba se
   * colocaría una sola vez y no se recalcularía cuando la fila descubra
   * el 401.
   */
  actions: (info: { revocada: boolean; sinComprobar: boolean }) => JSX.Element;
  destructiveAction: JSX.Element;
}) {
  const lectura = createAccountLimit({
    get agent() {
      return props.agent;
    },
    get id() {
      return props.account.id;
    },
    get agentLabel() {
      return props.agentLabel;
    },
    get active() {
      return props.active;
    },
    get orden() {
      return props.order;
    },
    get tras() {
      return props.afterStatusChange;
    },
    get enabled() {
      return props.supportsLimits;
    },
    machineOf: props.maquinas.machineOf,
  });

  // Si el proveedor sí contestó con límites, la cuenta funciona aunque el CLI
  // local no haya respondido a tiempo.
  const sinComprobar = () => !!props.statusUnknown && lectura.limits?.mode !== "read";

  return (
    <AccountCard
      account={props.account}
      active={props.active}
      status={props.status}
      checkingStatus={props.checkingStatus}
      statusUnknown={sinComprobar()}
      onRecheckStatus={props.onRecheckStatus}
      noLimitsLabel={canonicalAgentId(props.agent) === OPENCODE ? t("settings.accounts.go_key_required") : undefined}
      limits={lectura.limits}
      lastGood={lectura.lastGood}
      loadingLimits={lectura.loading}
      refreshingLimits={lectura.refreshing}
      onRefreshLimits={props.supportsLimits ? lectura.refresh : undefined}
      actions={props.actions({ revocada: revocada(lectura.limits), sinComprobar: sinComprobar() })}
      destructiveAction={props.destructiveAction}
      variant="row"
    />
  );
}
