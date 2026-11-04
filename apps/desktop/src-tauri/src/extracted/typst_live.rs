//! La vista en vivo de un `.typ`: un `tinymist lsp` por árbol de tarea en el
//! proceso de la ventana. La carpeta, el principal y el binario los resuelve el
//! motor (`tree_typst_target`); ver docs/engine-client.md.

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU16, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, LazyLock, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Url};

const PLAZO_LSP: Duration = Duration::from_secs(30);
const PLAZO_APAGADO: Duration = Duration::from_secs(2);
const TAREA_DE_LA_VISTA: &str = "terminus";

struct Proceso {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    pendientes: Mutex<HashMap<u64, mpsc::Sender<Value>>>,
    siguiente: AtomicU64,
    root: PathBuf,
    main: Mutex<String>,
    puerto: AtomicU16,
    /// Lo último que mandó el editor de cada `.typ` abierto, por ruta relativa.
    abiertos: Mutex<HashMap<String, Abierto>>,
    /// La carpeta de trabajo del proceso: vacía y fuera del árbol, que en Windows no se podría borrar.
    _cwd: tempfile::TempDir,
}

struct Abierto {
    version: i32,
    texto: String,
}

static PROCESOS: LazyLock<Mutex<HashMap<String, Arc<Proceso>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Dos visores del mismo árbol que abren a la vez arrancarían dos Tinymist y el registro guardaría uno.
static ARRANQUE: Mutex<()> = Mutex::new(());

#[derive(Serialize)]
pub struct VistaViva {
    /// `"sin_typst"` | `"sin_tinymist"` | `"lista"`.
    estado: &'static str,
    key: String,
    puerto: u16,
    main: String,
}

#[derive(Serialize, Clone)]
struct Aviso {
    key: String,
    /// `"diagnostics"` | `"status"` | `"jump"` (doble clic en la vista).
    kind: &'static str,
    /// Con `diagnostics` y `jump`: el archivo, relativo a la carpeta; `None` fuera de ella.
    path: Option<String>,
    /// Con `jump`: desde 1; la columna en unidades UTF-16.
    line: Option<u32>,
    column: Option<u32>,
    diagnostics: Vec<Diagnostico>,
    /// Con `status`: `"compiling"` | `"compileSuccess"` | `"compileError"`.
    status: Option<String>,
    pages: Option<u64>,
}

fn fallo(detalle: impl Into<String>) -> Value {
    json!({"what": {"clave": "code.typst.error.live"}, "detail": detalle.into()})
}

fn clave(project: &str, session: &str, tree: &str) -> String {
    format!("{project}/{session}/{tree}")
}

/// Arranca la vista del árbol, o devuelve la que ya corre con el mismo principal.
#[tauri::command(async)]
pub fn typst_live_open(
    app: AppHandle,
    project: String,
    session: String,
    tree: String,
    path: String,
    main: Option<String>,
) -> Result<VistaViva, Value> {
    // El principal se resuelve dentro del candado: dos ojos seguidos se aplican en su orden.
    let _arranque = ARRANQUE.lock().unwrap_or_else(|p| p.into_inner());
    let objetivo = super::proxy::invoke(
        &app.state::<Arc<super::proxy::State>>(),
        "tree_typst_target",
        json!({"project": project, "session": session, "tree": tree, "path": path, "main": main}),
    )?;
    let key = clave(&project, &session, &tree);
    let estado = objetivo["estado"].as_str().unwrap_or_default();
    if estado != "listo" {
        detener(&key);
        return Ok(VistaViva {
            estado: if estado == "sin_tinymist" {
                "sin_tinymist"
            } else {
                "sin_typst"
            },
            key,
            puerto: 0,
            main: String::new(),
        });
    }
    let a_ruta = |campo: &str| objetivo[campo].as_str().map(PathBuf::from);
    let (Some(root), Some(tinymist)) = (a_ruta("root"), a_ruta("tinymist")) else {
        return Err(fallo("objetivo incompleto"));
    };
    let main = objetivo["main"].as_str().unwrap_or_default().to_string();
    let vivo = PROCESOS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get(&key)
        .cloned();
    if let Some(vivo) = vivo.filter(|v| v.root == root && sigue_vivo(v)) {
        let mut actual = vivo.main.lock().unwrap_or_else(|p| p.into_inner());
        // Otro principal en el mismo proceso: Tinymist cambia la entrada de su compilador y conserva lo compilado.
        let cambiado = *actual == main || cambiar_principal(&vivo, &root.join(&main)).is_ok();
        if cambiado {
            actual.clone_from(&main);
            return Ok(VistaViva {
                estado: "lista",
                key,
                puerto: vivo.puerto.load(Ordering::Relaxed),
                main,
            });
        }
    }
    detener(&key);
    let proceso =
        arrancar(&app, &key, &tinymist, a_ruta("paquetes"), &root, &main).map_err(fallo)?;
    let puerto = proceso.puerto.load(Ordering::Relaxed);
    PROCESOS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .insert(key.clone(), proceso);
    Ok(VistaViva {
        estado: "lista",
        key,
        puerto,
        main,
    })
}

/// El texto entero de un `.typ` del árbol, tal como está en el editor.
#[tauri::command(async)]
pub fn typst_live_change(key: String, path: String, text: String) -> Result<(), Value> {
    let proceso = vivo(&key)?;
    sincronizar(&proceso, &path, text).map_err(|error| {
        log::warn!("[typst] un cambio no llegó a Tinymist: {error}");
        fallo(error)
    })
}

