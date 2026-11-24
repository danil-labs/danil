# Glosario del paquete `yua`

Este glosario fija un término por concepto e identifica su fuente.

Fuentes citadas:

- **Norma** — INALI, *U nuʼukbesajil u tsʼíibtaʼal maayatʼaan · Normas de
  escritura para la lengua maayatʼaan (maya)*, 2ª ed. 2019 (PDF 2022-04-27).
- **Káajbal / Keetel / Tsʼoʼokbal** — SEP-Yucatán, programa *Koʼoneʼex Kanik
  Maaya*, 2020.
- **May May** — Ismael May May, curso bilingüe de maya yucateco, Mérida 2009.

## Regla de escritura

El saltillo se escribe `U+02BC` (`ʼ`). El paquete usa esta forma normalizada;
`src/lib/i18n.ts` también normaliza el saltillo al cargar frases.

Alfabeto normado (Norma §1.1): `a, aa, áa, aʼ, aʼa, b, ch, chʼ, e, ee, ée, eʼ,
eʼe, i, ii, íi, iʼ, iʼi, j, k, kʼ, l, m, n, o, oo, óo, oʼ, oʼo, p, pʼ, r, s, t,
tʼ, ts, tsʼ, u, uu, úu, uʼ, uʼu, w, x, y`.

## Verbos: los botones van en imperativo

Los botones usan imperativo. Los ejemplos de instrucciones de la SEP son: *Xokej yéetel eʼesej*
(«Lee y señala»), *Tsʼíibt u kʼaabaʼ* («Escribe el nombre») — Káajbal, p. 6.

Morfología (Norma §3.4.2.6): transitivo tipo -ø- → raíz **-ej** (`xokej`);
tipo -t- → **-tej** (`tsʼíibtej`); causativo tipo -s- → **-sej** (`jóokʼsej`);
intransitivo → **-nen** (`xooknen`).

| Español | Maya | De dónde |
|---|---|---|
| Aceptar, De acuerdo | `Maʼalob` | May May, diálogos: cierre de acuerdo |
| Cancelar | `Pʼatej` | `pʼat` dejar |
| Guardar | `Kanáantej` | `kanáant` cuidar, conservar |
| Abrir | `Jeʼej` | `jeʼ` abrir |
| Cerrar | `Kʼalej` | `kʼal` cerrar |
| Quitar, Eliminar | `Lukʼsej` | `lukʼs` quitar (causativo de `lukʼ`) |
| Buscar | `Kaxtej` | `kaxt` buscar |
| Ver | `Ilej` | Káajbal: *Ilej yéetel aʼalej* |
| Mostrar | `Eʼesej` | Norma: `eʼes` (mostrar) |
| Escribir | `Tsʼíibtej` | Norma: `tsʼíib` (escribir) |
| Leer | `Xokej` | Norma §3.4.2.6, tabla 3.111 |
| Enviar | `Túuxtej` | `túuxt` enviar |
| Instalar | `Oksej` | `oks` meter (causativo de `ok` entrar) |
| Empezar | `Káajsej` | `káajs` iniciar (causativo de `káaj`) |
| Detener, Terminar | `Xuʼulsej` | `xuʼuls` acabar |
| Volver | `Suutnen` | Norma: `suut` (volver, regresar) — intransitivo |
| Continuar | `Táanilkuunsej` | `táanil` adelante (Norma) + `-kuuns` |
| Reintentar | `Beetej tu kaʼatéen` | May May: `tu kaʼatéen` otra vez |
| Copiar | `Kaʼatsʼíibtej` | Acuñado: `kaʼa-` otra vez + `tsʼíibt` escribir |

## Sustantivos del producto

`kúuchil X` («lugar de X») es composición viva y productiva: *kúuchil tsʼaak*
= clínica, literalmente «lugar de medicina» (Keetel). De ahí sale `kúuchil
meyaj`. El prefijo agentivo `aj-` también: *ajkaʼansaj* maestro, *ajtsʼakyaj*
médico (Keetel) → `ajmeyaj`.

