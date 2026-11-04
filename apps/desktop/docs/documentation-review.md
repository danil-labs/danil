# Revisión documental: transición a Danil

Los registros siguientes conservan evidencia histórica por fuente. La sección
«Reconciliación con dev» registra el estado vigente del PR #541.

Fecha: 2026-10-31. Base: `fa8f850`; código del cliente comprobado: `3e7649f9`.
Plataforma: Linux x86_64. Alcance: documentación modificada por la transición
CLI y marca, no una auditoría completa del monorepositorio.
La persona autorizó la migración; architect aprobó conservar las identidades
instaladas y revisó el cliente hasta `4a8189bf`. El delta posterior conserva
ese alcance y requiere la revisión final junto al motor.

No había una evaluación anterior en este directorio. Medición: `AGENTS.md`
de raíz, escritorio y móvil tienen 45, 74 y 90 líneas; README, guía CLI,
desarrollo, guards y README npm suman 599 líneas antes de este registro.
La guía CLI tiene 82 líneas y 4659 bytes. No se cambió lo autocargado.

| Criterio | Estado | Evidencia en el alcance |
|---|---|---|
| Instrucciones de raíz | pasa | [Raíz](../../../AGENTS.md) define dev primero; [escritorio](../AGENTS.md) aplica las reglas del cliente. |
| Alcance por ámbito | pasa | Guías separadas de front, scripts, tests y móvil, leídas antes de editar. |
| Invariantes | pasa | [CLI](danil-cli.md) enumera identidad, datos, RPC, rutas y actualización que se conservan. |
| Arquitectura | pasa | [Motor](engine-client.md) y guía CLI separan ventana, motor, launchers e integración pendiente. |
| Decisiones | pasa | Encargo autorizado del 31 de octubre; dictamen architect `0y6sqg30`: conserva productName y binario físico. |
| Arranque | pasa | README enlaza la guía; `node apps/desktop/scripts/cli-path.mjs --help` ejecutado desde la raíz. |
| Límites operativos | pasa | Guía declara colisiones, propiedad, PATH manual, pin y comprobaciones nativas pendientes. |
| Coherencia global | sin comprobar | No se auditó toda la documentación anterior. El encargo exige dev y prohíbe Actions/publicación. |
| Navegación | pasa | README, desarrollo y README npm enlazan la guía CLI; guard doc-paths pasa. |
| Presupuesto global | sin comprobar | Se midieron líneas; no se definió ni auditó un presupuesto global de autocarga. |
| Controles | pasa | cli-path y cli-forward ejecutan código real; la guía separa simulación de ventana nativa. |
| Secretos | pasa | Documentos modificados usan placeholders y rutas públicas; no se añadieron credenciales. |
| Construcción | pasa | `CARGO_BUILD_JOBS=2 pnpm window:build` terminó con código 0 en Linux. |
| Pruebas completas | pasa | `CARGO_BUILD_JOBS=2 pnpm verify` terminó con código 0 en Linux, 730 s; incluye Cargo fmt/check/clippy/test. |
| Verificación | pasa | [Guards](guards.md) documenta la cadena y la cobertura del instalador. |
| Estilo | pasa | Lint del instalador y sus pruebas, doc-paths, comments y git diff --check pasan. |

**14 pasan · 0 fallan · 2 sin comprobar.**

QA nativo verificó título, pie y Configuración con Danil; reiniciar conservó
workspace e idioma. El principal repitió 32/32 comprobaciones E2E del motor.
La entrega del motor registra además 378/378 de runtime y 145/145 de arranque;
se inspeccionaron sus resultados JSON. cli-path y cli-forward suman 8/8 con
26 raíces del motor fijado. El delta final de PATHEXT vacío se comprobó aparte
con 6/6 pruebas del instalador y lint, después del paso correspondiente de la
cadena; no cambió Rust ni la UI.

Pendientes de integración: revisión arquitectónica final del motor/cliente;
manifest y checksums multiplataforma antes de cambiar el pin. No se autorizaron
publicación, instalaciones productivas ni pruebas de actualización instalada.
Los resultados de Linux no acreditan cmd, PowerShell, Git Bash, macOS ni móvil
nativo. Los nombres de distribución Terminus siguen siendo intencionales.

## Delta: CLI operativo exclusivo

