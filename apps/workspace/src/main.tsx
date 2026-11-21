import { render } from "solid-js/web";
import { createWebSession } from "@danil/session";
import { createShell } from "@danil/shell";
import "./app.css";

// Web: una sola sesión, la cookie HttpOnly del borde (02-apps-and-sessions).
const session = createWebSession();
const App = createShell({ session });

render(() => <App />, document.getElementById("root")!);
