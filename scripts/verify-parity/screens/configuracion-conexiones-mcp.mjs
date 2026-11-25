// Configuración › Conexiones › MCP: el engrane del riel, la entrada y su pestaña, por su nombre visible.
const open = async (page) => {
  await page.getByRole("button", { name: "Configuración", exact: true }).first().click({ timeout: 8000 });
  await page.getByRole("tab", { name: "Conectores", exact: true }).click({ timeout: 8000 });
  await page.getByRole("tab", { name: "MCP", exact: true }).click({ timeout: 8000 });
  await page.getByRole("tab", { name: "MCP", exact: true, selected: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=dialog]" };
