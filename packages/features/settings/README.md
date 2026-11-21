# @danil/feature-settings

Modal y secciones de Configuración de Danil portados para el front rebuild (SolidJS).

## Qué hace

- Muestra el modal de configuración con riel lateral de navegación agrupado («Tú» y «Este workspace») y barra de pestañas superior.
- Mantiene 8 secciones funcionales y visualmente idénticas a la aplicación de escritorio (`apps/desktop`):
  1. **Cuenta**: perfil, correos, uso, plan y seguridad. Recibe `accountSlot` desde el shell.
  2. **Preferencias**: ajustes generales, estilo y temas, comportamiento de avisos, paquetes de lenguas, barra de workspaces y descargas.
  3. **Cuentas de IA**: asistentes de IA y proveedores. Recibe `aiAccountsSlot` desde el shell.
  4. **Control de código**: proveedores de repositorios de git vinculados.
  5. **Máquinas**: tus máquinas conectadas, estado del entorno y logs de actividad. Recibe `machinesSlot` desde el shell.
  6. **Proyectos**: carpetas y proyectos del workspace, y gestión de secretos.
  7. **Agentes y skills**: catálogo de agentes del workspace/repositorio y skills disponibles.
  8. **Conexiones**: servidores MCP (operation), plugins instalados, proveedor de memoria y acceso externo.
- Cumple R3: no importa directamente otras features hermanas; recibe las pantallas con datos de dominio existentes vía props/slots provistos por el shell.
- Cumple R1–R14: sin invocar Tauri ni red fuera de los contratos permitidos; componentes puros en `components/`.

## Slots a pasar desde el shell (`packages/shell/src/routes.tsx`)

- `accountSlot`: `<AccountScreen />` de `@danil/feature-account`
- `aiAccountsSlot`: `<AiAccountsScreen />` de `@danil/feature-ai-credentials`
- `machinesSlot`: `<MachinesScreen />` de `@danil/feature-machines`
