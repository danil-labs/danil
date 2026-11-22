// Configuración › Cuentas de IA con una cuenta de Codex conectada (el borde simulado la tiene en el workspace Beta).
const open = async (page) => {
  await page.getByRole("button", { name: "Beta, ana@danil.ai", exact: true }).click({ timeout: 8000 });
  await page.getByText("Tarea de prueba", { exact: true }).first().waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Configuración", exact: true }).first().click({ timeout: 8000 });
  await page.getByRole("tab", { name: "Cuentas de IA", exact: true }).click({ timeout: 8000 });
  await page.getByRole("dialog").getByText("ana@danil.ai", { exact: true }).waitFor({ timeout: 8000 });
  await page.getByRole("dialog").getByText("Plus", { exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=dialog]" };
