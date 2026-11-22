import { type Tab } from "../../../../../apps/desktop/src/lib/tabs";
import { type SessionRow } from "./Sessions";

// Lo que asoma de la pestaña vecina y el padding de la tira, en px.
const PEEK = 56;
const EDGE = 6;

// El For de App vuelve a montar la tira al activar una pestaña; su scroll sobrevive aquí.
const scrollBySite = new Map<string, number>();

export { PEEK, EDGE, scrollBySite };

export type TabStripProps = {
  tabs: Tab[];
  pinnedIds?: ReadonlySet<string>;
  onPin?: (id: string) => void;
  session: (id: string) => SessionRow | undefined;
  activeId: string | null;
  liveIds: string[];
  approvingIds: string[];
  waitingIds: string[];
  onPick: (id: string) => void;
  onClose: (id: string) => void;
  dirtyIds: ReadonlySet<string>;
  onCloseMany: (ids: string[]) => void;
  canReopen: boolean;
  onReopen: () => void;
  // El arrastre nativo de Tauri intercepta dragstart/drop; las pestañas usan eventos de puntero.
  onDrag?: (id: string, e: PointerEvent) => void;
  dropIndex?: number | null;
  // La tarea nueva sin lanzar no tiene pestaña en lib/tabs.ts; la tira la pinta delante.
  draftLabel?: string;
  // Sin él no hay a qué volver y la tarea nueva no se cierra.
  onCloseDraft?: () => void;
};
