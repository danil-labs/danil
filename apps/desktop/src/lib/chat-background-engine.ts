/**
 * El fondo de los chats es del workspace: su motor lo guarda
 * (`set_chat_background`) y lo devuelve al abrirlo (`chat_background`), aquí,
 * en la web y en el teléfono. `set_chat_background` reemplaza siempre el
 * patrón y el velo y deja la imagen salvo que llegue otra; la imagen se quita
 * con `choose_chat_background` sin ruta.
 *
 * La imagen elegida se reduce (`shrink-image.ts`) y viaja como `data:`. En la
 * web, la de un workspace de la cuenta se lee y se sube a la cuenta
 * (`capabilities().accountAssets`); el motor la baja al reconciliar.
 */
import { type ChatBackgroundChange, chatBackgroundView } from "@terminus/protocol";
import { blobToDataUrl } from "../features/settings/account-profile.ts";
import { VELO_DE_FONDO, VELO_DE_PANELES, VELO_DE_PESTANAS, fondoDe, type FondoDeChat } from "./chat-background.ts";
import * as store from "./chat-background-store.ts";
import { invoke } from "../engine/client.ts";
import { capabilities } from "./platform.ts";
import { shrinkImage } from "./shrink-image.ts";
import { errorCode, unknownCommand } from "./errorCode.ts";

/** El tope de un motor anterior: si lo rechaza, se reduce hasta ahí y se intenta otra vez. */
const TOPE_DE_MOTOR_ANTERIOR = 700_000;

const velos = () => ({ chat: store.veloDeFondo(), tabs: store.veloDePestanas(), panels: store.veloDePaneles() });


/** El motor o la cuenta rechazaron la imagen por su peso. */
function demasiadoGrande(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { what } = error as { what?: { clave?: unknown } };
  return what?.clave === "settings.appearance.background.too_big" || errorCode(error) === "image_too_large";
}

/** Guarda en el workspace; solo ante un motor que no conoce la orden pasa la imagen nueva por `choose_chat_background`. */
async function guardarEnElMotor(cambio: ChatBackgroundChange): Promise<unknown> {
  try {
    return await invoke<unknown>("set_chat_background", { ...cambio });
  } catch (error) {
    if (!unknownCommand(error)) throw error;
    if (cambio.path) await invoke("choose_chat_background", { path: cambio.path });
    else if (cambio.dataUrl) {
      const copia = await invoke<string>("import_chat_background_data", { dataUrl: cambio.dataUrl });
      await invoke("choose_chat_background", { path: copia });
    }
    return null;
  }
}

/**
 * En la web, el fondo de un workspace de la cuenta: su imagen manda; el patrón
 * y los velos son los del motor o, con la máquina apagada, los de la cuenta.
 * `null` si la cuenta no lo conoce.
 */
async function fondoDeLaCuenta(workspace: string | null, respuesta: unknown, sinMotor: boolean): Promise<unknown | null> {
  const cuenta = capabilities().accountAssets;
  if (!cuenta || !workspace) return null;
  const [imagen, ajuste] = await Promise.all([cuenta.read(workspace, "background"), cuenta.setting(workspace)]).catch(() => [undefined, null] as const);
  if (imagen === undefined) return null;
  const base = (sinMotor ? ajuste : respuesta) ?? {};
  const motor = (base as { data_url?: unknown }).data_url;
  return { preset: null, veil: null, ...base, data_url: imagen ?? (typeof motor === "string" ? motor : null) };
}

/** El patrón y los velos elegidos; nunca una ruta: la imagen guardada en el workspace queda. */
function eleccion(): ChatBackgroundChange {
  return { preset: store.fondoDeChat() === "propia" ? null : store.fondoDeChat(), veil: velos() };
}

let veloPendiente: ReturnType<typeof setTimeout> | null = null;

let lectura = 0;

/**
 * Al abrir un workspace: su fondo y sus velos, de su motor. Sin nada elegido
 * ni en el workspace ni en la máquina vuelve el patrón de la app, sin imagen y
 * con los velos de la app: nada se hereda del workspace anterior. Un motor que
 * no conoce la orden deja lo de esta ventana.
 */
