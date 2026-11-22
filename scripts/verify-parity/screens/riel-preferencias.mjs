// Riel › «Preferencias»: el menú de cuenta (tema, reportar un bug y cerrar sesión).
const open = async (page) => {
  await page.getByRole("button", { name: "Preferencias", exact: true }).click({ timeout: 8000 });
  await page.getByRole("dialog", { name: "Tu cuenta y preferencias", exact: true }).getByText("Cerrar sesión", { exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=dialog]" };
