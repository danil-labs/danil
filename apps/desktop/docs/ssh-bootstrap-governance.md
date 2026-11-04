# El alta por SSH es bootstrap, no autorización

**Estado:** PROPUESTA · 2026-11-03

**Toca tres repositorios:** `danil-labs/terminus` (ventana, web, móvil y
`packages/`), `danil-labs/computers` (plano de control y relay) y
`danil-labs/seldon-host` (motor).

**Decisión en una línea:** SSH sirve para instalar y transportar; la máquina se
inscribe igual en la cuenta, y toda conexión —también la directa— presenta un
token de miembro que el motor valida contra el workspace.

## Problema

Hoy conectar otra máquina es: copiar un comando, correrlo allá, aprobar un
código en la web y esperar a que el relay la vea
(`packages/computers/src/connect.ts`). Funciona y es gobernable, pero pide
demasiado para el caso común: alguien con un VPS o una segunda laptop.

Dray resuelve lo mismo con una línea: pegas `ssh root@1.2.3.4`, la app instala,
lee el token por esa misma sesión y guarda el servidor
(`monorepo-labs/dray`, `servers.rs`). Es una UX que vale copiar. Lo que no se
puede copiar es su modelo de confianza: en Dray no hay cuenta ni organización,
así que SSH es a la vez el alta y la autorización.

En Danil esas dos cosas están separadas y deben seguir separadas.

- **SSH prueba acceso a la máquina, no pertenencia al workspace.** Una persona
  puede tener llave al VPS de la organización y no tener derecho a manejarlo
  como agente dentro de un workspace, o no tenerlo ya.
- **Una máquina fuera del plano de control no se gobierna.** No aparece en
  `GET /v1/computers`, no cuenta uso, no pasa por política, no se audita y no
  respeta el techo de permisos de la organización.
- **El offboarding no revoca llaves SSH.** Si SSH autoriza, sacar a alguien de
  la cuenta no le quita el acceso: su llave sigue en el `authorized_keys` del
  servidor. La revocación real vive en la cuenta y en la credencial de la
  máquina, no en el sistema operativo.
- **Dos modelos de confianza terminan en el flojo.** Si el camino SSH no exige
  lo mismo que el relay, con el tiempo todo pasa por SSH y la gobernanza queda
  decorativa.

El caso de una máquina **ya inscrita** es distinto: ahí SSH es solo otra
tubería hacia la misma máquina gobernada. El relay ya filtra por los workspaces
vinculados (`MachineInfo.linked`, `linkedOnly` en `packages/fleet`), y una
conexión directa puede reutilizar ese mismo filtro. Lo que no puede es tener uno
más débil.

## Decisión

1. **SSH es bootstrap y transporte; nunca autorización.** Se usa la llave del
   sistema para correr el instalador y leer el resultado. No se copia, no se
   guarda y no se convierte en credencial de Danil.
2. **La inscripción sigue siendo de la cuenta.** La máquina recibe identidad,
   aparece en el plano de control, materializa sus workspaces y abre su sesión
   de relay, igual que hoy. SSH solo evita el copy-paste.
3. **Toda conexión presenta token de miembro.** También la directa. El motor
   valida workspace vinculado, modo de permisos, cuotas y licencia; el relay y
   la conexión directa comparten el mismo filtro, no dos.
4. **El código de alta sigue existiendo.** Es corto (10 min), está acotado a los
   workspaces donde esa persona puede inscribir y, en organización, lo aprueba
   quien tiene autoridad. La llave SSH no sustituye esa aprobación.
5. **En organización, SSH-directo apagado por defecto.** Las máquinas de la
   organización van por relay salvo una excepción explícita. En cuenta personal
   se permite, etiquetado como conexión directa.
6. **La máquina conserva la última palabra.** Aunque alguien tenga SSH, el motor
   rechaza la llamada si el token de miembro no vale para ese workspace o si la
   máquina no está vinculada. El acceso al sistema no otorga acceso al dominio.

## Modelo de confianza

| Identidad | Qué prueba | Qué autoriza |
| --- | --- | --- |
| Llave SSH del sistema | Acceso al sistema operativo | Instalar y leer el resultado del alta. Nada dentro de Danil. |
| Código de alta | Intención de inscribir, por 10 min | Inscribir la máquina en los workspaces donde la persona puede hacerlo. |
| Credencial de la máquina | Identidad de la máquina ante el plano de control y el relay | Abrir la sesión de relay y materializar sus workspaces. Vive solo en el motor. |
| Token de miembro | Identidad de la persona en ese workspace | Crear, leer y operar tareas, con el techo de permisos que ya aplica. |
| Política de la organización | Techo de la cuenta | Permisos, cuotas, conexiones externas y auditoría. |