| Español | Maya | De dónde |
|---|---|---|
| Workspace | `kúuchil meyaj` | «lugar de trabajo» — patrón `kúuchil X` |
| Proyecto | `noj meyaj` | `noj` mayor, principal (*noj kaaj* ciudad) |
| Tarea | `meyaj` | Norma: `meyaj` (trabajo) |
| Sesión, Chat | `tsikbal` | Káajbal: `tsikbal` (diálogo, conversación) |
| Turno | `téenel` | `téen` vez (*tu kaʼatéen*) |
| Agente | `ajmeyaj` | «el que trabaja» — prefijo `aj-` |
| Cuenta | `ookbal` | Acuñado: `ok` entrar + `-bal` (como `kaambal`) |
| Herramienta | `nuʼukul` | Keetel: *Baʼax nuʼukulilo'ob xook yaantech* |
| Configuración | `nuʼukbesajil` | Título de la Norma: «normas, ordenamiento» |
| Archivo, Documento | `juʼun` | Norma: `juʼun` (papel) |
| Carpeta | `u kúuchil juʼunoʼob` | «lugar de los papeles» |
| Artefacto | `u yich meyaj` | «el fruto del trabajo» |
| Nombre | `kʼaabaʼ` | Norma: `kʼaabaʼ` (nombre) |
| Lengua, Idioma | `tʼaan` | Norma |
| Proveedor | `molaʼay` | Norma: `molaʼay` (institución, organización) |
| Error, Falla | `siʼipil` | Norma: `siʼipil` (culpa, falta) |
| Ayuda | `áantaj` | Norma: `áantaj` (ayuda) |
| Signo, Marca | `chíikul` | Norma §2.1: `chíikulil` (signo) |
| Fuente (de contexto) | `chuun` | Norma: `u chuun u tuukulil` (el origen del pensamiento) |
| Material de contexto | `baʼalil xook` | «cosa de lectura» |
| Rama (git) | `kʼab` | `kʼab` rama, brazo — la misma metáfora que *branch* |
| Versión | `téenel` | «la vez N», de `téen` vez |
| Línea (de texto) | `xóotʼtsʼíib` | Acuñado por analogía con `xóotʼtʼaan` (Norma §3.4) |
| Copia | `kaʼatsʼíib` | mismo radical que `kaʼatsʼíibtej` copiar |
| Conectar | `nupʼ` | Norma: `ku béeytal u nuʼupul` (se junta) |
| Publicar, Sacar | `jóoks` | `jóokʼs` sacar (causativo de `jóokʼol` salir) |
| Comparar | `keetkuuns` | `keet` igual — título del libro *Keetel* |
| Consumo | `xuupul` | `xuup` gastarse, acabarse |
| Pestaña | `wáal` | `wáal` hoja; clasificador de lo plano (Norma) |
| Permiso, Aprobación | `chaʼanil` | `chaʼ` permitir, dejar |
| Aprobar | `éejentej` | Norma: `éejen` (aceptar) |
| Gratis | `siibal` | May May: `siibal` (regalo) |
| Computadora | `computadora` | Préstamo — es el ejemplo de la propia Norma §2.13 |
| Nuevo | `túumben` | Norma |
| Hay / No hay | `yaan` / `minaʼan` | Norma, May May |
| Sí / No | `jaaj` / `maʼ` | May May, diálogos |

`kʼab` es a la vez «rama» y «mano»: la colisión está en la lengua, no en el
paquete, y el contexto la resuelve — `agents.mode.manual` dice `Tu kʼab máak`
(«en mano de persona») y `chat.scope.branch.*` habla de repositorios.

## Lo que se queda como préstamo

Términos técnicos sin equivalente y sin composición transparente. La Norma
§2.13 pide cursiva para un préstamo en texto corrido; en una interfaz no hay
cursiva que aplicar, así que van tal cual:

`token`, `commit`, `sandbox`, `MCP`, `API`, `JSON`, `URL`, `PDF`, `SSH`,
`git`, `pnpm`, `Bun`, y todo nombre propio: `GitHub`, `Claude`, `Codex`,
`Grok`, `OpenCode`, `Antigravity`, `Terminus`, `Confluence`, `Bitbucket`.

## Plural

El catálogo declara **una sola forma** (`other`). El maya yucateco no marca
plural obligatoriamente: el sufijo `-oʼob` es opcional y con numeral delante se
omite. Exigir dos formas obligaría a escribir la misma frase dos veces.

## Lo que este paquete NO es

**Ningún hablante de maya yucateco lo ha revisado.** Se escribió contra la
norma del INALI y el corpus citado arriba, que son fuentes de escritura y de
lengua de uso, no de terminología de software: cada término de la segunda tabla
es una acuñación de este paquete y ninguna está atestiguada en un texto
maya sobre computadoras. Por eso la versión es `0.1.0` y la autoría no nombra a
ningún traductor. Lo que falta para llamarlo una traducción es una pasada de
alguien que hable la lengua.
