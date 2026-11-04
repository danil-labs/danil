# Propuesta: credenciales de la cuenta de Danil para aws, gcloud y otros CLIs

Fecha: 2026-11-04. Rama `docs/account-cli-credentials`, desde `origin/dev` de
`danil-labs/danil` @ `71ba91f2`. Estado: **propuesta sin aprobar. No incluye
código.**

Leído antes de proponer:

- motor `danil-engine` en `origin/dev` @ `0bd55827`; las rutas de motor son
  relativas a `crates/existing-runtime/src/` salvo que se diga otra cosa;
- `danil-labs/computers` en `origin/dev` @ `473be82`;
- las propuestas abiertas #666 (pausa por credencial, `2026-11-03-credential-wait.md`)
  y #667 (proveedores permitidos, `2026-11-03-workspace-provider-policy.md`).

Lo que viene de documentación de terceros y no se midió aquí lleva la marca
**sin verificar**.

## Veredicto

**Construir una versión reducida: solo AWS, con la sesión de IAM Identity
Center de la persona guardada en la cuenta.** Copia el modelo de GitHub de la
cuenta pieza por pieza. No necesita un intermediario HTTP.

Para los demás CLIs la respuesta es más corta de lo que parece:

- Los que usan un **API token fijo** (Cloudflare/`wrangler`, Vercel, Stripe,
  Supabase, bases de datos) **ya funcionan en cualquier máquina** con los
  secretos genéricos `env_secret` (`secrets_v1`). Falta documentarlo, no
  construirlo.
- GCP, Azure y Kubernetes van después y comparten otro mecanismo (Danil como
  emisor OIDC, §4.2). Requiere una decisión aparte (D2).
- Un proxy HTTP local para nubes **no se recomienda** (§6).

## 1. Problema

La persona trabaja en varias máquinas (su Mac, VMs, máquinas de Danil). En
cada una, `aws`, `gcloud`, `az`, `kubectl` dependen de la sesión de esa
máquina:

- **En cada máquina nueva hay que iniciar sesión otra vez.** Una tarea
  delegada a otra máquina falla o pide un login que nadie ve.
- **Cuando caduca una sesión compartida, varias tareas piden su propio
  login a la vez.** Es el incidente de danil-engine#328: tres hijas, tres
  códigos de dispositivo de AWS SSO, ninguno aprobado.
- **El agente ve y maneja la sesión de la persona.** Hoy un agente puede
  correr `aws sso login`, `aws configure` o leer `~/.aws/` sin que Danil
  intervenga.

Con GitHub esto ya no pasa: la conexión vive en la cuenta y cualquier máquina
ligada recibe un token de 8 h (§2). La persona pide lo mismo para el resto.

Quién lo encuentra y cómo lo ve: la persona, al abrir una tarea en otra
máquina (el agente le pide un login) o cuando caduca una sesión (varias
tareas piden códigos). No es una preferencia: es trabajo detenido y una
acción repetida por máquina y por tarea.

## 2. Lo que ya existe (medido en el código)

| Pieza | Dónde | Qué aporta |
|---|---|---|
| GitHub de la cuenta, Worker | computers `src/github.ts`, `src/github-credential.ts`, `src/github-routes.ts` | Un Durable Object **por workspace** (`GithubCredential`) hace en fila todo lo que usa el refresh token, porque GitHub lo rota en cada uso. El refresh token se guarda cifrado con AES-256-GCM y una llave del Worker (`credential_secrets`). Cada máquina pide `POST /v1/workspaces/:id/github/token` con su credencial de máquina; el Worker reutiliza el último token si le quedan más de `REUSE_MARGIN_MS` y revoca el anterior al emitir uno nuevo. Estados `ok`, `not_connected`, `removed`, `reauthorize`, `unavailable`. |
| GitHub de la cuenta, motor | `danil/github_account.rs` | Caché del token en la bóveda del workspace (`Proveedores` / `github-account`). Se renueva con menos de 5 min de vida, una petición en curso por workspace; **sin red se usa hasta que vence**; `credentials.changed` con `kind: github` tira la caché y cierra las sesiones del intermediario. |
| Intermediario de gh | `delivery/github/broker.rs`, `delivery/github.rs`, `docs/github-workspace-isolation.md` | Socket local por sesión; `GH_TOKEN` es un permiso opaco; cada llamada se valida contra el alcance del workspace; un lanzador rechaza `auth`, `config`, `gist`… con código 64; `GH_CONFIG_DIR` y las cachés quedan en la carpeta de la sesión; el entorno vacía `GITHUB_TOKEN` y los proxies. **El agente nunca ve el token de GitHub.** |
| Secretos genéricos | `secrets/env_secrets.rs`, `docs/account-credentials.md` § «Secretos genéricos», extensión `secrets_v1` | Variables (`STRIPE_KEY`, `CLOUDFLARE_API_TOKEN`…) por workspace o carpeta, **selladas para cada máquina** (`TERMINUS-SECRET/1`, X25519 + AES-GCM; el Worker no las puede abrir), inyectadas en el proceso del agente, tachadas en sesión, eventos, log y journal. `danil secret run` las entrega a un proceso que no las heredó. |
| Relay | `crates/connector/src/relay.rs` (`credentials_changed`) | `kind: github` → `github_account_changed`; cualquier otro `kind` → `sync_account_credentials`. Un motor viejo que recibe un `kind` nuevo solo reconcilia sus secretos sellados: no falla. |
| AWS SSO local | `cli/vm.rs` | Ya existe un uso de AWS SSO de la persona (encendido de VMs EC2). Escribe un `AWS_CONFIG_FILE` y un `AWS_SHARED_CREDENTIALS_FILE` temporales, quita las `AWS_*` heredadas y pone `AWS_EC2_METADATA_DISABLED`. Es el patrón de entrega que se reutiliza aquí. |

