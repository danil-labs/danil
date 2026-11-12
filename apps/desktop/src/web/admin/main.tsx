import { render } from "solid-js/web";
import { aplicarLenguaDeWorkspace, t } from "../../lib/i18n";
import { AdminPage, type AdminSource } from "./AdminPage";
import type { Section } from "./sections";
import "../phrases";
import "../../styles/global.css";

const root = () => document.getElementById("root") as HTMLElement;
const home = () => import.meta.env.BASE_URL;

/** `/admin?demo=1`: datos de ejemplo, sin red ni sesión. `account`, `menu` y `section` eligen qué enseñar. */
export async function startAdminDemo(options: { dark: boolean }) {
  const [{ beginDemoIsolation }, { supportAccessDemo }, { seguirElTema }, { adminDemo }] = await Promise.all([import("../attention/demo"), import("../attention/support-access"), import("../../lib/theme"), import("./demo")]);
  const storage = beginDemoIsolation();
  storage.setItem("harness:apariencia", options.dark ? "oscuro" : "claro");
  aplicarLenguaDeWorkspace(null);
  seguirElTema();
  const query = new URLSearchParams(window.location.search);
  const workspace = t("web.alpha.demo_workspace");
  const source: AdminSource = {
    ...adminDemo(query.get("account"), workspace, t("web.admin.demo_other"), query.get("policy") === "internal"),
    accounts: { directory: async () => [], active: async () => 1, enter: async () => undefined },
    support: supportAccessDemo(workspace),
    section: (query.get("section") as Section | null) ?? undefined,
    home: `${home()}?demo=1${options.dark ? "&theme=dark" : ""}`,
    settings: `${home()}?demo=1&account=personal&settings=usage${options.dark ? "&theme=dark" : ""}`,
    addSeats: `${home()}?demo=1&settings=business&seats=add${options.dark ? "&theme=dark" : ""}`,
  };
  render(() => <AdminPage source={source} />, root());
}
