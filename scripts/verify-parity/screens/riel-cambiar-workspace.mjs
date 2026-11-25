// Riel › cambiar de workspace: de «Alpha» a «Beta» (los dos de la organización Danil). Beta queda marcado y su
// barra de tareas se carga; el puntero sale del riel para que la etiqueta del cuadro no tape la captura.
const open = async (page) => {
  await page.getByRole("button", { name: "Alpha, ana@danil.ai", exact: true }).click({ timeout: 8000 });
  await page.getByText("Tarea de prueba", { exact: true }).first().waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Beta, ana@danil.ai", exact: true }).click({ timeout: 8000 });
  await page.locator("[aria-current=true]").getByText("B", { exact: true }).waitFor({ timeout: 8000 });
  await page.getByText("Tarea de prueba", { exact: true }).first().waitFor({ timeout: 8000 });
  await page.mouse.move(800, 700);
};

export default { old: open, new: open };
