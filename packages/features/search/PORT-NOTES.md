# Notas de portabilidad: @danil/feature-search

- Portado desde `apps/desktop/src/features/shell/GlobalSearch.tsx` con exacta paridad visual, textos vía `t()` de `@danil/ui/i18n`, estilos, clases, atajos y navegación.
- Consulta de `archived_tasks` migrada de `invoke()` a `@danil/engine-client` a través de hook `useArchivedTasks` en `src/queries.ts`.
