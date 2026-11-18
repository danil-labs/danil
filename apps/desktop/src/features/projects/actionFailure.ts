import { errorCode } from "../../lib/errorCode.ts";
import { asFailure, type Failure } from "../../lib/failure.ts";

const actionKeys = {
  finish: "projects.sessions.unconfirmed_finish",
  archive: "projects.sessions.unconfirmed_archive",
  blockers: "projects.sessions.unchecked_blockers",
  discard: "projects.sessions.unconfirmed_discard",
  pin: "projects.sessions.unconfirmed_pin",
  unpin: "projects.sessions.unconfirmed_unpin",
} as const;

export type TaskAction = keyof typeof actionKeys;

type ErrorDetail = {
  request_id?: unknown;
  detail?: ErrorDetail | string | null;
};

function requestId(error: ErrorDetail): string | undefined {
  let current: ErrorDetail | string | null | undefined = error;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth++) {
    const id = current.request_id;
    if (typeof id === "string" && /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id)) return id;
    current = current.detail;
  }
}

export function actionFailure(error: unknown, action: TaskAction): Failure {
  if (errorCode(error) !== "io") return asFailure(error);
  const envelope = error as ErrorDetail;
  const what = { clave: actionKeys[action] };
  // En un error plano, serializar la raíz también incluiría los argumentos.
  const { detail } = asFailure({ what, detail: envelope.detail ?? "io" });
  const id = requestId(envelope);
  return { what, detail: id ? `${detail}\nrequest_id: ${id}` : detail };
}
