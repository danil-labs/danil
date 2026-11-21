// Primero los catálogos: un t() antes de esto devuelve la clave (apps/desktop/src/locales/catalogs.ts).
import { aplicarLengua, cargarLenguas } from "@danil/ui/i18n";
import { render } from "solid-js/web";
import { createWebSession } from "@danil/session";
import { createShell } from "@danil/shell";
import "./app.css";
import { seguirElTema } from "@danil/ui";

// El tema de la app actual: sigue al sistema o lo elegido (apps/desktop/src/lib/theme.ts).
seguirElTema();
aplicarLengua();
void cargarLenguas();

// Web: una sola sesión, la cookie HttpOnly del borde (02-apps-and-sessions).
const session = createWebSession();
const App = createShell({ session });

render(() => <App />, document.getElementById("root")!);
