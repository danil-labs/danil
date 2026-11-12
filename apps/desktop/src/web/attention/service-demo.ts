import { t } from '../../lib/i18n';
import type { ServiceSource } from './CustomerService';

/** `?demo=1`: datos de ejemplo, sin red. */
export function serviceDemo(): ServiceSource {
  const agents = [
    { id: 1, name: 'Sofía', type: 'pessoa', archived: false },
    { id: 2, name: t("web.service.demo_help"), type: 'pessoa', archived: false },
    { id: 3, name: t("web.service.demo_promo"), type: 'ripley', archived: false },
  ];
  return {
    resolves: async () => true,
    agents: async () => agents,
    agent: async (id) => ({
      ...agents.find(row => row.id === id)!, model: 'claude-sonnet', description: t("web.service.demo_role"),
      channels: [{ id: '1', name: 'WhatsApp · Ventas', provider: 'WhatsApp' }, { id: '2', name: 'Instagram', provider: 'Instagram' }],
      httpTools: [{ id: 'a', name: t("web.service.demo_order") }],
      inventories: [{ id: '1', name: t("web.service.catalog") }],
      documents: [{ id: '1', name: t("web.service.demo_prices") }],
      directives: [],
    }),
    httpTools: async () => [
      { id: 'a', name: t("web.service.demo_order"), method: 'GET', host: 'api.ejemplo.mx', active: true },
      { id: 'b', name: t("web.service.demo_ticket"), method: 'POST', host: 'soporte.ejemplo.mx', active: true },
    ],
    variables: async () => [{ key: 'API_PEDIDOS_KEY', secret: true }, { key: 'URL_SOPORTE', secret: false }],
  };
}
