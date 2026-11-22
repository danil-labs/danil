// Una tarea › «Archivos de la tarea» › pestaña «Archivos» (la del panel lateral al abrirlo).
const open = async (page) => {
  await page.getByRole("button", { name: "Alpha, ana@danil.ai", exact: true }).click({ timeout: 8000 });
  await page.getByText("Tarea de prueba", { exact: true }).first().click({ timeout: 8000 });
  await page.getByText("Respuesta del agente", { exact: true }).waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Archivos de la tarea", exact: true }).click({ timeout: 8000 });
  await page.getByRole("button", { name: "Archivos", exact: true }).click({ timeout: 8000 });
  await page.getByText("Este proyecto no tiene carpeta de trabajo.", { exact: true }).waitFor({ timeout: 8000 });
};

// Región: la conversación con su panel lateral; la barra de tareas a la izquierda se mide en «tarea».
export default { old: open, new: open, region: "[data-conversacion]" };