// El panel pide con el texto que tiene delante: el cambio del editor puede llegar después.
fn sincronizar(proceso: &Proceso, path: &str, text: String) -> Result<(), String> {
    let uri = uri_dentro(&proceso.root, path)?;
    let mut abiertos = proceso.abiertos.lock().unwrap_or_else(|p| p.into_inner());
    match abiertos.get_mut(path) {
        Some(abierto) if abierto.texto == text => Ok(()),
        Some(abierto) => {
            abierto.version += 1;
            notificar(
                proceso,
                "textDocument/didChange",
                json!({"textDocument": {"uri": uri, "version": abierto.version}, "contentChanges": [{"text": text}]}),
            )?;
            abierto.texto = text;
            Ok(())
        }
        None => {
            notificar(
                proceso,
                "textDocument/didOpen",
                json!({"textDocument": {"uri": uri, "languageId": "typst", "version": 1, "text": text}}),
            )?;
            abiertos.insert(
                path.to_string(),
                Abierto {
                    version: 1,
                    texto: text,
                },
            );
            Ok(())
        }
    }
}

/// Lleva la vista al lugar del documento que sale de esa línea y columna del código (desde 1).
#[tauri::command(async)]
pub fn typst_live_reveal(key: String, path: String, line: u32, column: u32) -> Result<(), Value> {
    let proceso = vivo(&key)?;
    let archivo = ruta_dentro(&proceso.root, &path).map_err(fallo)?;
    pedir(
        &proceso,
        "workspace/executeCommand",
        json!({
            "command": "tinymist.scrollPreview",
            "arguments": [TAREA_DE_LA_VISTA, {
                "event": "panelScrollTo",
                "filepath": archivo,
                "line": line.saturating_sub(1),
                "character": column.saturating_sub(1),
            }],
        }),
    )
    .map(|_| ())
    .map_err(fallo)
}

/// Una propuesta de Tinymist para el panel del editor, con lo que su tarjeta enseña.
#[derive(Serialize)]
pub struct Sugerencia {
    /// `"cite"` | `"heading"` | `"figure"` | `"table"` | `"equation"` | `"label"` | `"file"` | `"folder"` | `"function"` | `"other"`.
    kind: &'static str,
    label: String,
    /// Lo que se escribe; con `snippet`, en la sintaxis de fragmentos del LSP.
    insert: String,
    snippet: bool,
    /// Desde dónde reemplaza, desde 1 y la columna en UTF-16; `None`: desde la posición pedida.
    line: Option<u32>,
    column: Option<u32>,
    /// El título de la cita o la sección, la leyenda de la figura o la firma de la función.
    detail: Option<String>,
    authors: Option<String>,
    year: Option<String>,
    /// La imagen de una figura, relativa a la carpeta, para su miniatura.
    image: Option<String>,
}

/// Lo que Tinymist propone en esa línea y columna (desde 1) de `text`, el texto del editor.
#[tauri::command(async)]
pub fn typst_live_complete(
    key: String,
    path: String,
    text: String,
    line: u32,
    column: u32,
    trigger: Option<String>,
) -> Result<Vec<Sugerencia>, Value> {
    let proceso = vivo(&key)?;
    sincronizar(&proceso, &path, text).map_err(fallo)?;
    let uri = uri_dentro(&proceso.root, &path).map_err(fallo)?;
    let referencia = matches!(trigger.as_deref(), Some("@" | "<"));
    let contexto = match trigger {
        Some(caracter) => json!({"triggerKind": 2, "triggerCharacter": caracter}),
        None => json!({"triggerKind": 1}),
    };
    let respuesta = pedir(
        &proceso,
        "textDocument/completion",
        json!({
            "textDocument": {"uri": uri},
            "position": {"line": line.saturating_sub(1), "character": column.saturating_sub(1)},
            "context": contexto,
        }),
    )
    .map_err(fallo)?;
    let items = match respuesta {
        Value::Array(items) => items,
        Value::Object(mut lista) => match lista.remove("items") {
            Some(Value::Array(items)) => items,
            _ => Vec::new(),
        },
        _ => Vec::new(),
    };
    let mut propuestas = sugerencias(&proceso, &path, items);
    // Tinymist solo propone etiquetas con un documento que compiló alguna vez: si la vista
    // arrancó con el proyecto roto (un `@fig-` a medio escribir ya guardado), contesta vacío.
    if referencia && !propuestas.iter().any(|s| CON_CLAVE.contains(&s.kind)) {
        let leidas = de_las_fuentes(&proceso, &path);
        log::info!(
            "[typst] Tinymist no dio etiquetas en {path}; {} salen de las fuentes",
            leidas.len()
        );
        propuestas.extend(leidas);
    }
    Ok(propuestas)
}

/// Las clases de propuesta que son una etiqueta o una cita.
const CON_CLAVE: [&str; 6] = ["cite", "heading", "figure", "table", "equation", "label"];

/// Las etiquetas que ponen los `.typ` del proyecto y las claves de sus `.bib`, leídas del texto.
fn de_las_fuentes(proceso: &Proceso, path: &str) -> Vec<Sugerencia> {
    let fuentes = fuentes(proceso, path);
    let mut vistas = HashSet::new();
    let mut out = Vec::new();
    for (_, texto) in &fuentes {
        for etiqueta in etiquetas(texto) {
            if !vistas.insert(etiqueta.clone()) {
                continue;
            }
            let d = describir(&fuentes, &etiqueta);
            out.push(Sugerencia {
                kind: d.as_ref().map_or("label", |d| d.kind),
                insert: etiqueta.clone(),
                snippet: false,
                line: None,
                column: None,
                detail: d.as_ref().and_then(|d| d.texto.clone()),
                authors: None,
                year: None,
                image: d.and_then(|d| d.imagen),
                label: etiqueta,
            });
        }
    }
    let mut citas: Vec<(String, Cita)> = bibliografia(&proceso.root, &fuentes)
        .into_iter()
        .filter(|(clave, _)| !vistas.contains(clave))
        .collect();
    citas.sort_by(|a, b| a.0.cmp(&b.0));
    out.extend(citas.into_iter().map(|(clave, cita)| Sugerencia {
        kind: "cite",
        insert: clave.clone(),
        snippet: false,
        line: None,
        column: None,
        detail: cita.titulo,
        authors: cita.autores,
        year: cita.anio,
        image: None,
        label: clave,
    }));
    out
}

