/**
 * Configuración → Secretos: las variables de entorno que el motor da a los
 * agentes (`env_secret`). Solo escritura: se ven nombre, alcance, fecha, los
 * últimos 4 y las máquinas; el valor nunca vuelve a la pantalla.
 *
 * - La ventana lee y escribe por el motor (`env_secrets_list`, `env_secret_set`,
 *   `env_secret_remove`, extensión `secrets_v1`); con el workspace en la cuenta el
 *   motor sube él mismo la copia sellada.
 * - La web escribe sellando en el navegador (`PUT …/credentials`), nunca por el relay.
 *
 * Trozo perezoso: lo carga quien abre la sección.
 */
import "../../../../../apps/desktop/src/locales/danilPhrases";
export { normalizeSecretName } from "./SecretsModel";
export { default } from "./SecretsList";