El token de miembro es el que ya usa la ventana para hablar con otras máquinas
(`account_relay_token`, de vida corta). El relay lo valida hoy; una conexión
directa tiene que validarlo el motor, contra el plano de control si hay red.

## Flujo

1. La ventana pide un código de alta a la cuenta, acotado a los workspaces de la
   persona.
2. La ventana corre por SSH el instalador con el código (mismo `install.sh` de
   `danil machines connect`).
3. La máquina se inscribe. Aparece en `GET /v1/computers` como inscrita, todavía
   no en línea.
4. La máquina abre su relay y manda su `hello` con contrato, versión y
   `features`.
5. La ventana conecta por relay. Si la cuenta lo permite, puede conectar directo
   por SSH o loopback, siempre con el token de miembro.
6. Un fallo dice en qué tramo quedó: cuenta, aprobación, relay o versión, como
   los `ConnectHop` actuales.

La aprobación no desaparece: en cuenta personal la da la persona; en
organización, quien tenga autoridad para inscribir máquinas. Lo que desaparece
es tener que escribir comandos en la otra máquina.

## Reglas por tipo de cuenta

**Cuenta personal.** SSH-directo permitido. La máquina sigue gobernada: uso,
cuotas y auditoría aplican igual. La UI la marca como conexión directa para que
nadie confunda «tengo SSH» con «esto no pasa por mi cuenta».

**Organización.** Por defecto, solo relay. Un interruptor por organización
—nombre tentativo `allow_direct_machines`— puede habilitar el camino directo;
aun encendido, la máquina debe estar inscrita y vinculada al workspace, y el
motor sigue exigiendo token de miembro. Sin red al plano de control, una
conexión directa de organización se rechaza o se marca como no gobernada y no
acepta tareas. La opción segura es rechazar.

## Offboarding

- **Sale un miembro:** sus tokens de miembro dejan de valer en todas las
  máquinas, incluidas las que usa por SSH-directo. Esa es la propiedad que el
  modelo de Dray no puede dar.
- **Se retira una máquina:** el motor cierra la sesión de relay y rechaza
  llamadas nuevas. La llave SSH sigue existiendo en el servidor, pero ya no
  autoriza nada dentro de Danil.
- **Se rota la credencial de la máquina:** se cortan las sesiones abiertas y la
  copia del relay.
- **La llave SSH no se administra desde Danil.** Es del sistema y se queda. Este
  ADR lo dice explícitamente para que nadie asuma que retirar la máquina la
  revoca; quien tenga la llave conserva el acceso al sistema operativo, aunque
  no al dominio.
- **Tareas en curso:** al retirar un miembro o una máquina, sus tareas se
  cancelan o se traspasan; no quedan corriendo sin dueño.

## Consecuencias

- Se conserva un solo modelo de máquina y un solo filtro de workspace. El alta
  por SSH ahorra copy-paste sin abrir un agujero.
- El instalador tiene que aceptar el código por argumento o entorno y no
  imprimir secretos.
- El motor necesita validar el token de miembro también en conexiones que no
  vienen del relay.
- El plano de control necesita el interruptor por organización y saber mostrar
  qué máquinas entraron por camino directo.
- Riesgo residual: quien tenga SSH **y** un token de miembro válido puede
  operar. Es el mismo poder que por relay, y queda auditado. Sin token, no.
- Riesgo residual: una máquina apagada o sin red al plano de control no puede
  validar cuotas. En organización se rechaza la conexión directa.

## Alternativas rechazadas

- **SSH como autorización, como Dray.** Es la más simple, pero rompe la
  gobernanza y el offboarding de una organización.
- **Solo relay, sin SSH.** Es seguro, pero deja la fricción que este ADR quiere
  quitar.
- **Guardar la llave SSH en Danil.** No: es una credencial de infraestructura,
  no de producto, y su ciclo de vida no es el de la cuenta.
- **Una «máquina directa» que no aparece en el plano de control.** Crea dos
  modelos de confianza y el flojo gana.

## Fuera de alcance

- **WSL en Windows.** Usa el mismo modelo con bootstrap local (`wsl.exe`) y
  relay como camino principal; merece su propio ADR.
- **Actualizar la máquina desde la app.** Es la otra mitad de la comodidad de
  Dray (`update_server` con canal por máquina y reinicio cuando está idle), pero
  va aparte.

## Preguntas abiertas

- ¿El código de alta lo puede pedir cualquier miembro, o solo un admin en
  organización?
- ¿Se permite la conexión directa con el plano de control caído? Propuesta: no
  en organización; en cuenta personal, sí con aviso.
- ¿Cómo se ve una máquina directa en la barra y en la fila: etiqueta, ícono, o
  solo en el detalle?