/// Las `<etiquetas>` que pone un texto, en orden y sin las que `ref(<x>)` o `cite(<x>)` solo usan.
fn etiquetas(texto: &str) -> Vec<String> {
    let mut out = Vec::new();
    for (at, _) in texto.match_indices('<') {
        let cola = &texto[at + 1..];
        let fin = cola
            .find(|c: char| !(c.is_alphanumeric() || matches!(c, '_' | '-' | ':' | '.')))
            .unwrap_or(cola.len());
        if fin == 0 || !cola[fin..].starts_with('>') {
            continue;
        }
        if texto[..at].trim_end().ends_with(['(', ',', ':', '<']) {
            continue;
        }
        let etiqueta = &cola[..fin];
        if etiqueta.starts_with(|c: char| c.is_alphabetic() || c == '_') {
            out.push(etiqueta.to_string());
        }
    }
    out
}

const TOPE_DEL_DETALLE: usize = 240;
const TOPE_DE_FUENTES: usize = 64;
const TOPE_DE_FUENTE: u64 = 2 << 20;

fn sugerencias(proceso: &Proceso, path: &str, items: Vec<Value>) -> Vec<Sugerencia> {
    // Tinymist da cada cita dos veces: por su título (escribe la clave) y por su clave.
    let es_titulo_de_cita = |i: &Value| {
        i["kind"].as_u64() == Some(21)
            && i["labelDetails"]["description"].as_str().is_some()
            && i["labelDetails"]["description"] == i["textEdit"]["newText"]
    };
    let citas: HashSet<String> = items
        .iter()
        .filter(|i| es_titulo_de_cita(i))
        .filter_map(|i| i["textEdit"]["newText"].as_str().map(str::to_owned))
        .collect();
    let con_etiquetas = items.iter().any(|i| i["kind"].as_u64() == Some(18));
    let fuentes = if con_etiquetas {
        fuentes(proceso, path)
    } else {
        Vec::new()
    };
    let bibliografia = if citas.is_empty() {
        HashMap::new()
    } else {
        bibliografia(&proceso.root, &fuentes)
    };
    items
        .iter()
        .filter(|i| !es_titulo_de_cita(i))
        .filter_map(|i| {
            let label = i["label"].as_str()?.to_string();
            let edicion = &i["textEdit"];
            let insert = edicion["newText"]
                .as_str()
                .or(i["insertText"].as_str())
                .unwrap_or(label.as_str())
                .to_string();
            let inicio = if edicion["range"].is_object() {
                &edicion["range"]["start"]
            } else {
                &edicion["replace"]["start"]
            };
            let posicion = |campo: &str| {
                inicio[campo]
                    .as_u64()
                    .and_then(|n| u32::try_from(n + 1).ok())
            };
            let detalle = i["labelDetails"]["description"]
                .as_str()
                .or(i["detail"].as_str())
                .map(primera_linea);
            let mut sugerencia = Sugerencia {
                kind: match i["kind"].as_u64() {
                    Some(17) => "file",
                    Some(19) => "folder",
                    Some(2 | 3) => "function",
                    Some(18) => "label",
                    _ => "other",
                },
                snippet: i["insertTextFormat"].as_u64() == Some(2) && insert.contains('$'),
                line: posicion("line"),
                column: posicion("character"),
                detail: detalle,
                authors: None,
                year: None,
                image: None,
                label,
                insert,
            };
            if sugerencia.kind == "label" {
                if citas.contains(&sugerencia.label) {
                    sugerencia.kind = "cite";
                    if let Some(cita) = bibliografia.get(&sugerencia.label) {
                        sugerencia.authors = cita.autores.clone();
                        sugerencia.year = cita.anio.clone();
                        if cita.titulo.is_some() {
                            sugerencia.detail = cita.titulo.clone();
                        }
                    }
                } else if let Some(d) = describir(&fuentes, &sugerencia.label) {
                    sugerencia.kind = d.kind;
                    sugerencia.image = d.imagen;
                    if d.texto.is_some() {
                        sugerencia.detail = d.texto;
                    }
                }
            }
            Some(sugerencia)
        })
        .collect()
}

fn primera_linea(texto: &str) -> String {
    let linea = texto.lines().next().unwrap_or_default().trim();
    recortar_a(linea, TOPE_DEL_DETALLE)
}

fn recortar_a(texto: &str, tope: usize) -> String {
    match texto.char_indices().nth(tope) {
        Some((corte, _)) => format!("{}…", &texto[..corte]),
        None => texto.to_string(),
    }
}

/// `destino` escrito en `desde` (los dos con `/`): relativo a su carpeta, o a la raíz con `/`.
/// `None` si sale de la carpeta.
fn resolver(desde: &str, destino: &str) -> Option<String> {
    let mut partes: Vec<&str> = Vec::new();
    if !destino.starts_with('/') {
        partes.extend(desde.split('/'));
        partes.pop();
    }
    for parte in destino.split('/') {
        match parte {
            "" | "." => {}
            ".." => {
                partes.pop()?;
            }
            otra => partes.push(otra),
        }
    }
    (!partes.is_empty()).then(|| partes.join("/"))
}

fn en_la_carpeta(root: &Path, relativa: &str) -> Option<PathBuf> {
    let mut destino = root.to_path_buf();
    for c in Path::new(relativa).components() {
        let Component::Normal(tramo) = c else {
            return None;
        };
        destino.push(tramo);
    }
    Some(destino)
}

fn leer_fuente(root: &Path, relativa: &str) -> Option<String> {
    let ruta = en_la_carpeta(root, relativa)?;
    let datos = std::fs::metadata(&ruta).ok()?;
    if !datos.is_file() || datos.len() > TOPE_DE_FUENTE {
        return None;
    }
    std::fs::read_to_string(ruta).ok()
}

