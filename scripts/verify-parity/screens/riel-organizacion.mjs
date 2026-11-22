// Riel › menú de una organización: clic derecho en el workspace «Alpha» (#1098,
// `packages/shell/src/shell/OrganizationAccountMenu.tsx`): abrir, mover, ocultar y «Quitar workspace…».
const open = async (page) => {
  await page.getByRole("button", { name: "Alpha, ana@danil.ai", exact: true }).click({ button: "right", timeout: 8000 });
  await page.getByRole("menu").getByText("Quitar workspace…", { exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=menu]" };
