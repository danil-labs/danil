# Danil móvil: guía del área

Aplica [AGENTS.md](../../AGENTS.md). App de Expo (React Native, TypeScript) para
iOS y Android: un control remoto de Danil, no Danil completo. Opera
tareas en las máquinas de la persona a través de Danil Machines; la
arquitectura y el estado están en [docs/mobile.md](docs/mobile.md).

Es un proyecto aparte de la raíz: tiene su `package.json` y su
`package-lock.json` con npm, y las comprobaciones del escritorio (`pnpm verify`) no
lo cubren.

## Comandos

Desde `apps/mobile/`:

```bash
npm install
npm start               # Metro; Expo Go en el teléfono o el simulador
npm run typecheck       # tsc --noEmit
npm test                # pruebas en Node de la capa de datos (scripts/*.test.ts)
npm run doctor          # expo-doctor
npm run computers:fake  # Danil Machines falso en :8787 (login, plano de control y relay)
npm run computers:smoke # la capa de datos contra el falso, por HTTP y WebSocket reales
npm run bridge          # bridge de desarrollo contra el motor del lab
```

Los paquetes compartidos se prueban desde su carpeta: `node --test 'packages/*/test/*.test.ts'`
en la raíz. Si tocas `packages/design`, `packages/tasks` o `packages/chat`, corre también
`node apps/desktop/scripts/verify.mjs --no-cargo`: el escritorio los usa y el
guard `shared-design` los compara con sus catálogos.

El motor del lab se arranca desde la raíz con `pnpm engine:download` y
`node apps/desktop/scripts/engine.mjs engine`.

## Expo cambia en cada SDK

El proyecto usa el SDK que fija `package.json` (`expo`). Antes de usar una API
de Expo, React Native o EAS, consulta la documentación de esa versión
(`https://docs.expo.dev/versions/v<major>.0.0/`) o el índice
`https://docs.expo.dev/llms.txt`; no la escribas de memoria. Las dependencias
se agregan con `npx expo install <paquete>`, que elige la versión compatible.

## Reglas

- **Lista cerrada en los dos caminos.** La app manda al motor de una máquina
  solo los comandos de `APP_COMMANDS` (`packages/protocol/src/commands.ts`):
  funciones de ventana (`service invoke`) con los nombres del contrato
  renombrado (`list_agents`, `provider`…). El relay de Danil Machines bloquea
  poco (solo funciones de escritorio), así que el cliente del relay
  (`apps/mobile/src/lib/hosts.ts`) se niega a mandar cualquier otro (`command_not_allowed`);
  el bridge (`bridge/bridge.mjs`) contesta 403 con la misma lista. Un comando
  nuevo se agrega a esa lista a propósito, nunca un pase genérico.
- **Abrir no enciende.** Leer nunca enciende una máquina; solo las acciones de
  la lista de intención del relay (escribir, crear tarea, aprobar, contestar)
  despiertan una VM administrada. Las acciones que el relay no toma por
  intención (fijar, renombrar, archivar, subir una imagen, agregar o quitar una cuenta,
  crear, renombrar o eliminar un espacio, cambiar Mantener despierta:
  `WAKES_FIRST` en `apps/mobile/src/lib/hosts.ts`) la encienden antes por el plano de control.
  Una máquina propia apagada no se puede despertar: no se le manda la acción
  (`machine_asleep`) y se dice en tono neutro. Apagada nunca se pinta como
  error.
- En iOS y Android la cuenta de Danil es la sesión de Supabase y es lo único que se guarda de
  ella, en el llavero (`apps/mobile/src/lib/supabase.ts`). Nada de contraseñas ni tokens
  propios.
- En la web (`<base>m/`, `web-mobile.mjs`) todo va por el borde `/v1`, como la web y Desk:
  la cookie del borde, identity, organizaciones y `/v1/machines` con ticket de un solo uso
  (`src/lib/edge.ts`, `src/lib/edge-account.tsx`). Las pantallas no eligen plano de control:
  lo inyecta la cuenta (`src/lib/controlPlane.ts`), y lo que solo existe con el portador de
  Danil Machines (push, memoria, directorio) no se ofrece por el borde. Nada de Supabase ni
  de mensajería en ese camino.
- Los nombres de comandos y campos son los del motor (`send_message`,
  `respond_permission`, `esperando`); no se traducen en la app.
- Todo texto que se lee viene de `apps/mobile/src/lib/i18n.ts`, en `es` y `en`. Las palabras
  que comparte con el escritorio (lista, filtro, dock, máquinas) salen de `w()`,
  con la clave del catálogo del escritorio (`WORDS` en `@terminus/design`).
- Lo que comparte con el escritorio viene de `packages/` en la raíz y no se
  copia aquí: colores, estado y palabras de `@terminus/design`; la lista plana,
  el filtro, la tarjeta de dos líneas y el dock de `@terminus/tasks`; el cliente
  de Danil Machines de `@terminus/computers`; comandos y tipos de
  `@terminus/protocol`. Dentro de `packages/` los imports llevan `.ts` y entre
  paquetes van por ruta relativa (`../../design/src/index.ts`).
- El estado de una tarea se pinta solo con `apps/mobile/src/ui/TaskStatus.tsx`, sobre
  `@terminus/design`; qué lleva cada línea de la tarjeta lo decide `taskCard`,
  y la vista previa, `taskPreview`.
- Los íconos son los de Lucide del escritorio (`apps/mobile/src/ui/Icon.tsx`) y las marcas
  de proveedor, las de `apps/desktop/src/ui/icons.tsx` (`apps/mobile/src/ui/BrandMark.tsx`). Nada de SF
  Symbols sin par en Android: en Android no se ven.
- Las hojas de la pila (`formSheet`) no pintan cabecera en Android: su título
  va en el contenido (`SheetTitle`).
- `apps/mobile/src/lib/hosts.ts` y `apps/mobile/src/lib/engine.ts` no importan React Native: así los
  recorre `computers:smoke` en Node. Mantenlo así.
- `package.json` fija `react-dom` a la versión de `react` en `overrides`: sin
  eso npm no resuelve ninguna instalación nueva.
- Nunca apuntes el bridge a los datos de un Danil instalado: usa el lab. Y no
  pruebes contra `computers.danil.ai` sin la sesión de la persona: usa el falso.
- No agregues pruebas unitarias de pantallas. Se comprueba en el simulador o en
  un teléfono, y se dice qué se tocó y qué no.
