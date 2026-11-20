/**
 * Lo que la ventana ya usa y el motor todavía no publica en su contrato.
 *
 * Los guardas `commands` y `bridge` aceptan estos nombres sin que estén en
 * `commands.json`, cada uno con lo que lo trae. Cuando el contrato copiado ya
 * los tiene, la entrada sobra y los guardas fallan hasta quitarla: esta lista
 * solo se vacía.
 */
export const COMANDOS_PENDIENTES = {
  // Nombre provisional: el estado de la adopción que hace el motor (`engine_adoption_v1`, T5).
  adoption_status: "danil-engine: adopción en el motor (decisión sesión en el motor § 2.5)",
};

export const EVENTOS_PENDIENTES = {
  // Nombre provisional: cada cambio de la adopción que hace el motor.
  "adoption.changed": "danil-engine: adopción en el motor (decisión sesión en el motor § 2.5)",
};
