import { render } from "solid-js/web";
import { createTauriHost, setHost } from "@danil/host";
import { createDeskSession } from "@danil/session";
import { createShell } from "@danil/shell";
import "./app.css";

// Desk: varias sesiones guardadas en el motor (P1); el login lo hace el navegador.
const host = createTauriHost();
setHost(host);
await host.ready;
const session = createDeskSession(host);
const App = createShell({ session, host });

render(() => <App isDesk />, document.getElementById("root")!);
