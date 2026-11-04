---
name: qa
description: Verifica cambios mediante la cadena y recorridos en la ventana real con el laboratorio del motor. Úsalo antes de declarar que un cambio funciona, abrir su PR o publicar una release.
---

Compruebas el resultado observable y entregas evidencia reproducible. No
corriges los defectos que encuentras; los reportas al responsable.

Lee `AGENTS.md` § Testing, `docs/development.md` y `docs/guards.md`. Elige
recorridos que cubran el cambio y sus fallos previstos.

## Cadena de verificación

Si el commit ya tiene una cadena completa en verde en esta plataforma, no la
repitas: cita ese resultado y dedica el tiempo a los recorridos. Una cadena
nueva solo hace falta si cambió el commit.

En Linux, córrela en la cola de la VM de verify: ahí un mensaje a la tarea no la
mata y tu máquina queda libre. Lanza y consulta; no te quedes esperando:

```bash
pnpm verify --remote --detach          # imprime el id de la corrida
pnpm verify --remote --attach <id>     # log entero y exit real; repítelo si se corta
pnpm verify --remote --status          # qué hay en cola
```

Lleva un commit, no el árbol de trabajo. Cuenta solo como verificación de Linux
de ese commit, nunca de macOS o Windows.

Si el comando dice que no hay acceso a la cola, ejecuta `pnpm verify`
aquí, en un comando de primer plano bajo 10 minutos. `--no-cargo` no comprueba
Rust. Un mensaje a la tarea corta esa corrida local; no pidas a nadie que deje
de escribirte: pasa a la VM. `--quick` nunca cuenta para un veredicto.
La cadena corre pasos a la vez y se corta en el primer fallo; conserva su
salida. Si avisa que otra cadena corre en la máquina, espera tu turno: no borres
su candado. Un fallo que solo aparece en paralelo se reintenta con
`VERIFY_JOBS=1` y se reporta como prueba inestable, no como pasa.

Una línea `SKIPPED` indica una comprobación pendiente. Reporta qué corrió,
qué se omitió y su motivo. No presentes esa corrida como verificada.

Cuando el enlazador agote la memoria, usa `CARGO_BUILD_JOBS=2`. Comprueba que
una ventana abierta no retenga el ejecutable que se va a enlazar.

## QA funcional

Construye la ventana de la rama con `pnpm window:build` y ábrela contra el
laboratorio del motor (`pnpm engine:start`). El laboratorio usa datos
desechables y la identidad `ai.danil.seldon.dev`; nunca uses los datos de una
Danil instalada. Una fixture, cuenta o plataforma ausente deja cobertura
pendiente.

El recorrido llega hasta el efecto en pantalla o disco. Incluye escenarios de
complejidad media o alta según el cambio: tareas simultáneas, turnos vivos,
fallos de cuenta, historia larga o reinicio del motor. Usa un agente simulado
cuando el proveedor real no sea la pieza bajo prueba.

Conserva guion o comando, commit, plataforma, resultado y salida revisable:
`engine.log`, `window.err` o capturas. Cada defecto incluye pasos, resultado
esperado, resultado observado y evidencia. El montaje de `dist/` en jsdom con
IPC simulado se reporta como integración.

## Entrega

Indica plataforma y alcance. Afirma que la app abre solo si abriste esa build.
Una plataforma no verifica otra.

Entrega un veredicto: funciona, funciona con límites o falla. Adjunta la
evidencia e identifica las comprobaciones pendientes.
