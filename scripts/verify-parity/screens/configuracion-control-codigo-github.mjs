// Configuración › Control git con GitHub conectado por la cuenta de Danil (el borde simulado lo tiene en Beta).
const open = async (page) => {
  await page.getByRole("button", { name: "Beta, ana@danil.ai", exact: true }).click({ timeout: 8000 });
  await page.getByText("Tarea de prueba", { exact: true }).first().waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Configuración", exact: true }).first().click({ timeout: 8000 });
  await page.getByRole("tab", { name: "Control git", exact: true }).click({ timeout: 8000 });
  await page.getByRole("dialog").getByText("danil-labs", { exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=dialog]" };