export async function cargarFondoDelWorkspace(workspace: string | null): Promise<void> {
  const esta = ++lectura;
  // Antes de leer: aunque la lectura falle, lo que se importe después es de este workspace.
  store.setWorkspaceAbierto(workspace);
  let respuesta: unknown = null;
  let sinMotor = false;
  try {
    respuesta = await invoke<unknown>("chat_background");
  } catch {
    sinMotor = true;
  }
  if (esta !== lectura) return;
  const deLaCuenta = await fondoDeLaCuenta(workspace, respuesta, sinMotor);
  if (esta !== lectura) return;
  if (deLaCuenta) respuesta = deLaCuenta;
  else if (sinMotor) {
    store.setImagenDelWorkspace(null);
    return;
  }
  store.setImagenDelWorkspace(null);
  const vista = chatBackgroundView(respuesta);
  const r = (respuesta ?? {}) as { data_url?: unknown; veil?: unknown };
  // La copia local solo vale para el workspace donde se importó y mientras su motor la tenga.
  if (!r.data_url) store.olvidarFondoPropio();
  const nada = !r.data_url && !vista.preset && r.veil == null;
  if (nada) {
    store.elegirFondoDeChat("neutro");
    store.elegirVeloDeFondo(VELO_DE_FONDO);
    store.elegirVeloDePestanas(VELO_DE_PESTANAS);
    store.elegirVeloDePaneles(VELO_DE_PANELES);
    return;
  }
  store.setImagenDelWorkspace(vista.image);
  store.elegirFondoDeChat(vista.image ? "propia" : fondoDe(vista.preset));
  store.elegirVeloDeFondo(vista.veil.chat ?? VELO_DE_FONDO);
  if (vista.veil.tabs !== null) store.elegirVeloDePestanas(vista.veil.tabs);
  if (vista.veil.panels !== null) store.elegirVeloDePaneles(vista.veil.panels);
}

/** Lo elegido en Estilo, al workspace abierto. */
export function guardarFondo(): Promise<void> {
  return guardarEnElMotor(eleccion()).then(
    () => {},
    () => {},
  );
}

/** Quitar la imagen propia (lo pidió la persona): el workspace vuelve al patrón de la app. */
export async function quitarFondoPropio(): Promise<void> {
  const workspace = store.workspaceAbierto();
  const cuenta = capabilities().accountAssets;
  if (cuenta && workspace) await cuenta.remove(workspace, "background").catch(() => false);
  await invoke("choose_chat_background", { path: null }).catch(() => {});
  await guardarFondo();
}

/**
 * La imagen que eligió la persona, reducida, al workspace abierto: en la web,
 * a la cuenta si el workspace está en ella; si no, a su motor como `data:`.
 * Un motor anterior que la rechaza por su peso la recibe reducida a su tope.
 */
export async function elegirFondoPropio(archivo: Blob): Promise<FondoDeChat> {
  const imagen = await shrinkImage(archivo);
  try {
    return await subirFondo(imagen);
  } catch (error) {
    if (!demasiadoGrande(error) || imagen.size <= TOPE_DE_MOTOR_ANTERIOR) throw error;
    return subirFondo(await shrinkImage(archivo, TOPE_DE_MOTOR_ANTERIOR));
  }
}

async function subirFondo(imagen: Blob): Promise<FondoDeChat> {
  const workspace = store.workspaceAbierto();
  const dataUrl = await blobToDataUrl(imagen);
  const cuenta = capabilities().accountAssets;
  const enLaCuenta = !!cuenta && !!workspace && (await cuenta.put(workspace, "background", imagen));
  const respuesta = enLaCuenta ? null : await guardarEnElMotor({ ...eleccion(), preset: null, dataUrl });
  // Se cambió de workspace mientras se guardaba: la imagen es del anterior y no se pinta aquí.
  if (store.workspaceAbierto() !== workspace) return store.fondoDeChat();
  store.olvidarFondoPropio();
  store.setImagenDelWorkspace(chatBackgroundView(respuesta).image ?? dataUrl);
  const fondo = store.elegirFondoDeChat("propia");
  // El patrón y los velos siguen yendo al motor, si está encendido.
  if (enLaCuenta) void guardarFondo();
  return fondo;
}

/** Los deslizadores cambian a cada paso: al motor va el último, un momento después. */
export function guardarVelos() {
  if (veloPendiente) clearTimeout(veloPendiente);
  veloPendiente = setTimeout(() => {
    veloPendiente = null;
    void guardarFondo();
  }, 400);
}
