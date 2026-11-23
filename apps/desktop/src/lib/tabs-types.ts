type CommonTab = {
  id: string;
  project: string;
  session: string;
};

export type TaskTab = CommonTab & {
  clase: "tarea";
  // El historial puede llegar después del primer render; mientras tanto se usa el título guardado.
  titulo: string;
};

export type FileTab = CommonTab & {
  clase: "archivo";
  // Sin tarea se lee el commit base; con tarea debe leerse su copia de trabajo.
  base?: string;
  arbol: string;
  ruta: string;
  cambiado: boolean;
};

export type ArtifactTab = CommonTab & {
  clase: "artefacto";
  rel: string;
  path: string;
  kind: "output" | "input" | "external";
  codigo?: boolean;
};

// Site.tsx posee la capa nativa; guardar su estado aquí crearía una segunda fuente de verdad.
export type SiteTab = CommonTab & {
  clase: "sitio";
  url: string;
  navegador?: true;
};

// Una por máquina: la pantalla es de la computadora, no de una tarea.
export type ScreenTab = CommonTab & {
  clase: "pantalla";
  machine: string;
  titulo: string;
};

export type Tab =
  | TaskTab
  | FileTab
  | ArtifactTab
  | SiteTab
  | ScreenTab;
export type ContentTab =
  | FileTab
  | ArtifactTab
  | SiteTab;

// La ruta no basta: tareas y árboles distintos pueden tener el mismo archivo.
// El byte nulo separa campos sin colisionar con nombres de archivo.
export const fileTabId = (a: {
  project: string;
  session: string;
  arbol: string;
  ruta: string;
}) =>
  a.session
    ? `archivo\u0000${a.session}\u0000${a.arbol}\u0000${a.ruta}`
    : `archivo-previo\u0000${a.project}\u0000${a.arbol}\u0000${a.ruta}`;

export const artifactTabId = (a: { session: string; rel: string }) =>
  `artefacto\u0000${a.session}\u0000${a.rel}`;

export const siteTabId = (a: { session: string; url: string }) =>
  `sitio\u0000${a.session}\u0000${a.url}`;

let browserSequence = 0;
export const browserTabId = () => `navegador\u0000${Date.now()}\u0000${browserSequence++}`;


export const screenTabId = (machine: string) => `pantalla\u0000${machine}`;

export const isTaskTab = (p: Tab): p is TaskTab => p.clase === "tarea";
export const isContentTab = (p: Tab): p is ContentTab =>
  p.clase === "archivo" || p.clase === "artefacto" || p.clase === "sitio";
