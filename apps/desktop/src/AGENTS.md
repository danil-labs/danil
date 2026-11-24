# Front

Applies [AGENTS.md](../AGENTS.md). SolidJS, TypeScript, Tailwind v4 and the
catalogs.

- `packages/shell/src/app/App.tsx` owns tabs, drafts and threads per workspace. Closing a view
  does not end its task or its turn.
- `packages/engine-client/src/client.ts` calls the engine with the captured workspace and keeps the
  shape of the errors the bridge returns.
- `lib/tabs.ts` and `lib/panels.ts` separate view state from saved data. An
  internal rename does not change persisted keys.
- `features/` holds screens; `ui/` holds shared controls. Read
  [the visual system](../docs/visual-system.md) before changing controls.
- Effects, subscriptions and memos need a Solid owner. A computation created
  from a handler must have an owner or be a plain function.
- Keep identity stable when re-reading lists: a new IPC reply does not remount
  rows that represent the same object.
- When composing Kobalte events keep the trigger handler. An optional prop is
  the object or `undefined`; don't compose it with `&&`.
- The [catalog](../docs/localization.md) chooses plurals and formats. Command
  and event names stay literal for the bridge guards.
- The artifact viewer runtime lives as text in `packages/features/artifacts/src/model/sandbox.ts`;
  changing its content policy requires the `artifact` and `csp` guards and the
  tests in [tests/security/](../tests/security/README.md).
- Mount and cost tests use jsdom with a simulated IPC. Permissions, native drag
  and the visual result need a check in the real window.
