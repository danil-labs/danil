// Una tarea › el compositor en modo terminal: un mensaje que empieza con «!» cambia la etiqueta a «terminal» y el
// botón a «Ejecutar». Correr el comando y ver su salida necesita el motor (`run_shell_command` y sus eventos).
const open = async (page) => {
  await page.getByRole("button", { name: "Alpha, ana@danil.ai", exact: true }).click({ timeout: 8000 });
  await page.getByText("Tarea de prueba", { exact: true }).first().click({ timeout: 8000 });
  await page.getByText("Respuesta del agente", { exact: true }).waitFor({ timeout: 8000 });
  await page.getByRole("textbox", { name: "Pregunta algo · @ encargados, tareas, proyectos, archivos · / comandos", exact: true }).fill("!ls -la");
  await page.getByRole("button", { name: "Ejecutar", exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open };