**Diferencia de confianza entre los dos modelos.** `env_secret` es de
extremo a extremo: el Worker guarda copias que no puede abrir. GitHub no puede
serlo: el Worker **tiene** que leer el refresh token para renovarlo. Toda
credencial que se renueve en la cuenta hereda el modelo de GitHub, no el de
`env_secret` (decisión D3).

## 3. Los tres casos, por proveedor

| Proveedor / CLI | Qué permite (nativo) | Caso | Recomendación |
|---|---|---|---|
| **AWS** (`aws`, SDKs, Terraform, `aws eks get-token`) | IAM Identity Center: autorización por dispositivo y `CreateToken` con `grant_type=refresh_token` (CLI ≥ 2.9.0); `sso:GetRoleCredentials` da credenciales de rol de 1 a 12 h. También `AssumeRoleWithWebIdentity` con un emisor OIDC propio, IAM Roles Anywhere con certificado X.509, y llaves fijas de usuario IAM. Entrega nativa: `credential_process` (JSON con `Expiration`), `web_identity_token_file`, endpoint de contenedor (`AWS_CONTAINER_CREDENTIALS_FULL_URI` en loopback). | 1 | **v1.** |
| **GCP** (`gcloud`, `gsutil`, SDKs) | Workload Identity Federation (`external_account` con `credential_source` de archivo o ejecutable), token de acceso de 1 h por `auth/access_token_file` / `CLOUDSDK_AUTH_ACCESS_TOKEN_FILE`. OAuth de usuario con refresh token: exige una app OAuth de Danil con el alcance `cloud-platform` verificada por Google (**sin verificar** el plazo). | 1 | v2, por emisor OIDC (§4.2). |
| **Azure** (`az`) | Identidad federada (`az login --service-principal --federated-token`). El CLI **no** renueva la aserción solo: hay que repetir el login al vencer (**sin verificar** en el CLI; así lo describen terceros). Los SDKs leen `AZURE_FEDERATED_TOKEN_FILE`. | 1 | v2 o después; peor entrega que AWS y GCP. |
| **Kubernetes** (`kubectl`) | Plugin `exec` del kubeconfig (`client.authentication.k8s.io/v1`, con `expirationTimestamp`). En EKS/GKE/AKS el plugin es el CLI de la nube. | 1, derivado | Gratis cuando su nube esté conectada; nada propio. |
| **Cloudflare** (`wrangler`) | API tokens con alcance (`CLOUDFLARE_API_TOKEN`). La API permite crear tokens con caducidad desde otro token (**sin verificar** para emitir desde el Worker). | 3 hoy (`env_secret`) | `env_secret` ya. Emitir tokens cortos queda para después. |
| **Supabase** (`supabase`) | `SUPABASE_ACCESS_TOKEN` personal; OAuth de la API de administración con refresh (**sin verificar**). | 3 hoy (`env_secret`) | `env_secret`. |
| **Vercel** (`vercel`) | Token con alcance de equipo y caducidad elegida (`VERCEL_TOKEN` / `--token`). | 3 hoy (`env_secret`) | `env_secret`. |
| **Stripe** (`stripe`) | Llaves restringidas (`STRIPE_API_KEY`). | 3 hoy (`env_secret`) | `env_secret`, con llave restringida o de prueba. |
| **GitHub** (`gh`, `git`) | Ya hecho. | 2 | Sin cambio. |

Los tres casos:

1. **Token corto emitido por la cuenta, como GitHub.** El proveedor da
   credenciales con caducidad a partir de algo que la cuenta guarda o firma.
   El alcance lo pone el propio proveedor (rol IAM, permiso de Identity
   Center, cuenta de servicio). AWS, GCP, Azure y lo que cuelga de ellos.
