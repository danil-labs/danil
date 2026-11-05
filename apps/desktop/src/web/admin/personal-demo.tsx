import { SettingsPanel } from "../../features/settings/layout";
import UsageView from "../../features/settings/UsageView";
import { personalDemo } from "./demo";
import { Plan } from "./Organization";

/** `?demo=1&account=personal`: lo de una cuenta personal en Configuración. */
export function personalAccountDemo() {
  return {
    isPersonal: async () => true,
    accountUsage: () => <UsageView source={personalDemo.usageMe} />,
    plan: () => <SettingsPanel><Plan source={personalDemo.plan} /></SettingsPanel>,
  };
}
