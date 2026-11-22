# Inventario de lo viejo (Tarea 3.1, plan front-move)

Inventario exhaustivo de todo el código en el front que consume o adapta sistemas viejos, realizado según la especificación de la tarea 3.1 () de .

## Alcance de la búsqueda

- Rutas inspeccionadas: , ,  y  (excluyendo , , , , ).
- Sistemas y patrones analizados:
  1.  y  (plano de control y relay obsoleto de machines).
  2.  (reglas, contratos, estilos y filtros de la app anterior).
  3. La mensajería y Danil Agents (, , , , ).
  4.  y  (auth y base de datos heredada).
  5. Adaptadores y fallbacks a servicios viejos (, , , , , ).
  6. Subrutas viejas de workspaces (, , , , , ) y .
  7. Endpoints de conexiones legadas ().

---

## Usos encontrados

| Archivo:línea | Qué consume | Sistema viejo | Reemplazo por el borde (ruta exacta) o «se borra» | Evidencia |
|---|---|---|---|---|
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Endpoint legado /v1/computers | /v1/computers |  vía  |  |
|  | Variable de entorno de computers | DANIL_COMPUTERS_URL |  vía  |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Reglas, contratos o referencias de Appv2 | appv2 | «se borra» |  |
|  | Cliente de mensajería Appv2 | createMessaging | «se borra» |  |
|  | Cliente de mensajería Appv2 | createMessaging | «se borra» |  |
|  | Cliente de mensajería Appv2 | createMessaging | «se borra» |  |
|  | Cliente de mensajería Appv2 | createMessaging | «se borra» |  |
|  | Cliente de mensajería Appv2 | createMessaging | «se borra» |  |
|  | Cliente de mensajería Appv2 | createMessaging | «se borra» |  |
|  | Cliente de mensajería Appv2 | createMessaging | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | «se borra» |  |
|  | BFF alfa legado /alpha-api | /alpha-api | «se borra» |  |
|  | BFF alfa legado /alpha-api | /alpha-api | «se borra» |  |
|  | BFF alfa legado /alpha-api | /alpha-api | «se borra» |  |
|  | BFF alfa legado /alpha-api | /alpha-api | «se borra» |  |
|  | BFF alfa legado /alpha-api | /alpha-api | «se borra» |  |
|  | BFF alfa legado /alpha-api | /alpha-api | «se borra» |  |
|  | BFF alfa legado /alpha-api | /alpha-api | «se borra» |  |
|  | BFF alfa legado /alpha-api | /alpha-api | «se borra» |  |
|  | BFF alfa legado /alpha-api | /alpha-api | «se borra» |  |
|  | BFF alfa legado /alpha-api | /alpha-api | «se borra» |  |
|  | BFF alfa legado /alpha-api | /alpha-api | «se borra» |  |
|  | BFF alfa legado /alpha-api | /alpha-api | «se borra» |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/me/workspaces | /v1/me/workspaces |  vía  |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/memory | /v1/workspaces/.../memory | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/memory | /v1/workspaces/.../memory | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/memory | /v1/workspaces/.../memory | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/memory | /v1/workspaces/.../memory | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/memory | /v1/workspaces/.../memory | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/memory | /v1/workspaces/.../memory | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/logo | /v1/workspaces/.../logo |  vía  |  |
|  | Subruta legada /v1/workspaces/{id}/logo | /v1/workspaces/.../logo |  vía  |  |
|  | Subruta legada /v1/workspaces/{id}/background | /v1/workspaces/.../background |  vía  |  |
|  | Subruta legada /v1/workspaces/{id}/restore | /v1/workspaces/.../restore | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/purge | /v1/workspaces/.../purge | «se borra» |  |
|  | Gate de feature legado | legacyOrganizationGate |  vía  |  |
|  | Gate de feature legado | legacyOrganizationGate |  vía  |  |
|  | Gate de feature legado | legacyOrganizationGate |  vía  |  |
|  | Componente de menú legado | LegacyProfileMenu | «se borra» |  |
|  | Componente de menú legado | LegacyProfileMenu | «se borra» |  |
|  | Componente de pie legado | LegacyDanilFooterEntry | «se borra» |  |
|  | Propiedad legacy de cuenta de grupo | groupAccount.legacy | «se borra» |  |
|  | Propiedad legacy de cuenta de grupo | groupAccount.legacy | «se borra» |  |
|  | Propiedad legacy de cuenta de grupo | groupAccount.legacy | «se borra» |  |
|  | Propiedad legacy de cuenta de grupo | groupAccount.legacy | «se borra» |  |
|  | Compatibilidad de motor legado | machineCompatibility |  vía  |  |
|  | Compatibilidad de motor legado | machineCompatibility |  vía  |  |
|  | Compatibilidad de motor legado | machineCompatibility |  vía  |  |
|  | Compatibilidad de motor legado | machineCompatibility |  vía  |  |
|  | Compatibilidad de motor legado | machineCompatibility |  vía  |  |
|  | Compatibilidad de motor legado | machineCompatibility |  vía  |  |
|  | Compatibilidad de motor legado | machineCompatibility |  vía  |  |
|  | Compatibilidad de motor legado | machineCompatibility |  vía  |  |
|  | Compatibilidad de motor legado | machineCompatibility |  vía  |  |
|  | Compatibilidad de motor legado | machineCompatibility |  vía  |  |
|  | Compatibilidad de motor legado | machineCompatibility |  vía  |  |
|  | Compatibilidad de motor legado | machineCompatibility |  vía  |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |

