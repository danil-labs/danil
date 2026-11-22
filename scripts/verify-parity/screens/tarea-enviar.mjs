// Una tarea › escribir en el compositor y pulsar «Preguntar»: el turno de la persona aparece en la conversación.
// El borde simulado contesta `send_message` y `load_session` lo relee (como el motor, que lo persiste). La respuesta
// del agente no: llega por los eventos del motor, que el simulador no emite.
const open = async (page) => {
  await page.getByRole("button", { name: "Alpha, ana@danil.ai", exact: true }).click({ timeout: 8000 });
  await page.getByText("Tarea de prueba", { exact: true }).first().click({ timeout: 8000 });
  await page.getByText("Respuesta del agente", { exact: true }).waitFor({ timeout: 8000 });
  await page.getByRole("textbox", { name: "Pregunta algo · @ encargados, tareas, proyectos, archivos · / comandos", exact: true }).fill("Hola, agente");
  await page.getByRole("button", { name: "Preguntar", exact: true }).click({ timeout: 8000 });
  await page.getByText("Hola, agente", { exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open };
