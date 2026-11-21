import { render } from "solid-js/web";
import { createWebSession } from "@danil/session";
import { createShell } from "@danil/shell";
import "./app.css";
import { seguirElTema } from "@danil/ui";

// El tema de la app actual: sigue al sistema o lo elegido (apps/desktop/src/lib/theme.ts).
seguirElTema();

// Web: una sola sesión, la cookie HttpOnly del borde (02-apps-and-sessions).
const session = createWebSession();
const App = createShell({ session });

render(() => <App />, document.getElementById("root")!);
