// Riel › «Agregar workspace»: el menú del «+» (#1098, `packages/shell/src/shell/AddWorkspaceMenu.tsx`):
// «Agregar workspace» con «Inicia sesión y elige uno», y «Crear workspace» según el plan.
const open = async (page) => {
  await page.getByRole("button", { name: "Agregar workspace", exact: true }).click({ timeout: 8000 });
  await page.getByRole("menu").getByText("Inicia sesión y elige uno", { exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=menu]" };
