# PORT-NOTES

Notas de portado de Configuración desde `apps/desktop` al front rebuild nuevo (`@danil/feature-settings`).

## Slots a pasar desde el shell (`packages/shell/src/routes.tsx`)

- `accountSlot`: pasar `<AccountScreen />` de `@danil/feature-account` para la pestaña `cuenta-danil`.
- `aiAccountsSlot`: pasar la vista de cuentas de `@danil/feature-ai-credentials` para la pestaña `proveedores-ia`.
- `machinesSlot`: pasar `<MachinesScreen />` de `@danil/feature-machines` para la pestaña `machines`.

## Registro de componentes portados

- portado de apps/desktop/src/features/settings/Settings.tsx:1-572
- portado de apps/desktop/src/features/settings/settings-entries.ts:1-37
- portado de apps/desktop/src/features/settings/DanilAccountsEntry.tsx:1-8 y DanilAccount.tsx:1-120 (AccountSection: perfil, emails, usage, plan)
