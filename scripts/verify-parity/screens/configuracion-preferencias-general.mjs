// Configuración › General: el engrane del riel y la entrada superior, por su nombre visible (#1153).
const open = async (page) => {
  await page.getByRole("button", { name: "Configuración", exact: true }).first().click({ timeout: 8000 });
  await page.getByRole("tab", { name: "General", exact: true }).click({ timeout: 8000 });
  await page.getByRole("tab", { name: "General", exact: true, selected: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=dialog]" };
