// Riel › «Agregar workspace»: la lista del catálogo de sesiones (`/v1/identity/sessions/catalog`).
const open = async (page) => {
  await page.getByRole("button", { name: "Agregar workspace", exact: true }).click({ timeout: 8000 });
  await page.getByRole("menu").getByText("Personal 2", { exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=menu]" };
