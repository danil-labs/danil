/**
 * Tope del nombre de proyecto. Rust lo garantiza además
 * (`projects::project_name`); aquí solo orienta el campo mientras se escribe.
 * Sin el lado de Rust, un `invoke` desde otro sitio guarda lo que quiera.
 */
export const PROJECT_NAME_MAX_LENGTH = 30;

/**
 * Más largo que el de proyecto a propósito: el campo de renombrar llega relleno
 * con el título que escribe la app (`mentions::titulo_desde`, 60 caracteres) y
 * un tope de 30 lo rechazaría. Rust lo garantiza en `sessions::titulo_de_tarea`.
 */
export const SESSION_TITLE_MAX_LENGTH = 120;
