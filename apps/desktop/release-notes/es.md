Danil 0.3.0 trae el motor con traspaso de proveedor y el nombre Danil en toda la app. Es una pre-release: no reemplaza la versión estable hasta que se promueva.

- **La app se llama Danil.** El instalador, la carpeta y los archivos descargables pasan a «Danil». Una copia 0.2.x instalada como Terminus se actualiza en su lugar y retira su entrada anterior.
- **Traspaso de proveedor.** Una tarea normal cambia de CLI (Claude, Codex u OpenCode) sin perder la conversación: el turno nuevo recibe el contexto y, al volver al CLI original, retoma su sesión con lo que pasó mientras no estaba.
- **Cuándo se puede cambiar lo decide el motor.** Se rechazan las tareas adoptadas, los subagentes, las tareas con encargado y las que tienen un turno vivo. El presupuesto se calcula con la ventana del modelo de destino; si no alcanza, el turno lo dice en vez de recortar la conversación.
- **machines.danil.ai.** Es el host de omisión de Danil Machines; computers.danil.ai sigue respondiendo.
- **Un solo inicio de sesión.** La ventana abre el navegador una vez y conecta el motor con esa misma aprobación. Cerrar sesión cierra las dos cosas a la vez.
- **Danil Machines.** Es el nombre visible de las máquinas y el grupo del CLI (`danil machines`, `dn machines`); `computers` queda como alias oculto.
- **Consumo para Harness.** El motor reporta el consumo de cada turno a Danil Machines, que lo guarda para el panel de Harness.

El motor y los recursos se fijan por versión y SHA-256. Esta pre-release no cambia el enlace de descargas de la versión estable ni la actualización automática de las copias instaladas: se instala desde su página de GitHub.