/// Los `.typ` donde buscar etiquetas y bibliografías: los abiertos, el principal y lo
/// que incluyen o importan, con lo abierto tal como está en el editor.
fn fuentes(proceso: &Proceso, path: &str) -> Vec<(String, String)> {
    let abiertos: HashMap<String, String> = proceso
        .abiertos
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .iter()
        .map(|(ruta, a)| (ruta.clone(), a.texto.clone()))
        .collect();
    let main = proceso
        .main
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone();
    let mut pendientes: Vec<String> = vec![path.to_string(), main];
    pendientes.extend(abiertos.keys().cloned());
    let mut vistas = HashSet::new();
    let mut fuentes = Vec::new();
    while let Some(ruta) = pendientes.pop() {
        if fuentes.len() >= TOPE_DE_FUENTES || !vistas.insert(ruta.clone()) {
            continue;
        }
        let Some(texto) = abiertos
            .get(&ruta)
            .cloned()
            .or_else(|| leer_fuente(&proceso.root, &ruta))
        else {
            continue;
        };
        for destino in cadenas_tras(&texto, &["include", "import"]) {
            if destino.ends_with(".typ") {
                if let Some(r) = resolver(&ruta, &destino) {
                    pendientes.push(r);
                }
            }
        }
        fuentes.push((ruta, texto));
    }
    fuentes
}

/// Las cadenas que siguen a cada palabra (`include "a.typ"`, `bibliography(("a.bib", "b.bib"))`).
fn cadenas_tras(texto: &str, palabras: &[&str]) -> Vec<String> {
    let mut cadenas = Vec::new();
    for palabra in palabras {
        for (at, _) in texto.match_indices(palabra) {
            let previo = texto[..at].chars().next_back();
            if previo.is_some_and(|c| c.is_alphanumeric() || c == '_' || c == '-' || c == '.') {
                continue;
            }
            let resto = texto[at + palabra.len()..].trim_start();
            let resto = resto.strip_prefix('(').unwrap_or(resto).trim_start();
            let (resto, varias) = match resto.strip_prefix('(') {
                Some(r) => (r, true),
                None => (resto, false),
            };
            let mut cola = resto;
            while let Some(dentro) = cola.trim_start().strip_prefix('"') {
                let Some(fin) = dentro.find('"') else {
                    break;
                };
                cadenas.push(dentro[..fin].to_string());
                if !varias {
                    break;
                }
                cola = dentro[fin + 1..].trim_start();
                match cola.strip_prefix(',') {
                    Some(r) => cola = r,
                    None => break,
                }
            }
        }
    }
    cadenas
}

struct Descripcion {
    kind: &'static str,
    texto: Option<String>,
    imagen: Option<String>,
}

const IMAGENES: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

/// Qué marca la etiqueta en la fuente: una sección, una figura (con su leyenda e imagen),
/// una tabla o una ecuación. Una lectura del texto, no del documento compilado.
fn describir(fuentes: &[(String, String)], etiqueta: &str) -> Option<Descripcion> {
    let marca = format!("<{etiqueta}>");
    for (ruta, texto) in fuentes {
        for (at, _) in texto.match_indices(&marca) {
            let antes = texto[..at].trim_end();
            // `ref(<x>)` y `cite(<x>)` la usan, no la ponen.
            if antes.ends_with(['(', ',', ':']) {
                continue;
            }
            let linea = &texto[texto[..at].rfind('\n').map_or(0, |n| n + 1)..at];
            if let Some(titulo) = linea.trim_start().strip_prefix('=') {
                let titulo = titulo.trim_start_matches('=').trim();
                return Some(Descripcion {
                    kind: "heading",
                    texto: (!titulo.is_empty()).then(|| recortar_a(titulo, TOPE_DEL_DETALLE)),
                    imagen: None,
                });
            }
            if let Some(cuerpo) = antes.strip_suffix('$') {
                let formula = cuerpo.rfind('$').map_or("", |i| cuerpo[i + 1..].trim());
                return Some(Descripcion {
                    kind: "equation",
                    texto: (!formula.is_empty()).then(|| recortar_a(formula, TOPE_DEL_DETALLE)),
                    imagen: None,
                });
            }
            if antes.ends_with([')', ']']) {
                let mut desde = antes.len().saturating_sub(8000);
                while !antes.is_char_boundary(desde) {
                    desde += 1;
                }
                if let Some(f) = antes[desde..].rfind("figure") {
                    let cuerpo = &antes[desde + f..];
                    let imagen = cadenas_tras(cuerpo, &["image"])
                        .into_iter()
                        .next()
                        .and_then(|i| resolver(ruta, &i))
                        .filter(|i| {
                            let ext = i
                                .rsplit('.')
                                .next()
                                .unwrap_or_default()
                                .to_ascii_lowercase();
                            IMAGENES.contains(&ext.as_str())
                        });
                    let kind = if imagen.is_none() && cuerpo.contains("table") {
                        "table"
                    } else {
                        "figure"
                    };
                    return Some(Descripcion {
                        kind,
                        texto: leyenda(cuerpo),
                        imagen,
                    });
                }
            }
            return None;
        }
    }
    None
}

/// El texto de `caption: [...]` o `caption: "..."`, sin la marca de Typst más visible.
fn leyenda(cuerpo: &str) -> Option<String> {
    let resto = cuerpo[cuerpo.find("caption")? + "caption".len()..].trim_start();
    let resto = resto.strip_prefix(':')?.trim_start();
    let texto = if let Some(dentro) = resto.strip_prefix('[') {
        let mut nivel = 1;
        let fin = dentro.char_indices().find_map(|(i, c)| {
            match c {
                '[' => nivel += 1,
                ']' => nivel -= 1,
                _ => {}
            }
            (nivel == 0).then_some(i)
        })?;
        &dentro[..fin]
    } else {
        let dentro = resto.strip_prefix('"')?;
        &dentro[..dentro.find('"')?]
    };
    let limpio: String = texto
        .chars()
        .filter(|c| !matches!(c, '*' | '_' | '`'))
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    (!limpio.is_empty()).then(|| recortar_a(&limpio, TOPE_DEL_DETALLE))
}