---

## Lista negra de patrones para  (Gate 3.4)

Patrones disjuntos y exactos para el gate de verificación  y :

| Patrón | Regex | Sistema viejo | Conteo actual | Acción |
|---|---|---|---:|---|
| /v1/computers | /v1/computers | Borde viejo /v1/computers (R8) | 31 | Se borra |
| DANIL_COMPUTERS_URL | DANIL_COMPUTERS_URL | Variable de entorno de computers | 1 | Se borra |
| appv2 | [aA]ppv2 | Appv2 / Danil Agents (R8) | 19 | Se borra |
| createMessaging | createMessaging | Mensajería Appv2 (R8) | 7 | Se borra |
| /terminus/alpha-api | /terminus/alpha-api | BFF alfa legado /terminus/alpha-api | 21 | Se borra |
| /alpha-api | [^s]/alpha-api | BFF alfa legado /alpha-api | 12 | Se borra |
| /v1/connections | /v1/connections | Borde viejo /v1/connections | 8 | Se borra |
| /v1/me/workspaces | /v1/me/workspaces | Borde viejo /v1/me/workspaces | 1 | Se borra |
| /v1/workspaces/.../github | /v1/workspaces/[^/]+/github | Borde viejo github sync | 7 | Se borra |
| /v1/workspaces/.../memory | /v1/workspaces/[^/]+/memory | Borde viejo memory | 6 | Se borra |
| /v1/workspaces/.../logo | /v1/workspaces/[^/]+/logo | Borde viejo logo | 2 | Se borra |
| /v1/workspaces/.../background | /v1/workspaces/[^/]+/background | Borde viejo background | 1 | Se borra |
| /v1/workspaces/.../restore | /v1/workspaces/[^/]+/restore | Borde viejo restore | 1 | Se borra |
| /v1/workspaces/.../purge | /v1/workspaces/[^/]+/purge | Borde viejo purge | 1 | Se borra |
| legacyOrganizationGate | legacyOrganizationGate | Gate de organización legado | 3 | Se borra |
| LegacyProfileMenu | LegacyProfileMenu | Menú de perfil legado | 2 | Se borra |
| LegacyDanilFooterEntry | LegacyDanilFooterEntry | Footer legado | 1 | Se borra |
| groupAccount.legacy | groupAccount.*legacy | groupAccount legado | 4 | Se borra |
| machineCompatibility | machineCompatibility | Compatibilidad vieja de máquinas | 12 | Se borra |
| machineContracts | machineContracts | Contratos viejos de máquinas | 7 | Se borra |
| workers.internal | workers[.]internal | workers.internal | 0 | Se borra |
| access-projection | access-projection | access-projection | 0 | Se borra |
| legacy-desktop-auth | legacy-desktop-auth | legacy-desktop-auth | 0 | Se borra |
| supabase (auth/db) | supabase(Client|-js) | supabase legado | 0 | Se borra |
