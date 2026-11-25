// Una tarea › escribir «!ls -la» y pulsar «Ejecutar»: el borde simulado contesta `run_shell_command` y emite, solo
// entonces, los eventos `chat` del motor `shell_started` y `shell_output`; la tarjeta de la terminal muestra la salida
// con el comando todavía en marcha. Los eventos tardan unos 30 s (ver tarea-enviar-respuesta).
const open = async (page) => {
  await page.getByRole("button", { name: "Alpha, ana@danil.ai", exact: true }).click({ timeout: 8000 });
  await page.getByText("Tarea de prueba", { exact: true }).first().click({ timeout: 8000 });
  await page.getByText("Respuesta del agente", { exact: true }).waitFor({ timeout: 8000 });
  await page.getByRole("textbox", { name: "Pregunta algo · @ encargados, tareas, proyectos, archivos · / comandos", exact: true }).fill("!ls -la");
  await page.getByRole("button", { name: "Ejecutar", exact: true }).click({ timeout: 8000 });
  await page.getByText("total 8 -rw-r--r-- 1 ana staff 120 nov 21 10:00 README.md", { exact: true }).waitFor({ timeout: 45000 });
};

export default { old: open, new: open };