#[derive(Default)]
struct Cita {
    autores: Option<String>,
    anio: Option<String>,
    titulo: Option<String>,
}

/// Las entradas de los `.bib` que nombran los `bibliography(...)` de las fuentes.
fn bibliografia(root: &Path, fuentes: &[(String, String)]) -> HashMap<String, Cita> {
    let mut citas = HashMap::new();
    for (ruta, texto) in fuentes {
        for archivo in cadenas_tras(texto, &["bibliography"]) {
            if !archivo.to_ascii_lowercase().ends_with(".bib") {
                continue;
            }
            let Some(bib) = resolver(ruta, &archivo).and_then(|r| leer_fuente(root, &r)) else {
                continue;
            };
            for (clave, cita) in bibtex(&bib) {
                citas.entry(clave).or_insert(cita);
            }
        }
    }
    citas
}

/// Lo justo de BibTeX para una tarjeta: clave, autores, año y título.
fn bibtex(texto: &str) -> Vec<(String, Cita)> {
    let mut entradas = Vec::new();
    let mut resto = texto;
    while let Some(at) = resto.find('@') {
        resto = &resto[at + 1..];
        let tipo_fin = resto
            .find(|c: char| !c.is_ascii_alphabetic())
            .unwrap_or(resto.len());
        let tipo = resto[..tipo_fin].to_ascii_lowercase();
        let Some(cuerpo) = resto[tipo_fin..].trim_start().strip_prefix(['{', '(']) else {
            continue;
        };
        if matches!(tipo.as_str(), "comment" | "string" | "preamble" | "") {
            resto = cuerpo;
            continue;
        }
        let Some(coma) = cuerpo.find(',') else {
            break;
        };
        let clave = cuerpo[..coma].trim().to_string();
        let mut campos = &cuerpo[coma + 1..];
        let mut cita = Cita::default();
        let (mut autor, mut editor, mut fecha) = (None, None, None);
        loop {
            campos = campos.trim_start_matches(|c: char| c.is_whitespace() || c == ',');
            if campos.is_empty() || campos.starts_with(['}', ')']) {
                campos = campos.get(1..).unwrap_or_default();
                break;
            }
            let Some(igual) = campos.find('=') else {
                campos = "";
                break;
            };
            let nombre = campos[..igual].trim().to_ascii_lowercase();
            let (valor, cola) = valor_bibtex(campos[igual + 1..].trim_start());
            campos = cola;
            let valor = limpiar_bibtex(valor);
            match nombre.as_str() {
                "author" => autor = Some(valor),
                "editor" => editor = Some(valor),
                "title" => cita.titulo = Some(recortar_a(&valor, TOPE_DEL_DETALLE)),
                "year" => cita.anio = Some(valor),
                "date" => fecha = Some(valor),
                _ => {}
            }
        }
        cita.autores = autor.or(editor).as_deref().and_then(autores);
        if cita.anio.is_none() {
            cita.anio = fecha.and_then(|f| f.get(..4).map(str::to_owned));
        }
        if !clave.is_empty() {
            entradas.push((clave, cita));
        }
        resto = campos;
    }
    entradas
}

fn valor_bibtex(texto: &str) -> (&str, &str) {
    if let Some(dentro) = texto.strip_prefix('{') {
        let mut nivel = 1;
        for (i, c) in dentro.char_indices() {
            match c {
                '{' => nivel += 1,
                '}' => {
                    nivel -= 1;
                    if nivel == 0 {
                        return (&dentro[..i], &dentro[i + 1..]);
                    }
                }
                _ => {}
            }
        }
        (dentro, "")
    } else if let Some(dentro) = texto.strip_prefix('"') {
        match dentro.find('"') {
            Some(fin) => (&dentro[..fin], &dentro[fin + 1..]),
            None => (dentro, ""),
        }
    } else {
        let fin = texto.find([',', '}', ')', '\n']).unwrap_or(texto.len());
        (texto[..fin].trim(), &texto[fin..])
    }
}