2. **Intermediario que filtra llamadas.** Solo cuando el proveedor no puede
   recortar el token al alcance del workspace **y** su API es una sola API
   HTTP que se puede validar llamada por llamada. Hoy solo GitHub cumple las
   dos cosas (un token de usuario ve todas las organizaciones; el alcance
   del workspace es una lista de repositorios). En las nubes, el recorte lo
   hace mejor IAM que un filtro nuestro (§6).
3. **No conviene centralizar** (más allá de `env_secret`, que ya existe):
   - llaves fijas de larga vida con mucho poder: llaves de usuario IAM,
     JSON de cuenta de servicio de GCP, llave global de Cloudflare, llave
     secreta *live* de Stripe. Si la persona las quiere en sus máquinas,
     `env_secret` las lleva selladas; Danil no las emite ni las rota;
   - lo interactivo: VPN, 2FA, llaves físicas, `aws sso login` con MFA en
     cada sesión. Eso es justo lo que cubre la pausa por credencial (#328).

## 4. Mecanismo

### 4.1 Común: la cuenta emite, la máquina guarda en caché, el CLI pide

```
persona: conecta AWS una vez en Danil (código de dispositivo en el navegador)
Worker:  guarda el refresh token de Identity Center (cifrado, como GitHub)
         y la lista de perfiles del workspace: {nombre, cuenta, rol, región}
agente:  aws s3 ls --profile danil-prod
aws CLI: credential_process = danil aws credential-process --profile danil-prod
motor:   caché en la bóveda vigente → la da
         casi vencida → POST /v1/workspaces/:id/aws/credentials {profile}
Worker:  CreateToken (refresh) en fila por workspace → GetRoleCredentials
         → {AccessKeyId, SecretAccessKey, SessionToken, Expiration}
```

El refresh token **no sale del Worker**. A la máquina solo llegan
credenciales de rol de corta vida, de los perfiles que la persona eligió para
ese workspace. Es el mismo reparto que GitHub: el `ghu_` llega a la máquina,
el refresh token no.

### 4.2 Fuente alternativa: Danil como emisor OIDC (para v2)

El Worker firma un JWT corto con `iss = https://computers.danil.ai`,
`sub = workspace:<id>` y `aud` por proveedor. La persona configura una vez en
su nube que confía en ese emisor:

- AWS: proveedor OIDC de IAM y un rol con condición sobre `sub`
  (`AssumeRoleWithWebIdentity`; entrega por `web_identity_token_file`);
- GCP: un pool de Workload Identity Federation (`external_account`);
- Azure: una credencial federada en una app registrada.

Ventaja: Danil no guarda **ningún** secreto de la nube, y un solo emisor
sirve a las tres. Costo: una pieza nueva crítica (llaves de firma, JWKS,
`/.well-known/openid-configuration`, rotación) y configuración en la nube de
cada persona. La atribución en CloudTrail es el rol, no la persona. Encaja con
organizaciones (Harness), que prefieren roles federados a sesiones
personales. Por eso queda como decisión D2 y no entra en v1.

### 4.3 Por qué AWS primero

- El incidente que originó #328 fue AWS SSO.
- Danil ya usa AWS (VMs EC2 en `cli/vm.rs`, máquinas de build).
- AWS tiene la mejor entrega nativa: `credential_process` lo leen el CLI v1 y
  v2, todos los SDKs y Terraform; con `Expiration`, un proceso largo vuelve a
  pedir solo. GCP con token de acceso no se renueva dentro de un proceso
  largo; Azure exige repetir el login.
- Identity Center no exige configurar nada en AWS: si la persona ya hace
  `aws sso login`, puede conectar en Danil. GCP por OAuth de usuario exige
  verificar una app con Google; GCP por federación exige el emisor de §4.2.
- `GetRoleCredentials` y `CreateToken` usan un bearer o el secreto de
  cliente, sin firma SigV4: el Worker no necesita credenciales de AWS
  propias.

## 5. Primera versión (v1): AWS por Identity Center

Solo Worker, motor y CLI. Sin pantallas.

1. **Conectar** (persona): `danil aws connect --start-url <url> --region <r>`
   abre la autorización por dispositivo de Identity Center **en el Worker**
   (`RegisterClient` + `StartDeviceAuthorization`), enseña un código y una
   URL, y el Worker termina el canje. Una conexión por workspace, como
   GitHub.
2. **Elegir perfiles** (persona): `danil aws profiles` lista cuentas y roles
   (`ListAccounts`, `ListAccountRoles`); `danil aws profile set <nombre>
   --account <id> --role <rol> [--region <r>]` los agrega al workspace. Solo
   los perfiles elegidos se emiten. Es el equivalente de las «áreas» de
   GitHub.
3. **Emitir** (máquina): `POST /v1/workspaces/:id/aws/credentials {profile}`,
   con la credencial de máquina y las mismas comprobaciones que
   `github/token` (dueña, máquina ligada, máquina no quitada). En fila por
   workspace en un Durable Object `AwsCredential`; reutiliza las
   credenciales vigentes de esa máquina si les quedan más de 10 min.
4. **Caché en la máquina**: `danil/aws_account.rs`, copia de
   `github_account.rs`: bóveda `Proveedores` / `aws-account:<perfil>`;
   renovar con menos de 10 min; una petición en curso por workspace; sin red,
   se usa hasta que vence.
5. **Entrega al CLI**: en cada turno y terminal de un workspace con AWS
   conectado, el motor escribe en la carpeta de la sesión un
   `AWS_CONFIG_FILE` con un `[profile <nombre>]` por perfil
   (`credential_process = <ruta del CLI de danil> aws credential-process
   --profile <nombre>`, `region`), un `AWS_SHARED_CREDENTIALS_FILE` vacío,
   `AWS_PROFILE` si hay un solo perfil, `AWS_EC2_METADATA_DISABLED=true`, y
   vacía `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
   heredados. Es lo que ya hace `cli/vm.rs`.
6. **Lanzador**: un `aws` de la sesión, como el de gh, que rechaza con código
   64 `configure`, `sso` y `login`/`logout`, con un mensaje que dice
   «La sesión de AWS es de la cuenta de Danil; reconéctala con
   `danil aws connect`». Así el incidente de #328 no se puede repetir por
   construcción.
7. **`danil aws credential-process`**: ruta de CLI con `authority: task`.
   Devuelve el JSON de `credential_process` (`Version: 1`). Anota la tarea
   que pidió (auditoría, §8).
8. **`danil aws status`**: conectado o no, perfiles, vencimiento de la
   caché, último error (`reauthorize`, `removed`, `offline`). Sin secretos.
9. **Desconectar**: `danil aws disconnect` (persona) borra el refresh token y
   avisa con `credentials.changed {kind: "aws"}`; el motor tira la caché.
   Quitar una máquina usa las rutas comunes
   (`…/credentials/:credential/machines/:computer`).
10. **Instrucción a los agentes**: una línea en el bloque del CLI que inyecta
    el motor: «Si `aws` falla por credencial, no inicies sesión. Ejecuta
    `danil aws status`; si dice `reauthorize`, usa `danil task wait
    --credential aws-account:<workspace>` y termina el turno.»

**Recursos que agrega**, cada uno justificado:

| Recurso | Dónde | Por qué |
|---|---|---|
| Durable Object `AwsCredential` (uno por workspace) | Worker | Serializa el uso del refresh token; dos renovaciones a la vez pueden invalidarlo, como en GitHub (**sin verificar** si Identity Center rota el refresh token en cada uso; se diseña como si sí). |
| Filas en `credentials` (`kind: aws`) y `credential_secrets` (refresh token y registro de cliente, cifrados) | danil-workspace | Reutiliza las tablas de GitHub. Sin tabla nueva si `credential_issued_tokens` admite credenciales de AWS (decisión de `architect`). |
| Llave de cifrado del Worker | Worker | La de GitHub (`GITHUB_TOKEN_KEY`) o una genérica nueva; lo decide `architect`. |
| Entradas `aws-account:<perfil>` en la bóveda | Motor | Caché, como `github-account`. |
| `AWS_CONFIG_FILE`, archivo de credenciales vacío y lanzador | Carpeta de la sesión | Se borran con la sesión. No hay proceso residente ni puerto. |
| Ningún proceso ni tarea de fondo nueva | — | `credential_process` lanza el CLI de danil solo cuando `aws` lo pide. |

**Resultado observable.** En dos máquinas ligadas al mismo workspace, sin
`~/.aws` en ninguna: `aws sts get-caller-identity --profile danil-prod`
responde con el rol `AWSReservedSSO_…` de la persona en las dos; tras
desconectar, falla en las dos en menos de 10 min más la vida de la
credencial vigente; `aws sso login` falla con código 64.

**Cómo se informa un fallo.** `credential_process` sale con código distinto
de 0 y un texto en stderr que el CLI de AWS enseña tal cual:
`aws_not_connected`, `aws_profile_unknown`, `aws_reauthorize` (la sesión de
Identity Center terminó; la persona reconecta), `aws_machine_removed`,
`aws_offline` (sin red y sin caché vigente). `danil aws status` da el mismo
código con `detail`, con la forma de error del motor
(`{code, message_key, detail}`).

## 6. Entrega al CLI: mecanismos comparados

| Mecanismo | Funciona con | Renueva solo | Qué ve el agente | Veredicto |
|---|---|---|---|---|
| `credential_process` (AWS) | CLI v1/v2, SDKs, Terraform | Sí, por `Expiration` | Puede ejecutar el comando y ver la credencial | **v1** |
| `web_identity_token_file` (AWS) / `external_account` con archivo (GCP) | CLI y SDKs | Sí: el SDK vuelve a leer el archivo (comprobado en el SDK de Ruby; **sin verificar** en botocore) | El JWT del archivo | v2, con el emisor OIDC |
| Endpoint de contenedor en loopback (`AWS_CONTAINER_CREDENTIALS_FULL_URI` + `AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE`) | CLI y SDKs | Sí | La credencial (pidiéndola al endpoint) | No: abre un puerto local por sesión y no da nada que `credential_process` no dé |
| `CLOUDSDK_AUTH_ACCESS_TOKEN_FILE` / `auth/access_token_file` (GCP) | `gcloud` | Se lee el archivo; un proceso largo no renueva (**sin verificar**) | El token de 1 h | Posible para GCP si no se hace federación |
| Variables de entorno (`env_secret`) | Todo | No | El valor | Ya existe; es lo correcto para API tokens fijos |
| Proxy HTTP local con CA propia | Solo lo que respeta `HTTPS_PROXY` y confía en la CA | — | Nada del secreto | **No** |

Por qué no un proxy HTTP para nubes:

- Las llamadas de AWS van firmadas con SigV4 por el propio cliente. Un proxy
  tendría que descifrar TLS (CA local de confianza en cada máquina y cada
  runtime: Python, Node, Go, Java guardan la suya), quitar la firma falsa y
  volver a firmar. Es lo que hace Teleport con `tsh aws`, con su propio
  servidor y su CA.
- Filtrar llamada por llamada exige entender cientos de APIs de servicio. IAM
  ya lo hace mejor: el rol y el permiso de Identity Center son el filtro.
- El intermediario de GitHub evitó a propósito una CA local
  (`docs/github-workspace-isolation.md`: «sin servicio nuevo en internet ni CA
  local»). Esto sigue esa línea.

### Herramientas que ya existen

| Herramienta | Qué hace | ¿Sirve aquí? |
|---|---|---|
| aws-vault (99designs) | Guarda llaves en el llavero local y entrega por `credential_process` o por un servidor local de credenciales | No: una sola máquina; el problema es entre máquinas. Su forma de entrega es la que se copia. |
| aws-export-credentials | Exporta credenciales de un perfil; modo `--container` sirve un endpoint compatible con ECS | No: mismo límite. |
| 1Password Shell Plugins (`op plugin`, AWS y muchos más) | Inyecta credenciales guardadas en 1Password al invocar el CLI | Es el equivalente de `env_secret`, con 1Password en cada máquina. No emite credenciales cortas. |
| Teleport (`tsh apps login --aws-role`, Roles Anywhere) | Credenciales de AWS por su proxy y su servidor | Producto completo con servidor propio; no se integra como pieza. |
| HashiCorp Vault, motor de secretos de AWS | Emite STS desde un servidor central | Es el patrón «la cuenta emite», pero requiere un Vault y llaves IAM de larga vida en él. |

Ninguna resuelve «conecto una vez y funciona en todas mis máquinas» sin un
servidor central. El servidor central que ya tenemos es el Worker.

## 7. Dónde vive cada parte

| Parte | Lugar | Por qué |
|---|---|---|
| Refresh token de Identity Center, registro del cliente OIDC, lista de perfiles del workspace, emisión en fila | **Cuenta: Worker de computers** + tablas de **danil-workspace** | Debe sobrevivir a cada máquina y servir a todas. Es donde ya vive GitHub. |
| Caché de credenciales de rol por perfil | **Bóveda del workspace en cada máquina** | Funciona sin red mientras no vence; evita una petición por cada `aws`. |
| `AWS_CONFIG_FILE`, lanzador, limpieza del entorno | **Carpeta de la sesión** (motor) | Se va con la sesión; no toca `~/.aws` de la persona. |
| `danil aws …` | **CLI** (`crates/terminus-cli`, rutas en `engine-manifest`) | Es la superficie de agentes y de la persona en v1. |
| API tokens fijos (Cloudflare, Vercel, Stripe, Supabase) | **`env_secret`**, sellados por máquina | Ya existe; el Worker no los puede leer. |
| Pantalla «Configuración › AWS» | **Ventana**, v2 | La ventana solo pinta y llama. |
| Política de organización sobre nubes | **Harness**, después | §9. |

Respuesta directa a «cuenta, bóveda o ambas»: **ambas**. La cuenta guarda lo
que renueva; la bóveda de cada máquina guarda lo que se usa.

## 8. Seguridad

**Qué ve el agente.** Un agente con shell puede ejecutar
`danil aws credential-process` y leer la credencial de rol. No hay forma de
evitarlo sin un proxy que firme por él (§6). Lo que sí se limita:

- **No ve el refresh token** de Identity Center, que es lo que da acceso a
  **todas** las cuentas y roles de la persona. Solo ve el rol del perfil.
- **Vida corta**: la del permiso de Identity Center (de 1 a 12 h; se
  recomienda 1 h para los perfiles de Danil).
- **Alcance**: solo los perfiles elegidos para el workspace.
- **No puede iniciar sesión** ni cambiar la configuración (lanzador).
- Las credenciales cuentan como valores a tachar (`env_secrets` y la
  máscara del journal), igual que un `env_secret`: no quedan en
  `session.json`, eventos, log ni cosecha.

Esto es **más débil que GitHub** (allí el agente no ve el token) y **más
fuerte que hoy** (hoy el agente puede leer `~/.aws/sso/cache`, que tiene la
sesión entera de la persona).

**Frontera.** La frontera es el workspace, no la tarea: todas las tareas de un
workspace pueden pedir todos sus perfiles. Recortar por carpeta, tarea o
handler queda fuera de v1 (§9).

**Auditoría.**

- Worker: cada emisión (workspace, máquina, perfil, hora, renovación o
  reutilización).
- Motor: cada `credential-process` con la tarea que lo pidió, en `host.log`.
- AWS: CloudTrail registra `GetRoleCredentials` del usuario de Identity
  Center y las llamadas con el nombre de sesión del rol (el usuario). **No
  identifica la tarea**: `GetRoleCredentials` no acepta `SourceIdentity` ni
  etiquetas de sesión. La atribución por tarea solo está en Danil.

**Revocación.**

- Desconectar AWS en Danil: el Worker borra el refresh token; ninguna máquina
  obtiene credenciales nuevas.
- Quitar una máquina: deja de recibir.
- **Lo ya emitido vale hasta su `Expiration`.** Para cortarlo antes, la
  persona revoca las sesiones activas del rol en IAM (política que niega por
  `aws:TokenIssueTime`) o termina la sesión del usuario en Identity Center.
  `danil aws disconnect` lo dice en su respuesta.

## 9. Alcance y su relación con #331 y el Harness

- **v1: por workspace**, con lista explícita de perfiles. Es el mismo
  alcance que GitHub.
- **Por carpeta**: después. Encaja con la gramática de `env_secret`
  (`*` o id de carpeta) si se pide.
- **Por tarea o handler**: no se propone. Un handler no es una frontera de
  seguridad en una máquina donde todas las tareas del workspace comparten
  usuario del sistema.
- **#331 (PR #667)** trata qué **CLI de IA** corre en un workspace (Claude,
  Codex…). Esto trata qué **nube** alcanza. Son listas distintas. Comparten
  el criterio: un límite se aplica en el motor, no en una nota de memoria.
  Si #667 se aprueba, su mismo documento de política puede sumar después
  `clouds.allowed` sin mecanismo nuevo.
- **Harness**: nada en v1. Para organizaciones, lo natural es la fuente de
  §4.2 (roles federados, sin sesiones personales) y una política que la
  exija. Se decide con D2.

## 10. Relación con la pausa por credencial (#328)

Esto **reduce** la pausa, no la elimina:

- Desaparece la caída por vencimiento normal: la credencial de rol se
  renueva sola desde la cuenta mientras dure la sesión de Identity Center.
- Desaparecen los N logins: el lanzador los impide y el agente recibe un
  código, no una petición de login.
- **Sigue existiendo** cuando termina la sesión de Identity Center
  (`aws_reauthorize`), cuando la máquina no tiene red y la caché vence, y
  para todo lo que no se centraliza (VPN, 2FA, otras nubes en v1). Ahí la
  tarea usa `task wait --credential aws-account:<workspace>`.
- La diferencia: con `aws_reauthorize`, la acción de la persona es **una
  para todas sus máquinas** (reconectar en Danil), no una por máquina.

Propuesta de enlace, para cuando #328 tenga v1: cuando el motor recibe
`aws_reauthorize` del Worker, el CLI ya devuelve la clave de espera
(`aws-account:<workspace>`) en `detail`, para que el agente no la invente.

## 11. Contratos que cambian

### v1

| Contrato | Cambio | Compatibilidad |
|---|---|---|
| API del Worker (computers `docs/protocol.md`) | Persona: `GET`/`DELETE /v1/workspaces/:id/aws`, `POST …/aws/authorize`, `GET …/aws/accounts`, `PUT …/aws/profiles`. Máquina: `POST …/aws/credentials {profile}` → `{access_key_id, secret_access_key, session_token, expiration, profile, version}` o código. | Aditivo. |
| Credenciales de la cuenta | `kind: "aws"` con `delivery` de emisión (como GitHub), fuera de `SEALED_KINDS`; `credentials.changed {kind: "aws"}`. | Un motor viejo trata el `kind` nuevo como `sync_account_credentials` (medido en `relay.rs`): no falla; no recibe AWS. |
| Relay (`crates/connector/src/relay.rs`) | Rama `kind == "aws"` → evento `aws_account_changed`. | Aditivo. |
| Tablas (danil-workspace) | Reutiliza `credentials`, `credential_secrets` y, si sirve, `credential_issued_tokens`. | A confirmar por `architect`. |
| CLI | `danil aws connect|disconnect|status|profiles|profile set|profile remove|credential-process`. | Aditivo. |
| Entorno de la sesión | `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_PROFILE`, `AWS_EC2_METADATA_DISABLED`; vacía `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`. Solo en workspaces con AWS conectado. | **Cambio de conducta**: en ese workspace los perfiles locales de `~/.aws` dejan de verse (D4). |
| Reservados de `env_secret` | Sumar el prefijo `AWS_` a los reservados, o al menos las cinco variables de arriba. | Un `env_secret` existente llamado `AWS_*` dejaría de inyectarse: medir cuántos hay antes (D4). |
| Instrucciones de tarea | Una línea en el bloque del CLI. | Efecto en el siguiente turno. |

El contrato congelado de la ventana (`engine-protocol/commands.json`) **no
cambia en v1**.

### v2

| Contrato | Cambio |
|---|---|
| RPC1 | Extensión `aws_account_v1` (estado, conectar, perfiles) en `crates/engine-manifest/extensions/`, anunciada en `status.service_features`, copiada byte a byte en esta app. |
| Ventana | «Configuración › AWS», junto a GitHub. |
| Worker | Emisor OIDC (`/.well-known/openid-configuration`, JWKS, firma) si se aprueba D2. |

## 12. Fuera de alcance

- Un proxy HTTP local o con CA propia (§6).
- GCP, Azure y Kubernetes en v1.
- Emitir tokens cortos de Cloudflare, Supabase u otros desde el Worker.
- Que Danil guarde llaves IAM de larga vida como credencial de la cuenta:
  si la persona quiere, `env_secret`.
- Alcance por tarea o handler.
- Cambios en la ventana y el teléfono en v1.
- Importar sesiones existentes de `~/.aws/sso/cache` de una máquina.

## 13. Riesgos

| Riesgo | Mitigación |
|---|---|
| El Worker guarda una credencial que da acceso a todas las cuentas de AWS de la persona. Un Worker comprometido la usa. | Mismo modelo que GitHub, cifrada con llave del Worker. Recomendar a la persona una sesión de Identity Center corta y permisos mínimos. Alternativa sin secreto: §4.2 (D2). |
| Identity Center rota o invalida el refresh token al usarlo dos veces. | Emisión en fila por workspace (Durable Object), guardar el token nuevo antes de responder, como GitHub. |
| El registro de cliente OIDC (`RegisterClient`) caduca. | Guardarlo con su vencimiento y volver a registrar antes; al fallar, `aws_reauthorize`. **Sin verificar** la vida del registro. |
| Cambiar `AWS_CONFIG_FILE` rompe a quien usa perfiles locales en ese workspace. | Solo cuando AWS está conectado en la cuenta; `danil aws status` lo dice; D4. |
| El agente lee la credencial de rol y la saca de la máquina. | Vida corta, alcance del rol, tachado en lo que Danil guarda, auditoría por tarea. No se elimina (§8). |
| El agente usa otro binario de `aws` (ruta absoluta) y salta el lanzador. | Sin `~/.aws` visible ni variables `AWS_*`, solo encuentra los perfiles de Danil; el login funcionaría, pero contra un `AWS_CONFIG_FILE` sin perfiles SSO. |
| `credential_process` lanza el CLI de danil en cada renovación y el motor no responde. | Caché en la bóveda leída por el CLI con la credencial de tarea; tiempo límite y código `aws_offline`. |
| Sesión del Worker en otra región de AWS que la de Identity Center. | El Worker llama a `oidc.<región>.amazonaws.com` y `portal.sso.<región>.amazonaws.com` de la conexión. |

## 14. Decisiones para la persona

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | ¿Qué proveedor va primero? | AWS / GCP / varios a la vez | **AWS**, por §4.3. |
| D2 | ¿Qué fuente de AWS en v1? | Sesión de Identity Center de la persona en la cuenta / Danil como emisor OIDC con roles federados / ambas | **Identity Center en v1**: reutiliza GitHub y no pide configurar AWS. **Emisor OIDC en v2**, porque abre GCP y Azure y es lo que querrán las organizaciones. |
| D3 | ¿Se acepta que el Worker pueda leer el refresh token de AWS? | Sí, como GitHub / No, solo emisor OIDC | **Sí.** Renovar en la cuenta no se puede hacer con una copia sellada que el Worker no abre. |
| D4 | ¿Aislar AWS en los workspaces conectados? | Reemplazar `~/.aws` por la config de Danil y bloquear el login / mezclar con los perfiles locales | **Reemplazar y bloquear.** Mezclar deja al agente lanzar el login local, que es el incidente. Antes, medir si hay `env_secret` `AWS_*` en uso. |
| D5 | ¿Alcance de v1? | Workspace con lista de perfiles / por carpeta | **Workspace.** Carpeta cuando alguien lo pida, con la gramática de `env_secret`. |
| D6 | ¿Qué hacer con Cloudflare, Vercel, Stripe, Supabase? | Nada nuevo, `env_secret` y una guía / emitir tokens cortos | **`env_secret` y una guía** de nombres (`CLOUDFLARE_API_TOKEN`, `VERCEL_TOKEN`, `STRIPE_API_KEY`, `SUPABASE_ACCESS_TOKEN`). |
| D7 | ¿Proxy HTTP local para nubes? | No / sí | **No** (§6). |
| D8 | ¿v1 sin pantallas? | Solo CLI / CLI y ventana | **Solo CLI.** La conexión es una vez por workspace; la pantalla va en v2 junto a GitHub. |
| D9 | ¿Harness en v1? | Nada / política de nubes | **Nada.** Se revisa con D2 y con #667. |

## 15. Encargos propuestos (no lanzados)

1 y 2 cambian contratos de dos repositorios y van primero. 3 y 4 tocan
repositorios distintos y pueden ir en paralelo tras 1.

| # | Responsable | Objetivo | Alcance | Depende de | Aceptación |
|---|---|---|---|---|---|
| 1 | `architect` (computers, danil-engine, danil-workspace) | Revisar los contratos de v1 de §11. | Rutas del Worker, `kind: aws` y `delivery`, tablas, llave de cifrado, relay, entorno de la sesión, reservados de `env_secret`. | D1–D4 | Dictamen escrito; cambios anotados en esta propuesta. |
| 2 | `qa` (sondeo, sin código de producto) | Medir lo marcado **sin verificar**: refresh de Identity Center con un cliente registrado fuera del CLI de AWS, rotación del refresh token, vida de `RegisterClient`, renovación por `credential_process` en un proceso largo. | Una cuenta de prueba de Identity Center. | — | Informe con medidas; si `CreateToken` con refresh no funciona para un cliente propio, la v1 cambia a §4.2. |
| 3 | `tech-lead` (computers) | Worker: `AwsCredential`, rutas, emisión, desconexión, `credentials.changed`. | §5 pasos 1–3 y 9 del lado del Worker. | 1, 2 | Pruebas con `CreateToken`/`GetRoleCredentials` simulados: emisión en fila, reutilización, `reauthorize`, `removed`. |
| 4 | `tech-lead` (danil-engine) | Motor y CLI: caché, entrega, lanzador, rutas `danil aws`, línea de instrucciones, tachado. | §5 pasos 4–10. | 1, 2 | E2E con Worker simulado: dos máquinas, `aws sts get-caller-identity` responde en las dos; `aws sso login` sale con 64; la credencial no aparece en `session.json` ni en `host.log`. |
| 5 | `qa` | Recorrido real. | Dos máquinas de la persona, un workspace, una tarea en cada una, desconectar y reconectar. | 3, 4 | Evidencia de §5 «Resultado observable». |
| 6 | `design` + `tech-lead` (esta app) | v2: «Configuración › AWS». | Pantalla y extensión `aws_account_v1`. | 5, D8 | Recorrido en la ventana real con el laboratorio del motor. |

## 16. Sin medir

- Que un cliente OIDC registrado por el Worker reciba refresh tokens de
  Identity Center y los pueda usar desde Cloudflare (es lo que hace el CLI de
  AWS desde la máquina; no se probó desde un Worker).
- Si Identity Center rota el refresh token en cada uso.
- La vida del registro de cliente de `RegisterClient` y la duración máxima de
  la sesión del portal.
- Si `aws` CLI v2 vuelve a llamar a `credential_process` dentro de un mismo
  proceso largo al acercarse `Expiration` (comandos de una sola llamada no lo
  necesitan; `aws s3 sync` largo sí).
- Cuántos `env_secret` con nombre `AWS_*` existen hoy en workspaces de
  personas.
- Lo marcado **sin verificar** en §3 y §6 para GCP, Azure, Cloudflare y
  Supabase.
