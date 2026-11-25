// Configuración › General (el selector de idioma con Maayatʼaan embebido vive dentro de General desde #1154).
const open = async (page) => {
  await page.getByRole("button", { name: "Configuración", exact: true }).first().click({ timeout: 8000 });
  await page.getByRole("tab", { name: "General", exact: true }).click({ timeout: 8000 });
  await page.getByRole("tab", { name: "General", exact: true, selected: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=dialog]" };