fn limpiar_bibtex(valor: &str) -> String {
    let mut limpio = String::new();
    let mut letras = valor.chars().peekable();
    while let Some(c) = letras.next() {
        match c {
            '{' | '}' => {}
            '\\' => {
                if letras.peek().is_some_and(|s| "'\"`^~=.".contains(*s)) {
                    letras.next();
                }
            }
            otra => limpio.push(otra),
        }
    }
    limpio.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// «Apellido», «A & B» o «A et al.», con los apellidos de `Apellido, Nombre` o `Nombre Apellido`.
fn autores(lista: &str) -> Option<String> {
    let apellidos: Vec<String> = lista
        .split(" and ")
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .filter_map(|n| match n.split_once(',') {
            Some((apellido, _)) => Some(apellido.trim().to_string()),
            None => n.split_whitespace().last().map(str::to_owned),
        })
        .collect();
    match apellidos.as_slice() {
        [] => None,
        [uno] => Some(uno.clone()),
        [a, b] => Some(format!("{a} & {b}")),
        [a, ..] => Some(format!("{a} et al.")),
    }
}

/// El editor de ese archivo se cerró: Tinymist vuelve a leerlo del disco.
#[tauri::command(async)]
pub fn typst_live_close_doc(key: String, path: String) -> Result<(), Value> {
    let Ok(proceso) = vivo(&key) else {
        return Ok(());
    };
    let abierto = proceso
        .abiertos
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .remove(&path)
        .is_some();
    if !abierto {
        return Ok(());
    }
    let uri = uri_dentro(&proceso.root, &path).map_err(fallo)?;
    notificar(
        &proceso,
        "textDocument/didClose",
        json!({"textDocument": {"uri": uri}}),
    )
    .map_err(fallo)
}

/// Apaga la vista de un árbol. Sin `key`, todas las de `session`; sin los dos, todas.
#[tauri::command(async)]
pub fn typst_live_stop(key: Option<String>, session: Option<String>) {
    // Un arranque en curso termina antes: si no, insertaría su proceso después de este apagado.
    let _arranque = ARRANQUE.lock().unwrap_or_else(|p| p.into_inner());
    let claves: Vec<String> = PROCESOS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .keys()
        .filter(|k| match (&key, &session) {
            (Some(key), _) => *k == key,
            (None, Some(session)) => k.split('/').nth(1) == Some(session.as_str()),
            (None, None) => true,
        })
        .cloned()
        .collect();
    for k in claves {
        detener(&k);
    }
}

fn vivo(key: &str) -> Result<Arc<Proceso>, Value> {
    PROCESOS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get(key)
        .cloned()
        .ok_or_else(|| fallo(format!("sin vista: {key}")))
}

fn sigue_vivo(proceso: &Proceso) -> bool {
    proceso
        .child
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .try_wait()
        .is_ok_and(|s| s.is_none())
}

// Tramo a tramo: en Windows la ruta sale con `\` en todo el camino, como la conoce Tinymist.
fn ruta_dentro(root: &Path, path: &str) -> Result<PathBuf, String> {
    if !path.to_ascii_lowercase().ends_with(".typ") {
        return Err(format!("no es typst: {path}"));
    }
    let mut destino = root.to_path_buf();
    for c in Path::new(path).components() {
        let Component::Normal(tramo) = c else {
            return Err(format!("fuera del árbol: {path}"));
        };
        destino.push(tramo);
    }
    Ok(destino)
}

fn uri_dentro(root: &Path, path: &str) -> Result<String, String> {
    let destino = ruta_dentro(root, path)?;
    Url::from_file_path(&destino)
        .map(|u| u.to_string())
        .map_err(|_| format!("ruta sin URI: {}", destino.display()))
}

fn arrancar(
    app: &AppHandle,
    key: &str,
    tinymist: &Path,
    paquetes: Option<PathBuf>,
    root: &Path,
    main: &str,
) -> Result<Arc<Proceso>, String> {
    let cwd = tempfile::tempdir().map_err(|e| e.to_string())?;
    // proceso largo: a propósito. Vive lo que la vista; lo apagan `detener` o el cierre de su stdin.
    let mut command = Command::new(tinymist);
    crate::util::no_console_window(&mut command)
        .arg("lsp")
        .current_dir(cwd.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Some(paquetes) = paquetes {
        command.env("TYPST_PACKAGE_CACHE_PATH", paquetes);
    }
    let mut child = command.spawn().map_err(|e| format!("tinymist: {e}"))?;
    #[cfg(windows)]
    huerfanos::asignar(&child);
    let stdin = child.stdin.take().ok_or("sin stdin")?;
    let stdout = child.stdout.take().ok_or("sin stdout")?;
    let principal = root.join(main);
    let proceso = Arc::new(Proceso {
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        pendientes: Mutex::new(HashMap::new()),
        siguiente: AtomicU64::new(1),
        root: root.to_path_buf(),
        main: Mutex::new(main.to_string()),
        puerto: AtomicU16::new(0),
        abiertos: Mutex::new(HashMap::new()),
        _cwd: cwd,
    });
    leer(app.clone(), key.to_string(), proceso.clone(), stdout);
    match iniciar(&proceso, root, &principal) {
        Ok(puerto) => {
            proceso.puerto.store(puerto, Ordering::Relaxed);
            Ok(proceso)
        }
        Err(e) => {
            let mut child = proceso.child.lock().unwrap_or_else(|p| p.into_inner());
            let _ = child.kill();
            let _ = child.wait();
            Err(e)
        }
    }
}

fn iniciar(proceso: &Proceso, root: &Path, principal: &Path) -> Result<u16, String> {
    let raiz = Url::from_directory_path(root)
        .map_err(|_| format!("raíz sin URI: {}", root.display()))?
        .to_string();
    pedir(
        proceso,
        "initialize",
        json!({
            "processId": std::process::id(),
            "rootUri": raiz,
            "workspaceFolders": [{"uri": raiz, "name": "tarea"}],
            "capabilities": {},
            "initializationOptions": {"compileStatus": "enable", "customizedShowDocument": true},
        }),
    )?;
    notificar(proceso, "initialized", json!({}))?;
    pedir(
        proceso,
        "workspace/executeCommand",
        json!({"command": "tinymist.pinMain", "arguments": [principal]}),
    )?;
    empezar_vista(proceso, principal)
}

fn cambiar_principal(proceso: &Proceso, principal: &Path) -> Result<(), String> {
    pedir(
        proceso,
        "workspace/executeCommand",
        json!({"command": "tinymist.doKillPreview", "arguments": [TAREA_DE_LA_VISTA]}),
    )?;
    pedir(
        proceso,
        "workspace/executeCommand",
        json!({"command": "tinymist.pinMain", "arguments": [principal]}),
    )?;
    let puerto = empezar_vista(proceso, principal)?;
    proceso.puerto.store(puerto, Ordering::Relaxed);
    Ok(())
}

fn empezar_vista(proceso: &Proceso, principal: &Path) -> Result<u16, String> {
    let vista = pedir(
        proceso,
        "workspace/executeCommand",
        json!({
            "command": "tinymist.doStartPreview",
            "arguments": [[
                "--task-id", TAREA_DE_LA_VISTA,
                "--data-plane-host", "127.0.0.1:0",
                "--partial-rendering", "true",
                "--no-open",
                principal,
            ]],
        }),
    )?;
    vista["staticServerPort"]
        .as_u64()
        .and_then(|p| u16::try_from(p).ok())
        .ok_or_else(|| format!("doStartPreview sin puerto: {vista}"))
}

fn detener(key: &str) {
    let Some(proceso) = PROCESOS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .remove(key)
    else {
        return;
    };
    let _ = pedir_con_plazo(&proceso, "shutdown", Value::Null, PLAZO_APAGADO);
    let _ = notificar(&proceso, "exit", Value::Null);
    let mut child = proceso.child.lock().unwrap_or_else(|p| p.into_inner());
    let limite = std::time::Instant::now() + PLAZO_APAGADO;
    while std::time::Instant::now() < limite {
        if child.try_wait().is_ok_and(|s| s.is_some()) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn escribir(proceso: &Proceso, mensaje: Value) -> Result<(), String> {
    let cuerpo = serde_json::to_vec(&mensaje).map_err(|e| e.to_string())?;
    let mut stdin = proceso.stdin.lock().unwrap_or_else(|p| p.into_inner());
    write!(stdin, "Content-Length: {}\r\n\r\n", cuerpo.len()).map_err(|e| e.to_string())?;
    stdin.write_all(&cuerpo).map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())
}

fn notificar(proceso: &Proceso, method: &str, params: Value) -> Result<(), String> {
    escribir(
        proceso,
        json!({"jsonrpc": "2.0", "method": method, "params": params}),
    )
}

fn pedir(proceso: &Proceso, method: &str, params: Value) -> Result<Value, String> {
    pedir_con_plazo(proceso, method, params, PLAZO_LSP)
}

fn pedir_con_plazo(
    proceso: &Proceso,
    method: &str,
    params: Value,
    plazo: Duration,
) -> Result<Value, String> {
    let id = proceso.siguiente.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel();
    proceso
        .pendientes
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .insert(id, tx);
    escribir(
        proceso,
        json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}),
    )?;
    let respuesta = rx.recv_timeout(plazo).map_err(|_| {
        proceso
            .pendientes
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&id);
        format!("{method}: sin respuesta en {} s", plazo.as_secs())
    })?;
    match respuesta.get("error") {
        Some(error) => Err(format!("{method}: {error}")),
        None => Ok(respuesta["result"].clone()),
    }
}

