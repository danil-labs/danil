// Una tarea › «Archivos de la tarea» › pestaña «Cambios».
const open = async (page) => {
  await page.getByRole("button", { name: "Alpha, ana@danil.ai", exact: true }).click({ timeout: 8000 });
  await page.getByText("Tarea de prueba", { exact: true }).first().click({ timeout: 8000 });
  await page.getByText("Respuesta del agente", { exact: true }).waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Archivos de la tarea", exact: true }).click({ timeout: 8000 });
  await page.getByRole("button", { name: "Cambios", exact: true }).click({ timeout: 8000 });
  await page.getByText("La tarea no ha cambiado nada todavía", { exact: true }).waitFor({ timeout: 8000 });
};

// Región: la conversación con su panel lateral; la barra de tareas a la izquierda se mide en «tarea».
export default { old: open, new: open, region: "[data-conversacion]" };
