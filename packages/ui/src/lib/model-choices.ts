import type { CatalogosDeModelos } from "../../../../apps/desktop/src/lib/models";
import type { Superficie } from "../../../../apps/desktop/src/lib/surfaces";

/** Lo que la caja de escritura ofrece para trabajar, para ofrecer lo mismo. */
export type ModelChoices = { superficies: Superficie[]; catalogos: CatalogosDeModelos };