// Lee los mensajes de Tinymist hasta que cierra: respuestas a sus pendientes,
// peticiones suyas contestadas con `null`, errores y estado como eventos de la ventana.
fn leer(app: AppHandle, key: String, proceso: Arc<Proceso>, stdout: std::process::ChildStdout) {
    let raices = raices(&proceso.root);
    let _ = std::thread::Builder::new()
        .name("tinymist".into())
        .spawn(move || {
            let mut lector = BufReader::new(stdout);
            while let Some(mensaje) = siguiente_mensaje(&mut lector) {
                let id = mensaje.get("id").and_then(Value::as_u64);
                let method = mensaje.get("method").and_then(Value::as_str);
                match (id, method) {
                    (Some(_), Some(_)) => {
                        let _ = escribir(
                            &proceso,
                            json!({"jsonrpc": "2.0", "id": mensaje["id"], "result": Value::Null}),
                        );
                    }
                    (Some(id), None) => {
                        if let Some(tx) = proceso
                            .pendientes
                            .lock()
                            .unwrap_or_else(|p| p.into_inner())
                            .remove(&id)
                        {
                            let _ = tx.send(mensaje);
                        }
                    }
                    (None, Some("textDocument/publishDiagnostics")) => {
                        let _ = app.emit(
                            "typst-live",
                            diagnosticos(&key, &mensaje["params"], &raices),
                        );
                    }
                    (None, Some("tinymist/compileStatus")) => {
                        let params = &mensaje["params"];
                        let _ = app.emit(
                            "typst-live",
                            Aviso {
                                key: key.clone(),
                                kind: "status",
                                path: None,
                                diagnostics: Vec::new(),
                                status: params["status"].as_str().map(str::to_owned),
                                pages: params["pageCount"].as_u64(),
                                line: None,
                                column: None,
                            },
                        );
                    }
                    (None, Some("tinymist/preview/scrollSource")) => {
                        if let Some(aviso) = salto(&key, &mensaje["params"], &raices) {
                            let _ = app.emit("typst-live", aviso);
                        }
                    }
                    _ => {}
                }
            }
        });
}

fn siguiente_mensaje(lector: &mut impl BufRead) -> Option<Value> {
    let mut largo = None;
    loop {
        let mut linea = String::new();
        if lector.read_line(&mut linea).ok()? == 0 {
            return None;
        }
        let linea = linea.trim_end();
        if linea.is_empty() {
            break;
        }
        if let Some((nombre, valor)) = linea.split_once(':') {
            if nombre.eq_ignore_ascii_case("content-length") {
                largo = valor.trim().parse::<usize>().ok();
            }
        }
    }
    let mut cuerpo = vec![0; largo?];
    lector.read_exact(&mut cuerpo).ok()?;
    serde_json::from_slice(&cuerpo).ok()
}

