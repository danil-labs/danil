import { FEATURES } from '../../../../packages/attention/src/customization.ts';
import { t } from './i18n';

export function featureEntries(enabled: readonly string[]) {
  const labels = {
    inbox: [t("attention.inbox"), t("attention.inbox_description")],
    broadcasts: [t("attention.broadcasts"), t("attention.broadcasts_description")],
    agents: [t("attention.agents"), t("attention.agents_description")],
    channels: [t("attention.channels"), t("attention.channels_description")],
    contacts: [t("attention.contacts"), t("attention.contacts_description")],
    inventory: [t("attention.inventory"), t("attention.inventory_description")],
  };
  return FEATURES.map(row => ({...row, title: labels[row.id][0], description: labels[row.id][1], selected: enabled.includes(row.id)}));
}
