// Configuración › Apariencia (Estilo se promovió a entrada superior en #1153).
const open = async (page) => {
  await page.getByRole("button", { name: "Configuración", exact: true }).first().click({ timeout: 8000 });
  await page.getByRole("tab", { name: "Apariencia", exact: true }).click({ timeout: 8000 });
  await page.getByRole("tab", { name: "Apariencia", exact: true, selected: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=dialog]" };