Fecha: 2026-10-31. Base del delta: `c8ba7a63`; cliente: `47e8b56b`.
Plataforma: Linux x86_64. La persona sustituyó la compatibilidad CLI anterior:
los únicos nombres operativos son `danil` y `dn`. El encargado architect
`bxdyvc6e` aprobó el diff del cliente sin hallazgos. El cierre del motor se
registra por separado; su integración sigue fuera del pin de este cliente.

Medición: README, guía CLI, desarrollo, guards y README npm suman 614 líneas y
34,514 bytes. La guía CLI tiene 96 líneas y 5,495 bytes. No cambió `AGENTS.md`.

| Criterio | Estado | Evidencia del delta |
|---|---|---|
| Instrucciones de raíz | pasa | Se conserva la regla dev primero, DCO y Conventional Commits. |
| Alcance por ámbito | pasa | Se leyeron las guías de escritorio, scripts y tests antes del cambio. |
| Invariantes | pasa | Pin, RPC e identidades persistidas tienen diff vacío contra `c8ba7a63`. |
| Arquitectura | pasa | Architect revisó los siete archivos de `47e8b56b`; la guía distingue forwarding interno de comandos instalables. |
| Decisiones | pasa | El encargo explícito retira compatibilidad CLI legacy y conserva los contratos de distribución y datos. |
| Arranque | pasa | Ayuda del launcher ejecutada; npx resuelve el único bin local `danil-terminus` sin instalar la app. |
| Límites operativos | pasa | La guía declara colisiones, propiedad, PATH, helper con `--data`, pin y límites nativos. |
| Coherencia global | sin comprobar | Se revisó este delta; no se auditó todo el histórico documental. |
| Navegación | pasa | README y README npm enlazan la guía; doc-paths pasa. |
| Presupuesto global | sin comprobar | Conteos medidos; no se definió un presupuesto global de autocarga. |
| Controles | pasa | cli-path comprueba el directorio exacto; cli-forward contrasta las 26 órdenes del sidecar fijado. |
| Secretos | pasa | El delta documental usa identificadores públicos y placeholders. |
| Construcción | pasa | Frontend compilado y empaquetado; Cargo check y compilación de tests pasan sobre la misma fuente. |
| Pruebas completas | pasa | Todos los pasos de verify pasan de forma agregada; Rust termina con 17 pruebas sin fallas ni omisiones. |
| Verificación | pasa | Se ejecutó `pnpm verify` completo; dos corridas se interrumpieron por capacidad y el paso Rust pendiente se terminó aparte. |
| Estilo | pasa | Lint dirigido, doc-paths, fmt, clippy y diff --check pasan. |

**14 pasan · 0 fallan · 2 sin comprobar.**

`pnpm verify` no tuvo una corrida única limpia en este delta. La primera se
interrumpió en cargo check por disco lleno; la segunda pasó frontend, web,
rendimiento, fmt, check y clippy, pero cargo test agotó el tmpfs. Hubo además
un fallo del enlazador bajo ese límite. Sin cambiar fuentes ni opciones de
pruebas, se redistribuyeron artefactos reconstruibles: ejecutables en tmpfs
con ejecución o disco, y archivos `.rlib`/`.rmeta` e incremental en shm.
`CARGO_BUILD_JOBS=1 cargo test --locked` terminó con código 0: 9 pruebas de
biblioteca y 8 de integración, sin fallas ni omisiones.

Evidencia local: `/tmp/danil-only-client-verify.log`,
`/tmp/danil-only-client-verify-retry.log`,
`/tmp/danil-only-client-cargo-test-resolved.log` y
`/tmp/danil-only-client-build-layout.json`. Este último registra la distribución
de artefactos. La caché temporal ejecutable se retiró tras las pruebas;
se conservaron los logs. QA repitió cli-path (6/6), la resolución local de npx
y el instalador Linux del host (10/10) en directorios desechables.

Este delta no cambia la UI ni añade un recorrido visual nativo. No acredita
Windows/macOS nativos, instalación productiva, actualización instalada ni
la adopción del motor nuevo por el cliente fijado. No hubo push ni publicación.

## Reconciliación con dev

Fecha: 2026-10-31. Fuente funcional: `cf0b07ce26484db51407de155eed044bd74dd607`.
Padres: cliente `32ddf199` y `dev` `6352210830af16e1973b836a3cc222d90f2aed00`.
Plataforma: Linux x86_64. Encargo explícito: resolver conflictos, verificar y
actualizar el PR #541 en borrador contra `dev`, sin merge ni distribución.

