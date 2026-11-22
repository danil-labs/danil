/**
 * Las IA que se conectan en el alta: qué hay en esta computadora, qué está
 * conectado en el workspace activo y en qué paso va cada conexión. El mapa y el
 * panel leen el mismo estado; las cuentas cuelgan del workspace activo.
 */

import { type Fila, nombreDeFila } from "./connect-rows";
import { crearCargaDeConexiones } from "./connect-load";
import { crearConsentimiento } from "./connect-consent";
import { crearEntradaDeConexiones } from "./connect-login";
import { crearEstadoDeConexiones } from "./connect-state";
import "../../../../../apps/desktop/src/locales/settingsPhrases";

export type { Fila, Paso } from "./connect-rows";
export { AL_FINAL, explicar, nombreDeFila, openExternal, ordenDelMapa } from "./connect-rows";

export function crearConexiones() {
  const estado = crearEstadoDeConexiones();
  const { filas, pregunta, guardando, pasos, errores, salidas, falloDeCarga, cargada, setErrores } = estado;
  const carga = crearCargaDeConexiones(estado);
  const { agente, cargar, cancelarDescarga } = carga;
  const { preguntar, responder } = crearConsentimiento(estado, carga);
  const { conectar, usarSesion, cancelar, enviarCodigo, revisarAlta, abrirAlta, guardarClave, desconectar } =
    crearEntradaDeConexiones(estado, carga, preguntar);

  const conectadas = () => filas().filter((f) => pasos[f.id]?.k === "conectada");

  return {
    filas,
    pregunta,
    guardando,
    responder,
    pasos,
    errores,
    salidas,
    falloDeCarga,
    cargada,
    conectadas,
    nombre: nombreDeFila,
    /** Su CLI se instala desde la página del fabricante, no lo baja Terminus. */
    externa: (f: Fila) => Boolean(agente(f.agente)?.external_install_url && !agente(f.agente)?.available),
    cargar,
    conectar,
    usarSesion,
    cancelarDescarga,
    cancelar,
    enviarCodigo,
    revisarAlta,
    abrirAlta,
    guardarClave,
    desconectar,
    limpiarError: (id: string) => setErrores(id, null),
  };
}

export type Conexiones = ReturnType<typeof crearConexiones>;
