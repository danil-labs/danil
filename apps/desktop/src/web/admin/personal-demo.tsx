import { SettingsPanel } from "../../features/settings/layout";
import { personalDemo } from "./demo";
import { Plan } from "./Organization";
import { Usage } from "./Usage";

/** `?demo=1&account=personal`: lo de una cuenta personal en Configuración. */
export function personalAccountDemo() {
  return {
    isPersonal: async () => true,
    usage: () => <Usage source={personalDemo.usage} own />,
    plan: () => <SettingsPanel><Plan source={personalDemo.plan} /></SettingsPanel>,
  };
}