// LSP cuenta líneas desde 0 y columnas en UTF-16; el editor espera las dos desde 1.
fn diagnosticos(key: &str, params: &Value, raices: &[PathBuf]) -> Aviso {
    let archivo = params["uri"]
        .as_str()
        .and_then(|u| Url::parse(u).ok())
        .and_then(|u| u.to_file_path().ok());
    let path = archivo
        .as_ref()
        .and_then(|a| relativa(&a.to_string_lossy(), raices));
    let diagnostics = params["diagnostics"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|d| {
            let severidad = d["severity"].as_u64().unwrap_or(1);
            if severidad > 2 {
                return None;
            }
            let mensaje = d["message"].as_str().unwrap_or_default().to_string();
            let inicio = &d["range"]["start"];
            let linea = inicio["line"].as_u64().map(|l| l as u32 + 1);
            let columna = inicio["character"].as_u64().map(|c| c as u32 + 1);
            let lugar = match (&path, linea, columna) {
                (Some(p), Some(l), Some(c)) => Some((p.clone(), l, c)),
                _ => None,
            };
            let mensaje = match (&lugar, &archivo, linea, columna) {
                (None, Some(a), Some(l), Some(c)) => format!("{}:{l}:{c}: {mensaje}", a.display()),
                _ => mensaje,
            };
            Some(Diagnostico::de_lsp(severidad == 1, lugar, mensaje))
        })
        .collect();
    Aviso {
        key: key.to_string(),
        kind: "diagnostics",
        path,
        diagnostics,
        status: None,
        pages: None,
        line: None,
        column: None,
    }
}

// El doble clic en la vista: Tinymist da la ruta absoluta y la posición desde 0.
fn salto(key: &str, params: &Value, raices: &[PathBuf]) -> Option<Aviso> {
    let path = relativa(params["filepath"].as_str()?, raices)?;
    let inicio = params["start"].as_array()?;
    let fila = inicio.first()?.as_u64()?;
    let columna = inicio.get(1)?.as_u64()?;
    Some(Aviso {
        key: key.to_string(),
        kind: "jump",
        path: Some(path),
        diagnostics: Vec::new(),
        status: None,
        pages: None,
        line: u32::try_from(fila + 1).ok(),
        column: u32::try_from(columna + 1).ok(),
    })
}

#[cfg(windows)]
mod huerfanos {
    //! Un Job Object con `KILL_ON_JOB_CLOSE`: si la ventana muere, Windows cierra
    //! su asa y mata a los Tinymist que quedaran.
    use std::os::windows::io::AsRawHandle;
    use std::sync::OnceLock;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    struct Trabajo(isize);
    static TRABAJO: OnceLock<Option<Trabajo>> = OnceLock::new();

    fn trabajo() -> Option<isize> {
        TRABAJO
            .get_or_init(|| unsafe {
                let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if job.is_null() {
                    return None;
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const std::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                (ok != 0).then_some(Trabajo(job as isize))
            })
            .as_ref()
            .map(|t| t.0)
    }

    pub fn asignar(child: &std::process::Child) {
        if let Some(job) = trabajo() {
            unsafe {
                AssignProcessToJobObject(
                    job as windows_sys::Win32::Foundation::HANDLE,
                    child.as_raw_handle() as windows_sys::Win32::Foundation::HANDLE,
                );
            }
        }
    }
}

// Lo que la vista usa de `environment/typst.rs`, que este build no compila.
const TOPE_DEL_MENSAJE: usize = 4_000;

#[derive(Serialize, Clone)]
pub struct Diagnostico {
    /// `"error"` | `"warning"`.
    severity: &'static str,
    /// Relativa a la carpeta de la tarea, con `/`. `None` sin lugar en la fuente.
    path: Option<String>,
    /// Desde 1.
    line: Option<u32>,
    /// Desde 1, en unidades UTF-16: las de CodeMirror y las del LSP.
    column: Option<u32>,
    message: String,
}

impl Diagnostico {
    /// Uno de Tinymist: el lugar ya resuelto a la carpeta de la tarea, o `None` y el lugar en el mensaje.
    pub fn de_lsp(error: bool, lugar: Option<(String, u32, u32)>, message: String) -> Self {
        let (path, line, column) = match lugar {
            Some((path, line, column)) => (Some(path), Some(line), Some(column)),
            None => (None, None, None),
        };
        Diagnostico {
            severity: if error { "error" } else { "warning" },
            path,
            line,
            column,
            message: recortar(message),
        }
    }
}

fn recortar(mut texto: String) -> String {
    if texto.len() > TOPE_DEL_MENSAJE {
        let mut corte = TOPE_DEL_MENSAJE;
        while !texto.is_char_boundary(corte) {
            corte -= 1;
        }
        texto.truncate(corte);
    }
    texto
}

fn raices(root: &Path) -> Vec<PathBuf> {
    let mut raices = vec![sin_verbatim(root)];
    if let Ok(canonica) = root.canonicalize() {
        raices.push(sin_verbatim(&canonica));
    }
    raices
}

fn sin_verbatim(path: &Path) -> PathBuf {
    let texto = path.to_string_lossy();
    PathBuf::from(texto.strip_prefix(r"\\?\").unwrap_or(&texto))
}

/// La ruta relativa a la carpeta de la tarea, con `/`; `None` si queda fuera de ella.
fn relativa(ruta: &str, raices: &[PathBuf]) -> Option<String> {
    if ruta.starts_with('@') {
        return None;
    }
    let limpia = sin_verbatim(Path::new(ruta));
    if !limpia.is_absolute() {
        let texto = limpia.to_string_lossy().replace('\\', "/");
        return Some(texto.strip_prefix("./").unwrap_or(&texto).to_string());
    }
    raices.iter().find_map(|raiz| {
        let dentro = limpia.strip_prefix(raiz).ok()?;
        let partes: Vec<_> = dentro
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect();
        (!partes.is_empty()).then(|| partes.join("/"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn las_etiquetas_salen_del_texto_aunque_no_compile() {
        let texto = "= Intro <sec-intro>\n#figure(image(\"a.png\"), caption: [Uno]) <fig-uno>\n\
                     Ver @fig-uno y #ref(<sec-intro>).\n$ x $ <eq:uno>\n@fig-\n<fig-uno>";
        assert_eq!(
            etiquetas(texto),
            ["sec-intro", "fig-uno", "eq:uno", "fig-uno"]
        );
        assert!(etiquetas("#cite(<knuth>) a <- b, x < 3 > 2").is_empty());
    }
}
