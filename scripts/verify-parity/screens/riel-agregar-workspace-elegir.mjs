// Riel › «+» › «Inicia sesión y elige uno»: la lista de workspaces de las sesiones abiertas, con su organización
// (`packages/shell/src/shell/AddWorkspaceMenu.tsx`).
const open = async (page) => {
  await page.getByRole("button", { name: "Agregar workspace", exact: true }).click({ timeout: 8000 });
  await page.getByRole("menu").getByText("Inicia sesión y elige uno", { exact: true }).click({ timeout: 8000 });
  await page.getByText("Personal 2", { exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open };
