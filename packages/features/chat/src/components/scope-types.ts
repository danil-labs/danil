import type { InvokeOptions } from "@tauri-apps/api/core";
import type { GitHost } from "../../../../ui/src/lib/gitHosts";
import type { Source } from "../../../../../apps/desktop/src/lib/model";

type Proveedor = GitHost;

/** Por dónde va el panel de añadir. */
type Paso =
  | { que: "proveedores" }
  | { que: "areas"; proveedor: string }
  | { que: "repos"; proveedor: string; area: string }
  | { que: "direccion" };

export type AlcanceProps = {
  /** Lo que nombra la fila. */
  rotulo: string;
  /** Lo que se lee en el botón de añadir, después del `+`. */
  agregar: string;
  items: Source[];
  materialOptions?: InvokeOptions;
  materialTarget: string;
  materialAvailable: boolean;
  /**
   * Le llega el id de la fuente que quedó en el workspace. **Rechaza si el
   * material entró pero no se pudo traer a la tarea**, y entonces este panel se
   * queda abierto con el motivo en vez de cerrarse como si hubiera ido bien.
   */
  onTraer: (source: string) => Promise<void>;
  onQuitar: (source: string) => void;
  onCambiarRama: (source: Source, rama: string) => Promise<void>;
  /** Con un turno en marcha no se toca el alcance: se resuelve en cada turno. */
  bloqueado?: boolean;
};

export type { Proveedor, Paso };
