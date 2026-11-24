import type { CatalogosDeModelos } from "./models";
import type { Superficie } from "./surfaces";

/** Lo que la caja de escritura ofrece para trabajar, para ofrecer lo mismo. */
export type ModelChoices = { superficies: Superficie[]; catalogos: CatalogosDeModelos };
