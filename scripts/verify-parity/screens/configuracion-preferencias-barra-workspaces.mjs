// Configuración › Selector de workspace en la barra lateral (reemplazó a la pestaña Barra de workspaces en #1155).
const open = async (page) => {
  await page.getByRole("button", { name: "Configuración", exact: true }).first().click({ timeout: 8000 });
  await page.locator("[data-settings-workspace-selector]:visible").first().waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=dialog]" };
