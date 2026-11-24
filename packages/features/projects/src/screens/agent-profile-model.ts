import type { CreateFreeRouterConsent } from "../../../../ui/src/lib/freeRouterConsent.ts";
import type { AgentProfile as Profile, HandlerDefinition, HandlerStatus } from "../../../../ui/src/lib/model";
import type { CatalogosDeModelos } from "../../../../ui/src/lib/models";
import type { Superficie } from "../../../../ui/src/lib/surfaces";

/** Las extensiones que el webview pinta como `data:` URI (`preview::data_url`). */
const IMAGES = ["png", "jpg", "jpeg", "webp", "gif"];

const SECTION = "grid gap-2";
const LABEL = "text-xs font-semibold text-neutral-500";

export { IMAGES, SECTION, LABEL };

export type AgentProfileProps = {
  project: string;
  agent: HandlerDefinition;
  profile: Profile;
  status: HandlerStatus;
  /** La imagen de fondo ya leída, o `null` mientras no haya ninguna. */
  background: string | null;
  /** Lo que se puede elegir para trabajar, para ofrecer aquí el mismo menú
   *  que la caja de escritura. */
  superficies: Superficie[];
  catalogos: CatalogosDeModelos;
  createFreeRouterConsent: CreateFreeRouterConsent;
  /** Con qué CLI corrió su chat la última vez. `null` si nunca arrancó:
   *  ahí no hay hilo que perder al elegir un proveedor distinto. */
  currentAgent: string | null;
  /** Si su chat es el que está abierto en pantalla ahora mismo: solo
   *  entonces el cambio aplica de inmediato al turno siguiente. */
  onModelChosen?: (agent: string | null, model: string | null) => void;
  /** Que quien lista los encargados relea: el borrado no deja fila que mirar. */
  onDeleted?: () => void;
  handlerPolicy?: string;
  onClose: () => void;
};
