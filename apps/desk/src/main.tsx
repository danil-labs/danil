import { render } from "solid-js/web";
import { createTauriHost, setHost } from "@danil/host";
import { createDeskSession } from "@danil/session";
import { createShell } from "@danil/shell";
import "./app.css";
import { seguirElTema } from "@danil/ui";

// El tema de la app actual: sigue al sistema o lo elegido (apps/desktop/src/lib/theme.ts).
seguirElTema();

// Desk: varias sesiones guardadas en el motor (P1); el login lo hace el navegador.
const host = createTauriHost();
setHost(host);
const session = createDeskSession(host);
const App = createShell({ session, host });

// Monta cuando el host sabe qué máquina es esta computadora (RV1b N11).
void host.ready.then(() => render(() => <App isDesk />, document.getElementById("root")!));
