// Configuración › Mantenimiento (Descarga se movió a entrada superior en #1151).
const open = async (page) => {
  await page.getByRole("button", { name: "Configuración", exact: true }).first().click({ timeout: 8000 });
  await page.getByRole("tab", { name: "Mantenimiento", exact: true }).click({ timeout: 8000 });
  await page.getByRole("tab", { name: "Mantenimiento", exact: true, selected: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=dialog]" };