Se resolvieron los conflictos por intención: interfaz y catálogos recientes de
`dev`, retirada de VersionFooter, onboarding vigente y título web Danil con
los nuevos iconos. La prueba CLI combina selección root/engine/profile con
machine y las órdenes recientes. Pin `4e10efc`, contrato, extensiones y puente
coinciden byte por byte con `dev`; no se adoptó el motor del PR seldon-host #276.
El cliente conserva la excepción `MOTOR_PENDIENTE`: contrato `5f59d603`, motor
fijado `93b1c32f`. Esa diferencia no habilita publicación ni acredita comandos
nuevos del motor.

Medición: raíz/escritorio/móvil tienen 57/76/91 líneas de AGENTS.md. README,
guía CLI, desarrollo, guards y README npm suman 675 líneas y 38,873 bytes.
No se modificó la documentación autocargada frente a `dev`.

| Criterio | Estado | Evidencia de la reconciliación |
|---|---|---|
| Instrucciones de raíz | pasa | Se respeta dev primero, DCO y Conventional Commits con skip ci. |
| Alcance por ámbito | pasa | Guías de escritorio, front, scripts, pruebas y móvil leídas. |
| Invariantes | pasa | Pin, contrato, extensiones y engine-client idénticos a dev. |
| Arquitectura | pasa | Architect 5qgnqe1n aprobó reconciliación y corrección documental sin pendientes. |
| Decisiones | pasa | Encargo explícito de resolución y push al PR existente; motor separado. |
| Arranque | pasa | Ayuda cli-path ejecutada; QA construyó y abrió la ventana real. |
| Límites operativos | pasa | Guía actualiza pin y excepción de contrato, sin acreditar motor exclusivo. |
| Coherencia global | sin comprobar | Se revisa el delta; registros anteriores quedan identificados como históricos. |
| Navegación | pasa | README y README npm conservan enlace a guía CLI. |
| Presupuesto global | sin comprobar | Conteos medidos; no se auditó un presupuesto global. |
| Controles | pasa | cli-path y cli-forward 8/8; forwarding de 29 raíces y checksums. |
| Secretos | pasa | El delta documental usa identificadores públicos y no añade credenciales. |
| Construcción | pasa | QA compiló ventana nativa en target separado, exit 0. |
| Pruebas completas | pasa | CARGO_BUILD_JOBS=2 pnpm verify completo, exit 0, Linux, 1498 s; incluye cargo test --locked. |
| Verificación | pasa | Corrida limpia única sin builds concurrentes; fmt/check/clippy/permisos/test pasan, sin SKIPPED. |
| Estilo | pasa | Diff contra dev y corrección documental pasan git diff --check. |

**14 pasan · 0 fallan · 2 sin comprobar.**

QA c73f16b4 comprobó en GTK/WebKit real sobre Xvfb: marca Danil,
navegación de Configuración, workspace e idioma español conservados al reiniciar
ventana y motor, y danil/dn --help idénticos con exit 0. Informe reproducible:
`/tmp/danil-pr541-qa-c73f16b4/evidence/report.md`; capturas y logs:
`/tmp/danil-pr541-qa-c73f16b4/evidence.tar.gz`.

La primera corrida se interrumpió intencionalmente con SIGTERM (exit 143)
durante pruebas web al advertir compilaciones Vite concurrentes sobre dist;
no fue un fallo atribuido al código. Se conserva su log en
`/tmp/danil-reconcile-verify.log`. QA terminó antes del reintento limpio,
registrado por separado en `/tmp/danil-reconcile-verify-clean.log`.

No se verificaron Windows/macOS nativos, móvil nativo, proveedores reales,
instalación productiva ni actualización instalada. QA observó la compuerta
inicial de cuentas IA y pudo entrar al reabrir; no se atribuye regresión sin
comparar con la base. No se ejecutaron Actions ni se publicó o desplegó.

Resultado recogido: `pnpm verify` completo terminó con exit 0 en 1498 s,
sin fallas ni pasos omitidos. Cargo fmt/check/clippy/test y permisos pasan.
Los únicos cambios posteriores a la fuente funcional son esta evidencia y la
aclaración de contrato en la guía CLI; se repiten sus guards documentales.
Durante la verificación `dev` avanzó a `943b3c61` (PR #542, eliminación de
columna derecha); no forma parte de la fuente verificada. `git merge-tree`
confirma integración sin conflictos contra esa cabeza sin modificar fuentes.
La mergeabilidad remota se comprueba después del push; no se acredita aquí la
prueba funcional de un merge posterior con ese delta.
