# GitHub de la persona

Con sesión de Danil, la conexión de GitHub pertenece a la persona y se usa en
sus máquinas. GitHub decide qué instalaciones y repositorios puede ver cada
cuenta. La GitHub App se instala en la cuenta personal u organización; sus
administradores controlan esa instalación.

## Conectar y elegir repositorios

1. Abre Configuración → Control de código → GitHub y conecta la cuenta.
2. Autoriza la App en GitHub. Si ya está autorizada, GitHub puede omitir esa pantalla.
3. Confirma en el navegador la cuenta de Danil que inició la conexión.
4. En Danil, usa «Cambiar» en una instalación para elegir los repositorios que
   usará tu conexión. La selección es personal y se aplica a tus máquinas.

La selección no cambia los permisos de otras personas ni la instalación de la
organización. Solo se ofrecen repositorios que la cuenta de GitHub puede ver y
que la instalación de la App alcanza. Una selección vacía no concede ninguno.
Para instalar la App en otra organización se usa «Añadir organización»; GitHub
puede requerir la aprobación de una persona administradora.

La confirmación del navegador vincula la autorización a la cuenta de Danil que
inició el flujo. El estado del enlace dura diez minutos y se consume una vez.
Al concluir, el escritorio muestra «GitHub quedó conectado»; la web vuelve a
Danil. Repetir una confirmación consumida muestra «Este enlace ya no vale»,
aunque el primer intento haya conectado la cuenta.

Las máquinas con un motor anterior no reciben el token después de establecer
una selección personal: deben actualizarse para usar GitHub. El servicio rota
el token anterior y notifica el cambio a las máquinas de la persona.

Sin sesión de Danil, la conexión local de la App dice «Solo en esta máquina».
Una conexión de la App anterior pide volver a conectar con Danil. El campo
legado `repository_ids` se conserva por compatibilidad; el alcance personal
se guarda aparte como `personal_repository_ids`.

## GitHub CLI

El motor prepara `gh` automáticamente cuando hay una conexión de GitHub. Usa
una instalación compatible si ya existe; en caso contrario, descarga el
artefacto oficial en una carpeta privada y comprueba su SHA-256. La descarga
ocurre en segundo plano. Si un comando se ejecuta antes de que termine, puede
fallar y volver a intentarse en la misma tarea después de la instalación.

El `gh` gestionado consulta un intermediario local. Recibe un permiso de sesión
del workspace, no la credencial externa de GitHub. Las operaciones admitidas
se revalidan contra los repositorios elegidos y los permisos actuales de GitHub.
Las operaciones de cuenta y las rutas desconocidas se rechazan. El proceso
nativo del agente conserva acceso al equipo: esto no es un sandbox.

## Compatibilidad y validación

La interfaz, el servicio de Machines y el motor deben entregarse de forma
coordinada. La ventana no añade comandos al contrato RPC congelado. Para
distribuir el motor se requieren sus artefactos verificados y la actualización
de `seldon-runtime.lock`.

La prueba de Configuración monta el frontend compilado con IPC y servicio
simulados. Las pruebas del motor usan `gh` oficial contra un servidor de
laboratorio. Esas pruebas no sustituyen una conexión real en la ventana ni una
prueba en Windows.
