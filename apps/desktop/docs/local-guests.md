# Máquinas locales

La integración «Linux en esta Mac» mediante Lima está retirada. La ventana no
lista ni conecta instancias de Lima y no conserva el canal `lima` como opción.

En Windows permanece [Linux en esta PC mediante WSL](wsl-local-machine.md).
Sus canales y trabajos viven en `src-tauri/src/extracted/guests/mod.rs`,
`wsl.rs`, `wsl_setup.rs` y `child.rs`.

Las otras máquinas se conectan mediante Danil Machines; no se convierten en
huéspedes locales de la ventana.
