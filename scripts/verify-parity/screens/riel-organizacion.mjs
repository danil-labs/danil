// Riel › menú de una organización: clic derecho en el workspace «Alpha» (abrir, administrar, ocultar, cuentas).
const open = async (page) => {
  await page.getByRole("button", { name: "Alpha, ana@danil.ai", exact: true }).click({ button: "right", timeout: 8000 });
  await page.getByRole("menu").getByText("Administrar workspaces", { exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=menu]" };
