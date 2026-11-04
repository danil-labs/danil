# GitHub por workspace

Cada workspace conecta su cuenta y elige qué cuentas u organizaciones de GitHub
usa. Dentro de cada una hereda todos los repositorios que su instalación de
GitHub permite, también los que se creen después, sin confirmación en Danil.
Decisión del 2026-10-19: si el GitHub de la persona ya concede el acceso,
Danil no lo restringe por repositorio. Para ampliarlo o reducirlo se cambia la
instalación en GitHub.

## Conectar

1. Abre Configuración → Control de Fuentes → GitHub y conecta la cuenta.
2. El selector oficial de GitHub permite instalar o configurar la App en una
   cuenta personal u organización, aunque existan instalaciones previas.
3. Al volver a Danil, elige las cuentas que usará este workspace.
   Administrar permisos en GitHub no repite el inicio de sesión.

La cuenta conectada y «Acceso de este workspace» resumen las cuentas elegidas.
La fila «Repositorios» dice «Acceso: todos los repositorios que tu GitHub
permite» y su botón «Cambiar en GitHub» abre la configuración de la instalación.
«Cambiar acceso» abre el selector de cuentas y «Listo» lo oculta. La selección de
repositorios como fuentes corresponde al compositor. El menú «Más acciones de
GitHub» reúne «Administrar permisos en GitHub», «Comprobar conexión» y
«Desconectar».

Desconectar o quitar una cuenta afecta solo al workspace actual; no desinstala la
App en GitHub. Las conexiones anteriores con repositorios confirmados pasan a
heredar sin ningún paso: el motor conserva el campo `repository_ids` pero ya no
lo usa.

## gh opcional

La conexión de GitHub no necesita `gh`. En Configuración, «Herramientas para
agentes» está plegado y permite descargar una versión compatible si un agente
la necesita. Los errores de descarga siguen visibles al plegarlo y una versión
incompatible muestra «Requiere atención». El motor descarga el artefacto
oficial y comprueba su SHA-256; no depende de Homebrew ni winget. El agente
puede solicitarlo con `terminus github install` y consultar su disponibilidad
con `terminus github status`.

El `gh` gestionado consulta un intermediario local del motor. Recibe un permiso
de sesión del workspace y no la credencial externa de GitHub. El motor limita
las operaciones a los repositorios que GitHub permite a las cuentas elegidas; las
consultas y escrituras admitidas se revalidan en cada llamada. Las operaciones de
cuenta (`/user/*`, gists, llaves, administración de organizaciones, búsqueda
global) siguen bloqueadas. Una operación desconocida se rechaza.
El proceso nativo del agente conserva su acceso al equipo: esto no es un sandbox.

## Ventana y motor

La ventana implementa selección, retorno del navegador e instalación a demanda.
La bóveda, la resolución del alcance en GitHub, el intermediario y el entorno de
agentes pertenecen al motor privado. `check_environment` comunica el inventario
opcional `githubCli`; `install_gh` es el comando existente. No se agrega un
comando ni se cambia el hash del contrato RPC1 congelado.

Esta interfaz necesita el portado correspondiente del motor. Para distribuir
la función completa se debe publicar ese motor y actualizar
`seldon-runtime.lock` con sus artefactos verificados. El lock anterior no
acredita aislamiento por workspace ni soporte del intermediario. Los PRs de
ventana y motor se revisan coordinadamente antes de una release.

`node tests/helpers/github-workspace-ui.mjs`, después de `pnpm build`, comprueba
el selector de cuentas, el resumen del acceso heredado, que no exista paso de
confirmación y las herramientas opcionales sobre el frontend
compilado con IPC simulado.
Es integración; no prueba el navegador nativo, login o permisos reales de GitHub.
